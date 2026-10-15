import os, time
from fastapi import APIRouter, HTTPException
from utils import state, cache_manager, context_builder
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")


@router.get("/generate")
async def generate_audit_report(
    auditor: str = "Audit Team",
    organization: str = "AuditIQ Platform",
    report_period: str = "Current Dataset",
    include_benford: bool = True,
    include_temporal: bool = True,
    include_risk: bool = True,
    include_duplicates: bool = True,
    include_dataset: bool = True,
):
    """Generate a comprehensive audit report using Groq AI."""
    # Gather all cached module data
    context_parts = []
    modules_used = []

    if include_dataset:
        ds = {
            "filename": state.data.get("filename", "Unknown"),
            "rows": state.data.get("rows", 0),
            "fraud_count": state.data.get("fraud_count", 0),
            "flagged_count": state.data.get("flagged_count", 0),
            "transaction_types": state.data.get("transaction_types", {}),
            "amount_stats": state.data.get("amount_stats", {}),
        }
        context_parts.append(f"## Dataset Overview\n{_format_dict(ds)}")
        modules_used.append("Dataset Overview")

    if include_benford:
        benford = cache_manager.load_cache("benford")
        if benford:
            s = benford.get("summary", {})
            context_parts.append(
                f"## Benford's Law Analysis\n"
                f"- MAD Score: {s.get('mad_score', 'N/A')}\n"
                f"- Interpretation: {s.get('mad_interpretation', 'N/A')}\n"
                f"- Chi² Statistic: {s.get('chi2_statistic', 'N/A')}\n"
                f"- P-Value: {s.get('p_value', 'N/A')}\n"
                f"- Conformity: {s.get('conformity_status', 'N/A')}\n"
                f"- Risk Level: {s.get('overall_risk', 'N/A')}\n"
                f"- Significant Deviations: {s.get('significant_deviations', [])}"
            )
            modules_used.append("Benford Analysis")

    if include_temporal:
        temporal = cache_manager.load_cache("temporal_analysis")
        if temporal:
            s = temporal.get("summary", {})
            context_parts.append(
                f"## Temporal Pattern Analysis\n"
                f"- Total Transactions: {s.get('total_transactions', 'N/A')}\n"
                f"- Overall Fraud Rate: {s.get('overall_fraud_rate', 'N/A')}\n"
                f"- Late Night Uplift: {s.get('late_night_uplift', 'N/A')}x\n"
                f"- Weekend Uplift: {s.get('weekend_uplift', 'N/A')}x\n"
                f"- End of Month Uplift: {s.get('end_of_month_uplift', 'N/A')}x\n"
                f"- Peak Fraud Window: {s.get('peak_fraud_window', 'N/A')}\n"
                f"- Anomalous Hours: {s.get('anomalous_hours', [])}\n"
                f"- Burst Accounts: {s.get('burst_accounts_found', 0)}"
            )
            modules_used.append("Temporal Analysis")

    if include_risk:
        risk = cache_manager.load_cache("risk_scoring")
        if risk:
            s = risk.get("summary", {})
            dist = s.get('score_distribution', {})
            factors = risk.get("factor_analysis", {})
            factor_lines = ""
            if factors:
                factor_lines = "\n- Factor Analysis (weight → mean contribution):"
                for fname, fdata in factors.items():
                    if isinstance(fdata, dict):
                        factor_lines += f"\n  - {fname}: weight={fdata.get('weight','?')}, mean={fdata.get('mean','?')}"
            context_parts.append(
                f"## Risk Scoring Analysis\n"
                f"- Total Scored: {s.get('total_scored', 'N/A')}\n"
                f"- Mean Score: {s.get('mean_score', 'N/A')}\n"
                f"- Median Score: {s.get('median_score', 'N/A')}\n"
                f"- High/Critical Count: {s.get('high_critical_count', 'N/A')}\n"
                f"- High/Critical %: {s.get('high_critical_pct', 'N/A')}%\n"
                f"- Fraud Mean Score: {s.get('confirmed_fraud_mean_score', 'N/A')}\n"
                f"- Legit Mean Score: {s.get('legitimate_mean_score', 'N/A')}\n"
                f"- Score Separation: {s.get('score_separation', 'N/A')}\n"
                f"- Distribution Bands: Critical={dist.get('CRITICAL',0)}, High={dist.get('HIGH',0)}, Medium={dist.get('MEDIUM',0)}, Low={dist.get('LOW',0)}, Minimal={dist.get('MINIMAL',0)}"
                f"{factor_lines}"
            )
            modules_used.append("Risk Scoring")

    if include_duplicates:
        dups = cache_manager.load_cache("duplicates")
        if dups:
            s = dups.get("summary", {})
            context_parts.append(
                f"## Duplicate & Anomaly Detection\n"
                f"- Exact Duplicates: {s.get('exact_duplicates_found', 0)}\n"
                f"- Near-Time Clones: {s.get('near_time_clones_found', 0)}\n"
                f"- Amount Clones: {s.get('amount_clone_groups', 0)}\n"
                f"- Structuring Groups: {s.get('structuring_groups_found', 0)}\n"
                f"- Mirror Pairs: {s.get('mirror_pairs_found', 0)}\n"
                f"- Total Flagged: {s.get('total_flagged_transactions', 0)}\n"
                f"- Overall Risk: {s.get('overall_risk', 'N/A')}\n"
                f"- Estimated Fraudulent Value: {s.get('estimated_fraudulent_value', 0)}"
            )
            modules_used.append("Duplicate Detection")

    if not modules_used:
        raise HTTPException(status_code=400, detail="No analysis modules have been run yet.")

    analysis_context = "\n\n".join(context_parts)

    prompt = f"""You are a senior forensic auditor and certified fraud examiner preparing a comprehensive executive audit report. Generate a highly detailed, professional audit report in Markdown format.

**Report Details:**
- Auditor: {auditor}
- Organization: {organization}
- Report Period: {report_period}
- Report Date: {time.strftime('%B %d, %Y')}
- Modules Analyzed: {', '.join(modules_used)}

**Analysis Data:**
{analysis_context}

**Report Structure — follow these sections in order. Be thorough and analytical in each section:**

# Executive Summary
Provide a 3-4 paragraph executive summary that includes:
- The scope and objective of the audit (what was analyzed and why)
- A quantified overview of key findings (use specific numbers: fraud count, risk percentages, anomaly counts)
- The overall risk rating (LOW/MEDIUM/HIGH/CRITICAL) with justification
- A one-sentence materiality statement about potential financial exposure

# Audit Scope & Methodology
Describe:
- The dataset volume (total transactions, date range/steps)
- The four analytical methodologies applied: Benford's Law statistical analysis, temporal pattern decomposition, multi-factor risk scoring, and duplicate/anomaly detection
- Any sampling methodology used and its implications
- Confidence level of the analysis

# Dataset Profile
Provide a detailed statistical profile:
- Total records, transaction types breakdown (use a markdown table with type, count, percentage)
- Amount statistics: min, max, mean, median, standard deviation characteristics
- Fraud prevalence rate and flagged transaction rate
- Any notable data quality observations

# Key Findings

## Finding 1: Benford's Law Compliance Analysis (if data available)
- State the MAD score and interpret it (Conforming < 0.006, Marginally < 0.012, Non-conforming < 0.015, Severely Non-conforming ≥ 0.015)
- Interpret the Chi-squared statistic and p-value in plain language (what does it mean for data integrity?)
- List any specific leading digits that deviate significantly from expected Benford distribution
- Provide an assessment: does this suggest potential data manipulation, natural variance, or synthetic patterns?
- Rate this finding: severity (Low/Medium/High/Critical), confidence level

## Finding 2: Temporal Pattern Analysis (if data available)
- Describe fraud rate variations across time periods
- Interpret the late-night, weekend, and end-of-month uplift factors (what multiplier above baseline?)
- Identify the peak fraud window and its significance
- Note any anomalous hours and what they suggest about fraud methodology
- Count of burst accounts detected and their risk implications
- Rate this finding: severity, confidence level

## Finding 3: Risk Score Distribution (if data available)
- Describe the score distribution across bands (Critical/High/Medium/Low/Minimal)
- State the separation between fraud and legitimate mean scores — is the model discriminating well?
- Calculate and interpret the high/critical transaction percentage
- Note the confirmed fraud mean score vs legitimate mean score gap
- Rate this finding: severity, confidence level

## Finding 4: Duplicate & Anomaly Detection (if data available)
- Enumerate each pattern type found with counts
- Highlight the highest-risk pattern category
- State the estimated fraudulent value exposure
- Describe the overall risk level and what it implies
- Rate this finding: severity, confidence level

# Risk Assessment Matrix
Create a markdown table with columns: Finding, Severity, Likelihood, Impact, Priority. Populate with the key findings above. Add a risk heat summary paragraph.

# Top Priority Items
List the 5 most critical items requiring immediate attention, with:
- Item description
- Why it's critical
- Recommended immediate action

# Recommendations
Provide 8-10 numbered, actionable recommendations organized by priority:
- **Immediate (within 48 hours):** Items requiring urgent action
- **Short-term (within 2 weeks):** Process improvements and enhanced monitoring
- **Medium-term (within 90 days):** System enhancements and policy changes
Each recommendation should specify: what to do, who should do it, and expected outcome.

# Materiality & Financial Impact
Estimate the potential financial exposure based on:
- Fraudulent transaction values identified
- High-risk transaction volumes and their aggregate amounts
- Cost of false positives vs cost of missed fraud

# Conclusion
Provide a 2-3 paragraph conclusion that:
- Summarizes the overall audit health (is the system sound or does it need attention?)
- Highlights the single most important finding
- States next steps and recommended follow-up timeline

---
*This report was generated by AuditIQ AI Audit Analytics Platform on {time.strftime('%B %d, %Y at %H:%M')}.*
*Classification: CONFIDENTIAL — For Internal Use Only*

Write in formal, professional audit language throughout. Use **bold** for emphasis on critical numbers and risk levels. Include markdown tables where specified. Be analytical, not just descriptive — interpret what the numbers mean."""

    # Call Groq API
    try:
        from groq import Groq
        client = Groq(api_key=GROQ_API_KEY)
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a senior forensic auditor and certified fraud examiner. Write a comprehensive, highly detailed executive audit report with specific data analysis, statistical interpretations, risk assessments, and actionable recommendations. Use formal audit language, markdown tables, and severity ratings. Every finding must be backed by specific numbers from the analysis data provided."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=6000,
        )
        report_content = completion.choices[0].message.content
    except Exception as e:
        # Fallback: generate a detailed structured report without AI
        report_content = _generate_fallback_report(auditor, organization, report_period, analysis_context, modules_used)

    result = {
        "report": report_content,
        "metadata": {
            "auditor": auditor,
            "organization": organization,
            "report_period": report_period,
            "generated_at": time.strftime('%Y-%m-%dT%H:%M:%S'),
            "modules_used": modules_used,
            "module_count": len(modules_used),
        },
    }
    cache_manager.save_cache("audit_report", result)
    return result


@router.get("/status")
def report_status():
    cached = cache_manager.load_cache("audit_report")
    if cached:
        return {
            "generated": True,
            "generated_at": cached.get("metadata", {}).get("generated_at", ""),
            "modules_used": cached.get("metadata", {}).get("modules_used", []),
        }
    return {"generated": False, "generated_at": None, "modules_used": []}


@router.get("/export-html")
def export_report_html():
    cached = cache_manager.load_cache("audit_report")
    if not cached:
        raise HTTPException(status_code=400, detail="No report generated yet. Run /report/generate first.")

    md = cached.get("report", "")
    meta = cached.get("metadata", {})
    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>AuditIQ Audit Report</title>
<style>
body {{ font-family: 'Georgia', serif; max-width: 800px; margin: 40px auto; padding: 20px; color: #1a1a1a; line-height: 1.7; }}
h1 {{ color: #0d3b66; border-bottom: 2px solid #0d3b66; padding-bottom: 8px; }}
h2 {{ color: #1d4e89; margin-top: 28px; }}
h3 {{ color: #2a6f97; }}
table {{ border-collapse: collapse; width: 100%; margin: 12px 0; }}
th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
th {{ background: #f0f4f8; }}
ul {{ margin: 8px 0; }}
.header {{ text-align: center; margin-bottom: 30px; border-bottom: 3px double #0d3b66; padding-bottom: 20px; }}
.footer {{ margin-top: 40px; padding-top: 20px; border-top: 1px solid #ccc; font-size: 12px; color: #666; text-align: center; }}
.confidential {{ color: #c62828; font-weight: bold; font-size: 11px; letter-spacing: 2px; }}
</style></head><body>
<div class="header">
<p class="confidential">CONFIDENTIAL — FOR INTERNAL USE ONLY</p>
<h1>AuditIQ Audit Report</h1>
<p>Prepared by: {meta.get('auditor', 'Audit Team')} | Organization: {meta.get('organization', '')}</p>
<p>Report Period: {meta.get('report_period', '')} | Generated: {meta.get('generated_at', '')}</p>
</div>
<div class="content">{_md_to_html(md)}</div>
<div class="footer">
<p>Generated by AuditIQ AI Audit Analytics Platform</p>
<p class="confidential">CONFIDENTIAL</p>
</div>
</body></html>"""

    from fastapi.responses import HTMLResponse
    return HTMLResponse(content=html, media_type="text/html")


def _format_dict(d, indent=0):
    lines = []
    prefix = "  " * indent
    for k, v in d.items():
        if isinstance(v, dict):
            lines.append(f"{prefix}- {k}:")
            lines.append(_format_dict(v, indent + 1))
        else:
            lines.append(f"{prefix}- {k}: {v}")
    return "\n".join(lines)


def _md_to_html(md_text):
    """Simple markdown to HTML conversion."""
    import re
    lines = md_text.split("\n")
    html_lines = []
    in_list = False
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("### "):
            if in_list:
                html_lines.append("</ul>")
                in_list = False
            html_lines.append(f"<h3>{stripped[4:]}</h3>")
        elif stripped.startswith("## "):
            if in_list:
                html_lines.append("</ul>")
                in_list = False
            html_lines.append(f"<h2>{stripped[3:]}</h2>")
        elif stripped.startswith("# "):
            if in_list:
                html_lines.append("</ul>")
                in_list = False
            html_lines.append(f"<h1>{stripped[2:]}</h1>")
        elif stripped.startswith("- ") or stripped.startswith("* "):
            if not in_list:
                html_lines.append("<ul>")
                in_list = True
            content = stripped[2:]
            content = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', content)
            html_lines.append(f"<li>{content}</li>")
        elif re.match(r'^\d+\.\s', stripped):
            if not in_list:
                html_lines.append("<ul>")
                in_list = True
            content = re.sub(r'^\d+\.\s', '', stripped)
            content = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', content)
            html_lines.append(f"<li>{content}</li>")
        elif stripped:
            if in_list:
                html_lines.append("</ul>")
                in_list = False
            content = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', stripped)
            html_lines.append(f"<p>{content}</p>")
    if in_list:
        html_lines.append("</ul>")
    return "\n".join(html_lines)


def _generate_fallback_report(auditor, organization, report_period, analysis_context, modules_used):
    """Generate a detailed structured report without AI if API fails."""
    return f"""# Executive Summary

This executive audit report was prepared by **{auditor}** for **{organization}** covering the analysis period: **{report_period}**. The AuditIQ platform applied four complementary analytical methodologies to assess data integrity and identify potential fraud indicators.

**Modules Analyzed:** {', '.join(modules_used)}

The findings below represent an automated assessment of the uploaded dataset. Each module's results are presented with their raw metrics for manual interpretation by qualified auditors.

# Audit Scope & Methodology

The following analytical methodologies were applied:

| Method | Purpose | Status |
|--------|---------|--------|
| Benford's Law | Statistical digit distribution analysis | {'✅ Complete' if 'Benford Analysis' in modules_used else '⏳ Not Run'} |
| Temporal Analysis | Time-based fraud pattern detection | {'✅ Complete' if 'Temporal Analysis' in modules_used else '⏳ Not Run'} |
| Risk Scoring | Multi-factor risk assessment | {'✅ Complete' if 'Risk Scoring' in modules_used else '⏳ Not Run'} |
| Duplicate Detection | Transaction anomaly identification | {'✅ Complete' if 'Duplicate Detection' in modules_used else '⏳ Not Run'} |

# Detailed Analysis Results

{analysis_context}

# Risk Assessment Matrix

| Finding Area | Risk Level | Action Required |
|-------------|------------|----------------|
| Data Integrity (Benford's) | Requires Review | Verify digit distribution anomalies |
| Temporal Patterns | Requires Review | Investigate time-based fraud indicators |
| Risk Score Distribution | Requires Review | Focus on high/critical scored transactions |
| Duplicate Patterns | Requires Review | Examine flagged transaction groups |

# Recommendations

**Immediate Actions (within 48 hours):**
1. Review all transactions flagged as Critical or High risk by the scoring engine.
2. Investigate any Benford's Law non-conformance — MAD scores above 0.015 indicate potential manipulation.
3. Cross-reference duplicate detection findings with transaction authorization records.

**Short-term Actions (within 2 weeks):**
4. Analyze temporal anomalies — transactions during identified peak fraud windows require manual verification.
5. Review accounts with burst transaction activity for potential account takeover.
6. Implement enhanced monitoring rules based on the patterns identified.

**Medium-term Actions (within 90 days):**
7. Update fraud detection rules to incorporate Benford's Law continuous monitoring.
8. Establish automated alerts for structuring patterns near regulatory thresholds.
9. Review and enhance access controls for high-value transaction processing.
10. Schedule follow-up audit to verify remediation of identified issues.

# Conclusion

This report summarizes the key findings from the automated audit analysis performed by the AuditIQ platform. The analysis covered multiple dimensions of fraud detection and risk assessment. All flagged items require manual investigation by qualified audit personnel to determine their significance and appropriate remediation actions.

A follow-up audit is recommended within 30 days to verify that identified issues have been addressed and to assess the effectiveness of any implemented controls.

---
*Report generated on {time.strftime('%B %d, %Y at %H:%M')}*
*Classification: CONFIDENTIAL — For Internal Use Only*
*Note: AI-assisted narrative generation was unavailable. This is a structured analytical summary.*
"""
