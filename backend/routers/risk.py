import io
import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from utils import state, cache_manager

router = APIRouter()

# ═══════════════════════════════════════════
# SCORING FACTORS & WEIGHTS (sum = 100)
# ═══════════════════════════════════════════

TYPE_RISK_MAP = {
    "TRANSFER": 15,
    "CASH_OUT": 12,
    "CASH-OUT": 12,
    "DEBIT": 6,
    "PAYMENT": 3,
    "CASH_IN": 0,
    "CASH-IN": 0,
}

FACTOR_MAX_WEIGHTS = {
    "amount_deviation": 25,
    "type_risk": 15,
    "balance_inconsistency": 20,
    "temporal_risk": 15,
    "round_number": 10,
    "dest_account": 5,
    "account_velocity": 10,
}


def _compute_risk_scores(df: pd.DataFrame) -> pd.DataFrame:
    """Compute all 7 risk factor scores for every transaction."""
    scored = df.copy()

    # ── Factor 1: Amount Deviation (25 pts) ──
    type_stats = scored.groupby("type")["amount"].agg(["mean", "std"]).to_dict(orient="index")
    amount_dev_scores = []
    for _, row in scored.iterrows():
        t = row["type"]
        stats = type_stats.get(t, {"mean": 0, "std": 1})
        std = stats["std"] if stats["std"] and stats["std"] > 0 else 1
        z = abs(row["amount"] - stats["mean"]) / std
        if z <= 1.0:
            s = 0
        elif z <= 2.0:
            s = 6
        elif z <= 3.0:
            s = 12
        elif z <= 4.0:
            s = 18
        else:
            s = 25
        amount_dev_scores.append(s)
    scored["f_amount_deviation"] = amount_dev_scores

    # ── Factor 2: Transaction Type Risk (15 pts) ──
    scored["f_type_risk"] = scored["type"].map(TYPE_RISK_MAP).fillna(0).astype(int)

    # ── Factor 3: Balance Inconsistency (20 pts) ──
    expected = scored["oldbalanceOrg"] - scored["amount"]
    discrepancy = (expected - scored["newbalanceOrig"]).abs()
    conditions = [
        discrepancy == 0,
        discrepancy <= 1,
        discrepancy <= 100,
        discrepancy <= 1000,
        discrepancy > 1000,
    ]
    choices = [0, 5, 10, 15, 20]
    scored["f_balance_inconsistency"] = np.select(conditions, choices, default=0).astype(int)
    # Special case: spending from empty account
    empty_acct = (scored["oldbalanceOrg"] == 0) & (scored["amount"] > 0)
    scored.loc[empty_acct, "f_balance_inconsistency"] = (
        scored.loc[empty_acct, "f_balance_inconsistency"] + 5
    ).clip(upper=20)

    # ── Factor 4: Temporal Risk (15 pts) ──
    hour = (scored["step"] - 1) % 24
    day_of_week = ((scored["step"] - 1) // 24) % 7
    day_of_month = ((scored["step"] - 1) // 24) + 1
    temporal = np.zeros(len(scored), dtype=int)
    late_night = (hour >= 22) | (hour <= 5)
    temporal = temporal + np.where(late_night, 8, 0)
    weekend = day_of_week >= 5
    temporal = temporal + np.where(weekend, 4, 0)
    end_month = day_of_month >= 28
    temporal = temporal + np.where(end_month, 3, 0)
    scored["f_temporal_risk"] = np.minimum(temporal, 15)

    # ── Factor 5: Round Number Detection (10 pts) ──
    amt = scored["amount"]
    round_scores = np.where(
        amt % 10000 == 0, 10,
        np.where(amt % 1000 == 0, 7,
                 np.where(amt % 100 == 0, 4,
                          np.where(amt % 10 == 0, 2, 0)))
    )
    scored["f_round_number"] = round_scores

    # ── Factor 6: Destination Account Type (5 pts) ──
    dest_scores = []
    for _, row in scored.iterrows():
        nd = str(row.get("nameDest", ""))
        if nd.startswith("M"):
            dest_scores.append(2)
        elif nd.startswith("C"):
            if row["type"] == "TRANSFER":
                dest_scores.append(5)
            else:
                dest_scores.append(0)
        else:
            dest_scores.append(0)
    scored["f_dest_account"] = dest_scores

    # ── Factor 7: Account Velocity (10 pts) ──
    acct_counts = scored["nameOrig"].value_counts().to_dict()
    velocity_scores = scored["nameOrig"].map(acct_counts).fillna(0)
    scored["f_account_velocity"] = np.where(
        velocity_scores <= 2, 0,
        np.where(velocity_scores <= 5, 3,
                 np.where(velocity_scores <= 10, 6, 10))
    )

    # ── Final Score ──
    factor_cols = [
        "f_amount_deviation", "f_type_risk", "f_balance_inconsistency",
        "f_temporal_risk", "f_round_number", "f_dest_account", "f_account_velocity"
    ]
    scored["raw_score"] = scored[factor_cols].sum(axis=1)
    scored["final_score"] = scored["raw_score"].clip(upper=100)

    # If isFraud = 1 → minimum score of 60
    fraud_mask = scored["isFraud"] == 1
    scored.loc[fraud_mask, "final_score"] = scored.loc[fraud_mask, "final_score"].clip(lower=60)

    # Risk band
    scored["risk_band"] = pd.cut(
        scored["final_score"],
        bins=[-1, 24, 49, 74, 100],
        labels=["LOW", "MEDIUM", "HIGH", "CRITICAL"],
    )

    return scored


def _build_response(scored: pd.DataFrame) -> dict:
    """Build the full JSON response from scored DataFrame."""
    total = len(scored)

    # Score distribution
    dist = scored["risk_band"].value_counts().to_dict()
    for band in ["LOW", "MEDIUM", "HIGH", "CRITICAL"]:
        dist.setdefault(band, 0)
    dist_pct = {k: round(v / total * 100, 2) if total else 0 for k, v in dist.items()}

    mean_score = round(float(scored["final_score"].mean()), 2)
    median_score = round(float(scored["final_score"].median()), 2)
    high_critical = int(dist.get("HIGH", 0) + dist.get("CRITICAL", 0))
    high_critical_pct = round(high_critical / total * 100, 2) if total else 0

    fraud_rows = scored[scored["isFraud"] == 1]
    legit_rows = scored[scored["isFraud"] == 0]
    fraud_mean = round(float(fraud_rows["final_score"].mean()), 2) if len(fraud_rows) else 0
    legit_mean = round(float(legit_rows["final_score"].mean()), 2) if len(legit_rows) else 0
    separation = round(fraud_mean - legit_mean, 2)

    summary = {
        "total_scored": total,
        "score_distribution": dist,
        "score_distribution_pct": dist_pct,
        "mean_score": mean_score,
        "median_score": median_score,
        "high_critical_count": high_critical,
        "high_critical_pct": high_critical_pct,
        "confirmed_fraud_mean_score": fraud_mean,
        "legitimate_mean_score": legit_mean,
        "score_separation": separation,
    }

    # Factor analysis
    factor_info = {
        "amount_deviation": {"col": "f_amount_deviation", "max": 25, "threshold": 12},
        "type_risk": {"col": "f_type_risk", "max": 15, "threshold": 12},
        "balance_inconsistency": {"col": "f_balance_inconsistency", "max": 20, "threshold": 12},
        "temporal_risk": {"col": "f_temporal_risk", "max": 15, "threshold": 12},
        "round_number": {"col": "f_round_number", "max": 10, "threshold": 12},
        "dest_account": {"col": "f_dest_account", "max": 5, "threshold": 12},
        "account_velocity": {"col": "f_account_velocity", "max": 10, "threshold": 12},
    }
    factor_analysis = {}
    for name, info in factor_info.items():
        col = info["col"]
        vals = scored[col]
        threshold = info["threshold"]
        factor_analysis[name] = {
            "mean_contribution": round(float(vals.mean()), 2),
            "max_contribution": int(vals.max()),
            "pct_transactions_scoring_above_12": round(
                float((vals > threshold).sum() / total * 100), 2
            ) if total else 0,
        }

    # Top 100 critical transactions
    top = scored.nlargest(100, "final_score")
    top_critical = []
    for rank, (_, row) in enumerate(top.iterrows(), 1):
        hour = (int(row["step"]) - 1) % 24
        day = ((int(row["step"]) - 1) // 24) + 1
        top_critical.append({
            "rank": rank,
            "nameOrig": str(row["nameOrig"]),
            "nameDest": str(row["nameDest"]),
            "type": str(row["type"]),
            "amount": round(float(row["amount"]), 2),
            "step": int(row["step"]),
            "hour": hour,
            "day": day,
            "final_score": round(float(row["final_score"]), 2),
            "risk_band": str(row["risk_band"]),
            "isFraud": int(row["isFraud"]),
            "oldbalanceOrg": round(float(row["oldbalanceOrg"]), 2),
            "newbalanceOrig": round(float(row["newbalanceOrig"]), 2),
            "oldbalanceDest": round(float(row["oldbalanceDest"]), 2),
            "newbalanceDest": round(float(row["newbalanceDest"]), 2),
            "factor_breakdown": {
                "amount_deviation": int(row["f_amount_deviation"]),
                "type_risk": int(row["f_type_risk"]),
                "balance_inconsistency": int(row["f_balance_inconsistency"]),
                "temporal_risk": int(row["f_temporal_risk"]),
                "round_number": int(row["f_round_number"]),
                "dest_account": int(row["f_dest_account"]),
                "account_velocity": int(row["f_account_velocity"]),
            },
        })

    # Score histogram (buckets 0-9, 10-19, ..., 90-100)
    bins = list(range(0, 100, 10)) + [100]
    labels = [f"{b}-{b+9}" for b in range(0, 90, 10)] + ["90-100"]
    scored["_bucket"] = pd.cut(scored["final_score"], bins=bins, labels=labels, include_lowest=True)
    histogram = []
    bucket_counts = scored["_bucket"].value_counts()
    for label in labels:
        histogram.append({"bucket": label, "count": int(bucket_counts.get(label, 0))})
    scored.drop(columns=["_bucket"], inplace=True)

    # Risk by type
    risk_by_type = {}
    for t, group in scored.groupby("type"):
        hc = int(((group["risk_band"] == "HIGH") | (group["risk_band"] == "CRITICAL")).sum())
        risk_by_type[str(t)] = {
            "mean_score": round(float(group["final_score"].mean()), 2),
            "high_critical_pct": round(hc / len(group) * 100, 2) if len(group) else 0,
            "count": len(group),
        }

    return {
        "summary": summary,
        "factor_analysis": factor_analysis,
        "top_critical": top_critical,
        "score_histogram": histogram,
        "risk_by_type": risk_by_type,
    }


# ──────────────────────────────────────────
# GET /risk/status
# ──────────────────────────────────────────
@router.get("/status")
def risk_status():
    cached = cache_manager.load_cache("risk_scoring")
    if cached:
        return {
            "run": True,
            "critical_count": cached.get("summary", {}).get("high_critical_count", 0),
            "mean_score": cached.get("summary", {}).get("mean_score", 0),
        }
    return {"run": False, "critical_count": None, "mean_score": None}


# ──────────────────────────────────────────
# GET /risk/score
# ──────────────────────────────────────────
@router.get("/score")
def risk_score():
    if state.data["df"] is None:
        raise HTTPException(status_code=400, detail="No dataset loaded. Upload a CSV first.")

    df = state.data["df"]
    scored = _compute_risk_scores(df)

    # Cache scored df in state for other endpoints
    state.data["scored_df"] = scored

    result = _build_response(scored)
    cache_manager.save_cache("risk_scoring", result)
    return result


# ──────────────────────────────────────────
# GET /risk/transaction/{nameOrig}
# ──────────────────────────────────────────
@router.get("/transaction/{nameOrig}")
def risk_transaction(nameOrig: str):
    if state.data["df"] is None:
        raise HTTPException(status_code=400, detail="No dataset loaded.")

    # Use cached scored df if available, otherwise compute
    scored = state.data.get("scored_df")
    if scored is None:
        scored = _compute_risk_scores(state.data["df"])
        state.data["scored_df"] = scored

    acct = scored[scored["nameOrig"] == nameOrig]
    if acct.empty:
        raise HTTPException(status_code=404, detail=f"Account '{nameOrig}' not found.")

    transactions = []
    for _, row in acct.sort_values("final_score", ascending=False).iterrows():
        hour = (int(row["step"]) - 1) % 24
        day = ((int(row["step"]) - 1) // 24) + 1
        transactions.append({
            "nameOrig": str(row["nameOrig"]),
            "nameDest": str(row["nameDest"]),
            "type": str(row["type"]),
            "amount": round(float(row["amount"]), 2),
            "step": int(row["step"]),
            "hour": hour,
            "day": day,
            "final_score": round(float(row["final_score"]), 2),
            "risk_band": str(row["risk_band"]),
            "isFraud": int(row["isFraud"]),
            "oldbalanceOrg": round(float(row["oldbalanceOrg"]), 2),
            "newbalanceOrig": round(float(row["newbalanceOrig"]), 2),
            "oldbalanceDest": round(float(row["oldbalanceDest"]), 2),
            "newbalanceDest": round(float(row["newbalanceDest"]), 2),
            "factor_breakdown": {
                "amount_deviation": int(row["f_amount_deviation"]),
                "type_risk": int(row["f_type_risk"]),
                "balance_inconsistency": int(row["f_balance_inconsistency"]),
                "temporal_risk": int(row["f_temporal_risk"]),
                "round_number": int(row["f_round_number"]),
                "dest_account": int(row["f_dest_account"]),
                "account_velocity": int(row["f_account_velocity"]),
            },
        })

    total_fraud = int(acct["isFraud"].sum())
    mean_risk = round(float(acct["final_score"].mean()), 2)
    max_risk = round(float(acct["final_score"].max()), 2)

    return {
        "account": nameOrig,
        "total_transactions": len(acct),
        "total_fraud": total_fraud,
        "mean_risk_score": mean_risk,
        "max_risk_score": max_risk,
        "transactions": transactions,
    }


# ──────────────────────────────────────────
# GET /risk/export
# ──────────────────────────────────────────
@router.get("/export")
def risk_export():
    if state.data["df"] is None:
        raise HTTPException(status_code=400, detail="No dataset loaded.")

    scored = state.data.get("scored_df")
    if scored is None:
        scored = _compute_risk_scores(state.data["df"])
        state.data["scored_df"] = scored

    # Filter HIGH + CRITICAL, top 1000 by score
    high_crit = scored[scored["risk_band"].isin(["HIGH", "CRITICAL"])]
    top = high_crit.nlargest(1000, "final_score")

    export_cols = [
        "step", "type", "amount", "nameOrig", "oldbalanceOrg", "newbalanceOrig",
        "nameDest", "oldbalanceDest", "newbalanceDest", "isFraud", "isFlaggedFraud",
        "final_score", "risk_band",
        "f_amount_deviation", "f_type_risk", "f_balance_inconsistency",
        "f_temporal_risk", "f_round_number", "f_dest_account", "f_account_velocity",
    ]
    available_cols = [c for c in export_cols if c in top.columns]
    export_df = top[available_cols].copy()

    stream = io.StringIO()
    export_df.to_csv(stream, index=False)
    stream.seek(0)

    return StreamingResponse(
        iter([stream.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=risk_scored_transactions.csv"},
    )
