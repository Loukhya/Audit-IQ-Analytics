import math
import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import io, csv, json
from utils import state, cache_manager

router = APIRouter()

DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _prepare(df):
    """Return a copy with derived time columns. Never mutate state."""
    d = df.copy()
    d["step"] = pd.to_numeric(d["step"], errors="coerce").fillna(1).astype(int)
    d["amount"] = pd.to_numeric(d["amount"], errors="coerce").fillna(0)
    d["isFraud"] = pd.to_numeric(d["isFraud"], errors="coerce").fillna(0).astype(int)
    d["hour_of_day"] = (d["step"] - 1) % 24
    d["day_of_month"] = (d["step"] - 1) // 24 + 1
    d["day_of_week"] = ((d["step"] - 1) // 24) % 7
    d["is_weekend"] = d["day_of_week"] >= 5
    d["is_late_night"] = (d["hour_of_day"] >= 22) | (d["hour_of_day"] <= 5)
    d["is_end_of_month"] = d["day_of_month"] >= 28
    return d


def _flag_anomalous(series, metric="fraud_rate"):
    """Flag rows where metric > mean + 2*std."""
    m = series[metric]
    mean_v = m.mean()
    std_v = m.std() if len(m) > 1 else 0
    thresh = mean_v + 2 * std_v
    return m > thresh


def _safe(v):
    """Convert numpy types for JSON."""
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        return float(v)
    if isinstance(v, (np.bool_,)):
        return bool(v)
    return v


# ───────────── GET /temporal/analysis ─────────────

@router.get("/analysis")
def temporal_analysis():
    df = state.data.get("df")
    if df is None:
        raise HTTPException(status_code=400, detail="No dataset loaded")

    d = _prepare(df)
    total = len(d)
    overall_fraud_rate = float(d["isFraud"].mean()) if total else 0

    # ── Step 2: Hourly aggregation ──
    hourly_agg = d.groupby("hour_of_day").agg(
        total_count=("step", "count"),
        fraud_count=("isFraud", "sum"),
        total_amount=("amount", "sum"),
        avg_amount=("amount", "mean"),
    ).reset_index()
    hourly_agg["fraud_rate"] = hourly_agg["fraud_count"] / hourly_agg["total_count"].replace(0, 1)
    hourly_agg["is_anomalous"] = _flag_anomalous(hourly_agg, "fraud_rate") | _flag_anomalous(hourly_agg, "total_count")
    anomalous_hours = hourly_agg[hourly_agg["is_anomalous"]]["hour_of_day"].tolist()

    hourly_list = []
    for _, r in hourly_agg.iterrows():
        hourly_list.append({k: _safe(r[k]) for k in ["hour_of_day", "total_count", "fraud_count", "fraud_rate", "total_amount", "is_anomalous"]})

    # ── Step 3: Daily aggregation ──
    daily_agg = d.groupby("day_of_month").agg(
        total_count=("step", "count"),
        fraud_count=("isFraud", "sum"),
        total_amount=("amount", "sum"),
    ).reset_index()
    daily_agg["fraud_rate"] = daily_agg["fraud_count"] / daily_agg["total_count"].replace(0, 1)
    daily_agg["is_anomalous"] = _flag_anomalous(daily_agg, "fraud_rate") | _flag_anomalous(daily_agg, "total_count")
    anomalous_days = daily_agg[daily_agg["is_anomalous"]]["day_of_month"].tolist()

    daily_list = []
    for _, r in daily_agg.iterrows():
        daily_list.append({k: _safe(r[k]) for k in ["day_of_month", "total_count", "fraud_count", "fraud_rate", "total_amount", "is_anomalous"]})

    # ── Step 4: Day of week ──
    dow_agg = d.groupby("day_of_week").agg(
        total_count=("step", "count"),
        fraud_count=("isFraud", "sum"),
    ).reset_index()
    dow_agg["fraud_rate"] = dow_agg["fraud_count"] / dow_agg["total_count"].replace(0, 1)
    dow_agg["is_weekend"] = dow_agg["day_of_week"] >= 5

    weekday_rate = float(dow_agg[~dow_agg["is_weekend"]]["fraud_rate"].mean()) if len(dow_agg[~dow_agg["is_weekend"]]) else 0
    weekend_rate = float(dow_agg[dow_agg["is_weekend"]]["fraud_rate"].mean()) if len(dow_agg[dow_agg["is_weekend"]]) else 0
    weekend_uplift = round(weekend_rate / weekday_rate, 2) if weekday_rate > 0 else 1.0

    dow_list = []
    for _, r in dow_agg.iterrows():
        dow_list.append({"day_index": _safe(r["day_of_week"]), "day_name": DAY_NAMES[int(r["day_of_week"])], "total_count": _safe(r["total_count"]), "fraud_count": _safe(r["fraud_count"]), "fraud_rate": _safe(r["fraud_rate"]), "is_weekend": bool(r["is_weekend"])})

    # ── Step 5: Heatmap ──
    hm = d.groupby(["day_of_week", "hour_of_day"]).agg(total=("step", "count"), fraud=("isFraud", "sum")).reset_index()
    hm["rate"] = hm["fraud"] / hm["total"].replace(0, 1)
    # fill missing cells
    heatmap_list = []
    hm_dict = {}
    for _, r in hm.iterrows():
        hm_dict[(int(r["day_of_week"]), int(r["hour_of_day"]))] = {"total": _safe(r["total"]), "fraud": _safe(r["fraud"]), "rate": _safe(r["rate"])}
    for day in range(7):
        for hour in range(24):
            cell = hm_dict.get((day, hour), {"total": 0, "fraud": 0, "rate": 0.0})
            heatmap_list.append({"day": day, "hour": hour, **cell})

    # ── Step 6: Burst detection ──
    burst_accounts = []
    if "nameOrig" in d.columns:
        grouped = d.sort_values("step").groupby("nameOrig")
        burst_data = []
        for name, grp in grouped:
            if len(grp) < 2:
                continue
            steps = grp["step"].values
            pairs = sum(1 for i in range(1, len(steps)) if steps[i] - steps[i - 1] <= 2)
            if pairs >= 3:
                burst_data.append({"account": name, "burst_pairs": int(pairs), "total_txns": int(len(grp)), "fraud_txns": int(grp["isFraud"].sum())})
        burst_data.sort(key=lambda x: x["burst_pairs"], reverse=True)
        burst_accounts = burst_data[:20]

    # ── Step 7: Late night ──
    ln = d[d["is_late_night"]]
    ln_count = int(len(ln))
    ln_fraud = int(ln["isFraud"].sum())
    ln_rate = ln_fraud / ln_count if ln_count else 0
    ln_pct = ln_count / total if total else 0
    ln_uplift = round(ln_rate / overall_fraud_rate, 2) if overall_fraud_rate > 0 else 1.0
    late_night = {"count": ln_count, "fraud_count": ln_fraud, "fraud_rate": round(ln_rate, 6), "pct_of_total": round(ln_pct, 4), "uplift": ln_uplift}

    # ── Step 8: End of month ──
    eom = d[d["is_end_of_month"]]
    eom_count = int(len(eom))
    eom_fraud = int(eom["isFraud"].sum())
    eom_rate = eom_fraud / eom_count if eom_count else 0
    eom_uplift = round(eom_rate / overall_fraud_rate, 2) if overall_fraud_rate > 0 else 1.0
    end_of_month = {"count": eom_count, "fraud_count": eom_fraud, "fraud_rate": round(eom_rate, 6), "pct_of_total": round(eom_count / total, 4) if total else 0, "uplift": eom_uplift}

    # ── Step 9: Peak windows ──
    mean_fr = float(hm["rate"].mean()) if len(hm) else 0.001
    peak_candidates = []
    for _, r in hm.iterrows():
        score = (float(r["rate"]) / mean_fr if mean_fr > 0 else 0) * math.log(float(r["total"]) + 1)
        if float(r["total"]) > 0:
            peak_candidates.append({"day_name": DAY_NAMES[int(r["day_of_week"])], "hour": int(r["hour_of_day"]), "fraud_rate": round(float(r["rate"]), 4), "total_count": int(r["total"]), "fraud_count": int(r["fraud"]), "anomaly_score": round(score, 4)})
    peak_candidates.sort(key=lambda x: x["anomaly_score"], reverse=True)
    peak_windows = peak_candidates[:5]

    peak_label = ""
    if peak_windows:
        pw = peak_windows[0]
        mult = round(pw["fraud_rate"] / overall_fraud_rate, 1) if overall_fraud_rate else 0
        peak_label = f"{pw['day_name']} {pw['hour']:02d}:00 — {mult}x above average"

    res = {
        "summary": {
            "total_transactions": total,
            "overall_fraud_rate": round(overall_fraud_rate, 6),
            "late_night_uplift": ln_uplift,
            "weekend_uplift": weekend_uplift,
            "end_of_month_uplift": eom_uplift,
            "anomalous_hours": [int(h) for h in anomalous_hours],
            "anomalous_days": [int(dd) for dd in anomalous_days],
            "burst_accounts_found": len(burst_accounts),
            "peak_fraud_window": peak_label,
        },
        "hourly": hourly_list,
        "daily": daily_list,
        "day_of_week": dow_list,
        "heatmap": heatmap_list,
        "burst_accounts": burst_accounts,
        "late_night": late_night,
        "end_of_month": end_of_month,
        "peak_windows": peak_windows,
    }
    cache_manager.save_cache("temporal_analysis", res)
    return res


# ───────────── GET /temporal/flagged-transactions ─────────────

@router.get("/flagged-transactions")
def flagged_transactions():
    df = state.data.get("df")
    if df is None:
        raise HTTPException(status_code=400, detail="No dataset loaded")

    # Run analysis to get anomalous hours and burst accounts
    analysis = temporal_analysis()
    anom_hours = set(analysis["summary"]["anomalous_hours"])
    burst_accts = set(a["account"] for a in analysis["burst_accounts"])

    d = _prepare(df)
    mask = (
        d["hour_of_day"].isin(anom_hours)
        | ((d["is_late_night"]) & (d["isFraud"] == 1))
        | ((d["is_end_of_month"]) & (d["isFraud"] == 1))
    )
    if "nameOrig" in d.columns and burst_accts:
        mask = mask | d["nameOrig"].isin(burst_accts)

    flagged = d[mask].head(500)
    cols = [c for c in flagged.columns if c in ["step", "type", "amount", "nameOrig", "nameDest", "isFraud", "isFlaggedFraud", "hour_of_day", "day_of_week", "is_late_night"]]
    records = []
    for _, row in flagged[cols].iterrows():
        rec = {}
        for c in cols:
            v = row[c]
            rec[c] = _safe(v) if not pd.isna(v) else None
        records.append(rec)

    # Return as JSON for the frontend; also support CSV download via query param
    return records


@router.get("/status")
def temporal_status():
    cached = cache_manager.load_cache("temporal_analysis")
    if cached:
        return {
            "run": True,
            "peak_window": cached.get("summary", {}).get("peak_fraud_window", ""),
            "late_night_uplift": cached.get("summary", {}).get("late_night_uplift", 0),
            "weekend_uplift": cached.get("summary", {}).get("weekend_uplift", 0),
        }
    return {"run": False, "peak_window": None, "late_night_uplift": None, "weekend_uplift": None}
