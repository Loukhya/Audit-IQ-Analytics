import io, hashlib
import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from utils import state, cache_manager

router = APIRouter()

SAMPLE_LIMIT = 100_000
STRUCTURING_THRESHOLDS = [100_000, 200_000, 500_000, 1_000_000]

# ───────────────────────────────────────────
# HELPERS
# ───────────────────────────────────────────

def _prepare(df: pd.DataFrame):
    """Stratified sample if needed. Always keeps all fraud rows."""
    used_sample = False
    if len(df) > SAMPLE_LIMIT:
        fraud = df[df["isFraud"] == 1]
        legit = df[df["isFraud"] == 0]
        need = SAMPLE_LIMIT - len(fraud)
        if need > 0 and len(legit) > need:
            legit = legit.sample(n=need, random_state=42)
        df = pd.concat([fraud, legit]).reset_index(drop=True)
        used_sample = True
    return df, used_sample


def _hash_group(*parts):
    return hashlib.md5("||".join(str(p) for p in parts).encode()).hexdigest()[:12]


# ──────────────────────────────────────────
# PATTERN 1  —  EXACT DUPLICATES
# ──────────────────────────────────────────

def _detect_exact_duplicates(df):
    groups = []
    key_cols = ["nameOrig", "nameDest", "amount", "type"]
    grouped = df.groupby(key_cols)
    for keys, grp in grouped:
        if len(grp) < 2:
            continue
        steps = sorted(grp["step"].tolist())
        min_gap = min(steps[i+1] - steps[i] for i in range(len(steps)-1))
        if min_gap > 3:
            continue
        fraud_count = int(grp["isFraud"].sum())
        occ = len(grp)
        score = min(50 + (20 if min_gap <= 1 else 0) + (15 if fraud_count > 0 else 0) + (15 if occ >= 3 else 0), 100)
        groups.append({
            "group_id": _hash_group(*keys),
            "nameOrig": str(keys[0]),
            "nameDest": str(keys[1]),
            "amount": round(float(keys[2]), 2),
            "type": str(keys[3]),
            "occurrences": occ,
            "steps": steps,
            "min_step_gap": int(min_gap),
            "fraud_count": fraud_count,
            "risk_score": score,
        })
    groups.sort(key=lambda g: g["risk_score"], reverse=True)
    return groups[:100]


# ──────────────────────────────────────────
# PATTERN 2  —  NEAR-TIME CLONES
# ──────────────────────────────────────────

def _detect_near_time_clones(df):
    groups = []
    key_cols = ["nameOrig", "nameDest", "amount", "type"]
    grouped = df.groupby(key_cols)
    for keys, grp in grouped:
        if len(grp) < 2:
            continue
        steps = sorted(grp["step"].tolist())
        gaps = [steps[i+1] - steps[i] for i in range(len(steps)-1)]
        valid_gaps = [g for g in gaps if 4 <= g <= 24]
        if not valid_gaps:
            continue
        min_gap = min(valid_gaps)
        fraud_count = int(grp["isFraud"].sum())
        occ = len(grp)
        score = min(30 + (15 if min_gap <= 12 else 0) + (15 if fraud_count > 0 else 0) + (10 if occ >= 3 else 0), 100)
        groups.append({
            "group_id": _hash_group(*keys, "clone"),
            "nameOrig": str(keys[0]),
            "nameDest": str(keys[1]),
            "amount": round(float(keys[2]), 2),
            "type": str(keys[3]),
            "occurrences": occ,
            "steps": steps,
            "min_step_gap": int(min_gap),
            "fraud_count": fraud_count,
            "risk_score": score,
        })
    groups.sort(key=lambda g: g["risk_score"], reverse=True)
    return groups[:100]


# ──────────────────────────────────────────
# PATTERN 3  —  AMOUNT CLONING
# ──────────────────────────────────────────

def _detect_amount_clones(df):
    groups = []
    key_cols = ["nameOrig", "amount", "type"]
    for keys, grp in df.groupby(key_cols):
        if grp["nameDest"].nunique() < 2:
            continue
        steps = sorted(grp["step"].tolist())
        if len(steps) < 2:
            continue
        # check if there's a 6-step window with >=2 different destinations
        grp_sorted = grp.sort_values("step")
        found = False
        window_steps, window_dests = [], set()
        for _, row in grp_sorted.iterrows():
            s, d = int(row["step"]), str(row["nameDest"])
            window_steps = [ws for ws in window_steps if s - ws <= 6]
            window_steps.append(s)
            if s - (window_steps[0] if window_steps else s) <= 6:
                window_dests.add(d)
            if len(window_dests) >= 2:
                found = True
                break
        if not found:
            continue
        destinations = grp["nameDest"].unique().tolist()
        fraud_count = int(grp["isFraud"].sum())
        extra_dests = max(0, len(destinations) - 1)
        score = min(40 + min(extra_dests * 10, 30) + (20 if fraud_count > 0 else 0), 100)
        groups.append({
            "nameOrig": str(keys[0]),
            "amount": round(float(keys[1]), 2),
            "type": str(keys[2]),
            "destinations": [str(d) for d in destinations[:10]],
            "destination_count": len(destinations),
            "steps": steps[:20],
            "fraud_count": fraud_count,
            "risk_score": score,
        })
    groups.sort(key=lambda g: g["risk_score"], reverse=True)
    return groups[:100]


# ──────────────────────────────────────────
# PATTERN 4  —  STRUCTURING / SMURFING
# ──────────────────────────────────────────

def _detect_structuring(df):
    groups = []
    for orig, acct_df in df.groupby("nameOrig"):
        if len(acct_df) < 3:
            continue
        for txn_type, type_df in acct_df.groupby("type"):
            if len(type_df) < 3:
                continue
            type_df = type_df.sort_values("step")
            steps = type_df["step"].values
            amounts = type_df["amount"].values
            frauds = type_df["isFraud"].values
            n = len(steps)
            for i in range(n):
                j = i + 2  # minimum 3 txns
                while j < n and steps[j] - steps[i] <= 24:
                    j += 1
                window_end = j
                if window_end - i < 3:
                    continue
                w_amounts = amounts[i:window_end]
                w_total = float(w_amounts.sum())
                w_frauds = int(frauds[i:window_end].sum())
                # check each threshold
                for threshold in STRUCTURING_THRESHOLDS:
                    if all(a < threshold for a in w_amounts):
                        proximity = abs(w_total - threshold) / threshold
                        if proximity <= 0.05:
                            w_mean = np.mean(w_amounts) if len(w_amounts) > 0 else 1
                            w_std = np.std(w_amounts) if len(w_amounts) > 1 else 0
                            score = 50
                            if proximity <= 0.01:
                                score += 10
                            if w_mean > 0 and (w_std / w_mean) < 0.1:
                                score += 10
                            if w_frauds > 0:
                                score += 15
                            if (window_end - i) >= 5:
                                score += 10
                            score = min(score, 95)
                            groups.append({
                                "nameOrig": str(orig),
                                "type": str(txn_type),
                                "transaction_count": int(window_end - i),
                                "total_amount": round(w_total, 2),
                                "nearest_threshold": float(threshold),
                                "threshold_proximity_pct": round(proximity * 100, 2),
                                "step_window_start": int(steps[i]),
                                "step_window_end": int(steps[window_end - 1]),
                                "amounts": [round(float(a), 2) for a in w_amounts],
                                "fraud_count": w_frauds,
                                "risk_score": score,
                            })
                            break  # stop checking thresholds for this window
    groups.sort(key=lambda g: g["risk_score"], reverse=True)
    # deduplicate overlapping windows — keep highest score per nameOrig
    seen = set()
    unique = []
    for g in groups:
        key = (g["nameOrig"], g["step_window_start"])
        if key not in seen:
            seen.add(key)
            unique.append(g)
        if len(unique) >= 50:
            break
    return unique


# ──────────────────────────────────────────
# PATTERN 5  —  MIRROR TRANSACTIONS
# ──────────────────────────────────────────

def _detect_mirrors(df):
    cols = ["nameOrig", "nameDest", "amount", "step", "type", "isFraud"]
    available = [c for c in cols if c in df.columns]
    forward = df[available].copy()
    reverse = forward.rename(columns={
        "nameOrig": "nameDest", "nameDest": "nameOrig",
        "amount": "rev_amount", "step": "rev_step",
        "isFraud": "rev_isFraud",
    })
    # Limit to high-risk types to keep merge manageable
    forward_filt = forward[forward["type"].isin(["TRANSFER", "CASH_OUT", "CASH-OUT"])]
    reverse_filt = reverse[reverse["type"].isin(["TRANSFER", "CASH_OUT", "CASH-OUT"])]
    if len(forward_filt) == 0:
        return []
    # Sample down if still too large
    if len(forward_filt) > 50_000:
        forward_filt = forward_filt.sample(n=50_000, random_state=42)
    if len(reverse_filt) > 50_000:
        reverse_filt = reverse_filt.sample(n=50_000, random_state=42)

    merged = forward_filt.merge(reverse_filt, on=["nameOrig", "nameDest"], how="inner")
    if len(merged) == 0:
        return []

    # Filter: reverse comes after, within 48 steps, amount within 5%
    merged = merged[merged["rev_step"] > merged["step"]]
    merged = merged[(merged["rev_step"] - merged["step"]) <= 48]
    merged["amt_diff_pct"] = (merged["rev_amount"] - merged["amount"]).abs() / merged["amount"].clip(lower=0.01)
    merged = merged[merged["amt_diff_pct"] <= 0.05]

    pairs = []
    for _, row in merged.head(500).iterrows():
        fwd_fraud = int(row.get("isFraud", 0))
        rev_fraud = int(row.get("rev_isFraud", 0))
        gap = int(row["rev_step"] - row["step"])
        amt = float(row["amount"])
        score = 60
        if fwd_fraud == 1 and rev_fraud == 1:
            score += 15
        if amt > 100_000:
            score += 10
        if gap < 12:
            score += 10
        if amt > 0 and amt % 1000 == 0:
            score += 5
        score = min(score, 100)
        pairs.append({
            "account_a": str(row["nameOrig"]),
            "account_b": str(row["nameDest"]),
            "forward_amount": round(float(row["amount"]), 2),
            "reverse_amount": round(float(row["rev_amount"]), 2),
            "amount_difference": round(abs(float(row["rev_amount"]) - float(row["amount"])), 2),
            "forward_step": int(row["step"]),
            "reverse_step": int(row["rev_step"]),
            "step_gap": gap,
            "forward_fraud": fwd_fraud,
            "reverse_fraud": rev_fraud,
            "risk_score": score,
        })
    pairs.sort(key=lambda p: p["risk_score"], reverse=True)
    return pairs[:100]


# ──────────────────────────────────────────
# BUILD RESPONSE
# ──────────────────────────────────────────

def _build_response(df, exact, clones, amount, structuring, mirrors, used_sample):
    total = len(df)
    total_flagged = len(exact) + len(clones) + len(amount) + len(structuring) + len(mirrors)
    fraud_value = (
        sum(g["amount"] * g["occurrences"] for g in exact if g["fraud_count"] > 0) +
        sum(g["amount"] * g["occurrences"] for g in clones if g["fraud_count"] > 0) +
        sum(g["amount"] * g["destination_count"] for g in amount if g["fraud_count"] > 0) +
        sum(g["total_amount"] for g in structuring if g["fraud_count"] > 0) +
        sum(p["forward_amount"] + p["reverse_amount"] for p in mirrors if p["forward_fraud"] or p["reverse_fraud"])
    )

    # Determine highest risk pattern
    pattern_counts = {
        "EXACT_DUPLICATE": len(exact),
        "NEAR_TIME_CLONE": len(clones),
        "AMOUNT_CLONE": len(amount),
        "STRUCTURING": len(structuring),
        "MIRROR": len(mirrors),
    }
    highest = max(pattern_counts, key=pattern_counts.get) if total_flagged > 0 else "NONE"

    if total_flagged >= 200:
        overall = "CRITICAL"
    elif total_flagged >= 50:
        overall = "HIGH"
    elif total_flagged >= 10:
        overall = "MEDIUM"
    else:
        overall = "LOW"

    def _pattern_stats(items, risk_key="risk_score", fraud_key="fraud_count"):
        if not items:
            return {"count": 0, "mean_risk": 0, "fraud_involved": 0}
        risks = [i[risk_key] for i in items]
        return {
            "count": len(items),
            "mean_risk": round(sum(risks) / len(risks), 1),
            "fraud_involved": sum(1 for i in items if i.get(fraud_key, i.get("forward_fraud", 0)) > 0),
        }

    def _mirror_stats(items):
        if not items:
            return {"count": 0, "mean_risk": 0, "fraud_involved": 0}
        risks = [i["risk_score"] for i in items]
        return {
            "count": len(items),
            "mean_risk": round(sum(risks) / len(risks), 1),
            "fraud_involved": sum(1 for i in items if i["forward_fraud"] or i["reverse_fraud"]),
        }

    return {
        "summary": {
            "total_transactions_analyzed": total,
            "sample_used": used_sample,
            "sample_size": total,
            "exact_duplicates_found": len(exact),
            "near_time_clones_found": len(clones),
            "amount_clone_groups": len(amount),
            "structuring_groups_found": len(structuring),
            "mirror_pairs_found": len(mirrors),
            "total_flagged_transactions": total_flagged,
            "estimated_fraudulent_value": round(fraud_value, 2),
            "highest_risk_pattern": highest,
            "overall_risk": overall,
        },
        "exact_duplicates": exact,
        "near_time_clones": clones,
        "amount_clones": amount,
        "structuring": structuring,
        "mirror_transactions": mirrors,
        "pattern_summary": {
            "EXACT_DUPLICATE": _pattern_stats(exact),
            "NEAR_TIME_CLONE": _pattern_stats(clones),
            "AMOUNT_CLONE": _pattern_stats(amount),
            "STRUCTURING": _pattern_stats(structuring),
            "MIRROR": _mirror_stats(mirrors),
        },
    }


# ═══════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════

@router.get("/status")
def duplicates_status():
    cached = cache_manager.load_cache("duplicates")
    if cached:
        return {
            "run": True,
            "overall_risk": cached.get("summary", {}).get("overall_risk", "UNKNOWN"),
            "total_flagged": cached.get("summary", {}).get("total_flagged_transactions", 0),
        }
    return {"run": False, "overall_risk": None, "total_flagged": None}


@router.get("/analysis")
def duplicates_analysis():
    if state.data["df"] is None:
        raise HTTPException(status_code=400, detail="No dataset loaded. Upload a CSV first.")

    df, used_sample = _prepare(state.data["df"])

    exact = _detect_exact_duplicates(df)
    clones = _detect_near_time_clones(df)
    amount = _detect_amount_clones(df)
    structuring = _detect_structuring(df)
    mirrors = _detect_mirrors(df)

    # Cache for export
    state.data["dup_result"] = {
        "exact": exact, "clones": clones, "amount": amount,
        "structuring": structuring, "mirrors": mirrors,
    }

    result = _build_response(df, exact, clones, amount, structuring, mirrors, used_sample)
    cache_manager.save_cache("duplicates", result)
    return result


@router.get("/export/{pattern}")
def duplicates_export(pattern: str):
    cached = state.data.get("dup_result")
    if not cached:
        raise HTTPException(status_code=400, detail="Run analysis first.")

    mapping = {
        "exact": cached["exact"],
        "clones": cached["clones"],
        "amount": cached["amount"],
        "structuring": cached["structuring"],
        "mirror": cached["mirrors"],
    }

    if pattern == "all":
        rows = []
        for ptype, items in mapping.items():
            for item in items:
                row = {**item, "pattern_type": ptype}
                # flatten nested lists/dicts for CSV
                for k, v in list(row.items()):
                    if isinstance(v, (list, dict)):
                        row[k] = str(v)
                rows.append(row)
        export_df = pd.DataFrame(rows)
    elif pattern in mapping:
        items = mapping[pattern]
        rows = []
        for item in items:
            row = dict(item)
            for k, v in list(row.items()):
                if isinstance(v, (list, dict)):
                    row[k] = str(v)
            rows.append(row)
        export_df = pd.DataFrame(rows)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown pattern: {pattern}. Use: exact, clones, amount, structuring, mirror, all")

    stream = io.StringIO()
    export_df.to_csv(stream, index=False)
    stream.seek(0)
    return StreamingResponse(
        iter([stream.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=duplicates_{pattern}.csv"},
    )
