import json
import math
import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from scipy import stats as sp_stats
import io
from utils import state, cache_manager

router = APIRouter()

BENFORD_FIRST = {1: 30.10, 2: 17.61, 3: 12.49, 4: 9.69, 5: 7.92, 6: 6.69, 7: 5.80, 8: 5.12, 9: 4.58}
BENFORD_SECOND = {0: 11.97, 1: 11.39, 2: 10.88, 3: 10.43, 4: 10.03, 5: 9.67, 6: 9.34, 7: 9.04, 8: 8.76, 9: 8.50}


def _extract_digit(series, position):
    """Extract leading or second digit from a numeric series."""
    results = []
    for v in series:
        try:
            s = str(abs(float(v)))
            # remove leading zeros and decimal point, keep digit string
            s = s.lstrip('0').replace('.', '')
            if not s:
                continue
            if len(s) > position:
                d = int(s[position])
                if position == 0 and d == 0:
                    continue
                results.append(d)
        except (ValueError, IndexError):
            continue
    return results


def _analyse_digits(digits, expected_map, _n_unused):
    """Run Benford analysis on a list of extracted digits."""
    digit_range = sorted(expected_map.keys())
    counts = {d: 0 for d in digit_range}
    for d in digits:
        if d in counts:
            counts[d] += 1

    total = sum(counts.values())
    if total == 0:
        total = 1

    actual_pcts = {d: (counts[d] / total) * 100 for d in digit_range}

    # Build expected counts that sum to same total as actual (required by chisquare)
    raw_expected = {d: (expected_map[d] / 100) * total for d in digit_range}
    raw_sum = sum(raw_expected.values())
    # Normalise so expected sum == actual sum exactly
    expected_counts_list = [(raw_expected[d] / raw_sum) * total for d in digit_range]
    actual_counts_list = [counts[d] for d in digit_range]

    # Chi-square test
    try:
        chi2, p_value = sp_stats.chisquare(actual_counts_list, expected_counts_list)
        chi2 = float(chi2)
        p_value = float(p_value)
    except Exception:
        chi2, p_value = 0.0, 1.0

    # MAD
    deviations = [abs(actual_pcts[d] - expected_map[d]) / 100 for d in digit_range]
    mad = float(np.mean(deviations))

    # Per-digit z-scores
    per_digit = []
    for d in digit_range:
        exp_p = expected_map[d] / 100
        act_p = actual_pcts[d] / 100
        denom = math.sqrt(exp_p * (1 - exp_p) / total) if total > 0 else 1
        z = (act_p - exp_p) / denom if denom > 0 else 0
        per_digit.append({
            "digit": d,
            "actual_count": counts[d],
            "actual_pct": round(actual_pcts[d], 4),
            "expected_pct": expected_map[d],
            "deviation_pct": round(actual_pcts[d] - expected_map[d], 4),
            "z_score": round(z, 4),
            "is_significant": abs(z) > 1.96,
        })

    return per_digit, chi2, p_value, mad


def _mad_interpretation(mad):
    if mad < 0.006:
        return "Close Conformity"
    if mad < 0.012:
        return "Acceptable Conformity"
    if mad < 0.015:
        return "Marginal Conformity"
    return "Non-Conformity"


def _risk_level(mad, p_value):
    if mad < 0.006:
        return "LOW"
    if mad < 0.012:
        return "MEDIUM"
    if mad < 0.015:
        return "HIGH"
    return "CRITICAL"


@router.get("/analysis")
def benford_analysis():
    df = state.data.get("df")
    if df is None:
        raise HTTPException(status_code=400, detail="No dataset loaded")

    if "amount" not in df.columns:
        raise HTTPException(status_code=400, detail="Dataset missing 'amount' column")

    amounts = pd.to_numeric(df["amount"], errors="coerce").dropna()
    valid = amounts[amounts > 0]
    n = len(valid)

    if n == 0:
        raise HTTPException(status_code=400, detail="No valid positive amounts in dataset")

    # First digit
    first_digits = _extract_digit(valid, 0)
    first_per_digit, chi2_1, p_val_1, mad_1 = _analyse_digits(first_digits, BENFORD_FIRST, n)

    # Second digit
    second_digits = _extract_digit(valid, 1)
    second_per_digit, chi2_2, p_val_2, mad_2 = _analyse_digits(second_digits, BENFORD_SECOND, n)

    # Significant deviations
    sig_devs = [d["digit"] for d in first_per_digit if d["is_significant"]]

    # By transaction type
    by_type = {}
    type_col = "type" if "type" in df.columns else None
    type_list = ["CASH-IN", "CASH-OUT", "TRANSFER", "PAYMENT", "DEBIT"]
    if type_col:
        for ttype in type_list:
            subset = df[df[type_col] == ttype]["amount"]
            subset = pd.to_numeric(subset, errors="coerce").dropna()
            subset_valid = subset[subset > 0]
            if len(subset_valid) == 0:
                by_type[ttype] = {"mad": 0.0, "chi2": 0.0, "risk": "LOW"}
                continue
            digits_t = _extract_digit(subset_valid, 0)
            _, chi2_t, _, mad_t = _analyse_digits(digits_t, BENFORD_FIRST, len(subset_valid))
            by_type[ttype] = {
                "mad": round(mad_t, 6),
                "chi2": round(chi2_t, 4),
                "risk": _risk_level(mad_t, 0),
            }
    else:
        by_type = {"ALL": {"mad": round(mad_1, 6), "chi2": round(chi2_1, 4), "risk": _risk_level(mad_1, 0)}}

    # Flagged samples
    flagged_samples = []
    for d_info in first_per_digit:
        if d_info["is_significant"]:
            digit = d_info["digit"]
            try:
                mask = valid.apply(lambda v, _d=digit: str(abs(float(v))).lstrip('0').replace('.', '')[0:1] == str(_d))
                sample_df = df.loc[valid[mask].index].head(10)
                sample_rows = []
                for _, row in sample_df.iterrows():
                    row_dict = {}
                    for col in sample_df.columns:
                        val = row[col]
                        if pd.isna(val):
                            row_dict[col] = None
                        elif isinstance(val, (np.integer,)):
                            row_dict[col] = int(val)
                        elif isinstance(val, (np.floating,)):
                            row_dict[col] = float(val)
                        else:
                            row_dict[col] = val
                    sample_rows.append(row_dict)
                flagged_samples.append({
                    "digit": digit,
                    "z_score": d_info["z_score"],
                    "sample_transactions": sample_rows,
                })
            except Exception:
                continue

    interp = _mad_interpretation(mad_1)
    risk = _risk_level(mad_1, p_val_1)
    conformity = "CONFORMS" if p_val_1 >= 0.05 else "DEVIATES"

    result = {
        "summary": {
            "total_transactions_analyzed": int(n),
            "mad_score": round(mad_1, 6),
            "mad_interpretation": interp,
            "chi2_statistic": round(chi2_1, 4),
            "p_value": round(p_val_1, 6),
            "conformity_status": conformity,
            "overall_risk": risk,
            "significant_deviations": sig_devs,
        },
        "first_digit": first_per_digit,
        "second_digit": second_per_digit,
        "by_transaction_type": by_type,
        "flagged_samples": flagged_samples,
    }
    cache_manager.save_cache("benford", result)
    return result


@router.get("/status")
def benford_status():
    cached = cache_manager.load_cache("benford")
    if cached:
        return {
            "run": True,
            "risk": cached.get("summary", {}).get("overall_risk", "UNKNOWN"),
            "mad": cached.get("summary", {}).get("mad_score", 0),
            "chi2": cached.get("summary", {}).get("chi2_statistic", 0),
        }
    return {"run": False, "risk": None, "mad": None, "chi2": None}


@router.get("/export")
def benford_export():
    df = state.data.get("df")
    if df is None:
        raise HTTPException(status_code=400, detail="No dataset loaded")

    result = benford_analysis()
    content = json.dumps(result, indent=2)

    return StreamingResponse(
        iter([content]),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=benford_analysis.json"},
    )
