from .cache_manager import get_all_cached_results

def build_context_string() -> str:
    """
    Aggregates all cached module results into a compact string to be used as context.
    Ensures that the output string is concise to fit within context limits.
    """
    modules = get_all_cached_results()
    if not modules:
        return "No analysis modules have been run yet."
    
    context_lines = ["--- Audit Findings Context ---"]
    
    # Process Benford
    if "benford" in modules:
        benford = modules["benford"]
        context_lines.append("**Benford's Law Analysis**:")
        context_lines.append(f"Tested Column: {benford.get('tested_column', 'Amount')}")
        context_lines.append(f"MAD Score: {benford.get('mad_score', 0):.4f}")
        sus_dig = benford.get('suspicious_digits', [])
        if sus_dig:
            context_lines.append(f"Suspicious Digits: {sus_dig}")
        context_lines.append("")
    
    # Process Temporal
    if "temporal" in modules:
        temporal = modules["temporal"]
        context_lines.append("**Temporal Analysis**:")
        stats = temporal.get('stats', {})
        context_lines.append(f"Weekend Txn Count: {stats.get('weekend_count', 0)}")
        context_lines.append(f"Night Txn Count: {stats.get('night_count', 0)}")
        context_lines.append(f"Holidays Txn Count: {stats.get('holidays_count', 0)}")
        unusual = temporal.get("unusual_transactions", [])
        if unusual:
            context_lines.append("Top Unusual Temporal Transactions:")
            for tx in unusual[:3]:
                context_lines.append(f"  - Amount: {tx.get('Amount', '')}, Time: {tx.get('Time', '')}, Day: {tx.get('DayOfWeek', '')}")
        context_lines.append("")
        
    # Process Risk Scoring
    if "risk_scoring" in modules:
        risk = modules["risk_scoring"]
        context_lines.append("**Risk Scoring Analysis**:")
        stats = risk.get('summary_stats', {})
        context_lines.append(f"Total Transactions: {stats.get('total_transactions', 0)}")
        context_lines.append(f"High Risk Initial: {stats.get('high_risk_initial', 0)}, Final: {stats.get('high_risk_final', 0)}")
        hi_trans = risk.get("high_risk_transactions", [])
        if hi_trans:
            context_lines.append("Top High Risk Transactions:")
            for tx in hi_trans[:3]:
                context_lines.append(f"  - Amount: {tx.get('Amount', '')}, Initial Risk: {tx.get('RiskScore', '')}, Final Risk: {tx.get('FinalRiskScore', '')}")
        context_lines.append("")
        
    # Process Duplication
    if "duplicates" in modules:
        dup = modules["duplicates"]
        context_lines.append("**Duplication Analysis**:")
        context_lines.append(f"Exact Duplicates Count: {dup.get('exact_duplicates_count', 0)}")
        context_lines.append(f"Same Amount/Vendor, Different Date Count: {dup.get('fuzzy_amount_vendor_diff_date_count', 0)}")
        context_lines.append(f"Suspicious Round Amounts Count: {dup.get('suspicious_round_amounts_count', 0)}")
        context_lines.append("")
        
    return "\n".join(context_lines)
