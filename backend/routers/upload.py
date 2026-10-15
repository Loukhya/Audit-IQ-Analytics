import io
import numpy as np
import pandas as pd
from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import StreamingResponse
from utils import state

router = APIRouter()

REQUIRED_COLUMNS = [
    "step", "type", "amount", "nameOrig", "oldbalanceOrg",
    "newbalanceOrig", "nameDest", "oldbalanceDest", "newbalanceDest",
    "isFraud", "isFlaggedFraud"
]


@router.post("/file")
async def upload_file(file: UploadFile = File(...)):
    # Validate file type
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported.")

    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {str(e)}")

    # Validate columns
    missing = [col for col in REQUIRED_COLUMNS if col not in df.columns]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required columns: {', '.join(missing)}"
        )

    # Compute stats
    fraud_count = int(df["isFraud"].sum())
    flagged_count = int(df["isFlaggedFraud"].sum())
    transaction_types = df["type"].value_counts().to_dict()
    amount_stats = {
        "min": float(df["amount"].min()),
        "max": float(df["amount"].max()),
        "mean": float(df["amount"].mean()),
        "median": float(df["amount"].median()),
    }

    # Store in shared state
    state.data["df"] = df
    state.data["filename"] = file.filename
    state.data["rows"] = len(df)
    state.data["fraud_count"] = fraud_count
    state.data["flagged_count"] = flagged_count
    state.data["transaction_types"] = transaction_types
    state.data["amount_stats"] = amount_stats

    # Preview — first 100 rows
    preview = df.head(100).replace({np.nan: None}).to_dict(orient="records")

    return {
        "status": "success",
        "filename": file.filename,
        "rows": len(df),
        "columns": len(df.columns),
        "fraud_count": fraud_count,
        "flagged_count": flagged_count,
        "transaction_types": transaction_types,
        "amount_stats": amount_stats,
        "preview": preview,
    }


@router.get("/status")
def upload_status():
    if state.data["df"] is not None:
        return {
            "loaded": True,
            "rows": state.data["rows"],
            "filename": state.data["filename"],
            "fraud_count": state.data["fraud_count"],
            "flagged_count": state.data["flagged_count"],
            "transaction_types": state.data["transaction_types"],
            "amount_stats": state.data["amount_stats"],
        }
    return {"loaded": False}


@router.get("/preview")
def upload_preview():
    if state.data["df"] is None:
        raise HTTPException(status_code=400, detail="No dataset loaded")
    preview = state.data["df"].head(200).replace({np.nan: None}).to_dict(orient="records")
    return preview


@router.get("/sample")
def download_sample():
    rng = np.random.default_rng(42)
    n = 460  # base random rows, we'll add ~40 pattern rows

    types = rng.choice(
        ["PAYMENT", "CASH-OUT", "CASH-IN", "TRANSFER", "DEBIT"],
        size=n,
        p=[0.35, 0.25, 0.20, 0.15, 0.05],
    )
    amounts = np.round(rng.lognormal(mean=8.5, sigma=1.5, size=n), 2)
    steps = rng.integers(1, 745, size=n)
    name_origs = ["C" + "".join(rng.choice(list("0123456789"), size=10)) for _ in range(n)]
    old_balance_orgs = np.round(rng.uniform(0, 500000, size=n), 2)
    new_balance_origs = np.maximum(old_balance_orgs - amounts, 0)
    name_dests = [
        rng.choice(["C", "M"]) + "".join(rng.choice(list("0123456789"), size=10))
        for _ in range(n)
    ]
    old_balance_dests = np.round(rng.uniform(0, 500000, size=n), 2)
    new_balance_dests = old_balance_dests + amounts
    is_fraud = (rng.random(n) < 0.013).astype(int)
    is_flagged_fraud = ((is_fraud == 1) & (amounts > 200000)).astype(int)

    base_df = pd.DataFrame({
        "step": steps,
        "type": types,
        "amount": amounts,
        "nameOrig": name_origs,
        "oldbalanceOrg": old_balance_orgs,
        "newbalanceOrig": np.round(new_balance_origs, 2),
        "nameDest": name_dests,
        "oldbalanceDest": old_balance_dests,
        "newbalanceDest": np.round(new_balance_dests, 2),
        "isFraud": is_fraud,
        "isFlaggedFraud": is_flagged_fraud,
    })

    # ── Inject patterns for duplicate detection ──
    pattern_rows = []

    # Pattern 1: EXACT DUPLICATES — same sender→recipient→amount→type within ≤3 steps
    exact_dups = [
        {"nameOrig": "C9990000001", "nameDest": "C8880000001", "amount": 45000.00, "type": "TRANSFER", "steps": [100, 101, 102]},
        {"nameOrig": "C9990000002", "nameDest": "M8880000002", "amount": 12500.50, "type": "CASH-OUT", "steps": [200, 201]},
        {"nameOrig": "C9990000003", "nameDest": "C8880000003", "amount": 75000.00, "type": "PAYMENT", "steps": [300, 301, 303]},
        {"nameOrig": "C9990000004", "nameDest": "M8880000004", "amount": 8900.00, "type": "TRANSFER", "steps": [400, 402]},
        {"nameOrig": "C9990000005", "nameDest": "C8880000005", "amount": 155000.00, "type": "CASH-OUT", "steps": [500, 501, 502]},
    ]
    for dup in exact_dups:
        for s in dup["steps"]:
            pattern_rows.append({
                "step": s, "type": dup["type"], "amount": dup["amount"],
                "nameOrig": dup["nameOrig"], "oldbalanceOrg": 300000.0,
                "newbalanceOrig": 300000.0 - dup["amount"],
                "nameDest": dup["nameDest"], "oldbalanceDest": 50000.0,
                "newbalanceDest": 50000.0 + dup["amount"],
                "isFraud": 1, "isFlaggedFraud": 0,
            })

    # Pattern 2: NEAR-TIME CLONES — same combo but 4-12 step gaps
    clone_groups = [
        {"nameOrig": "C7770000001", "nameDest": "C6660000001", "amount": 22000.00, "type": "TRANSFER", "steps": [110, 118, 126]},
        {"nameOrig": "C7770000002", "nameDest": "M6660000002", "amount": 33500.00, "type": "CASH-OUT", "steps": [210, 220]},
        {"nameOrig": "C7770000003", "nameDest": "C6660000003", "amount": 67000.00, "type": "PAYMENT", "steps": [310, 316, 322]},
    ]
    for clg in clone_groups:
        for s in clg["steps"]:
            pattern_rows.append({
                "step": s, "type": clg["type"], "amount": clg["amount"],
                "nameOrig": clg["nameOrig"], "oldbalanceOrg": 250000.0,
                "newbalanceOrig": 250000.0 - clg["amount"],
                "nameDest": clg["nameDest"], "oldbalanceDest": 40000.0,
                "newbalanceDest": 40000.0 + clg["amount"],
                "isFraud": 1, "isFlaggedFraud": 0,
            })

    # Pattern 3: AMOUNT CLONING — same sender+amount to multiple different recipients within 6 steps
    amt_clones = [
        {"nameOrig": "C5550000001", "amount": 18000.00, "type": "TRANSFER",
         "dests": [("C4440000001", 50), ("C4440000002", 52), ("C4440000003", 54)]},
        {"nameOrig": "C5550000002", "amount": 9500.00, "type": "PAYMENT",
         "dests": [("M4440000004", 150), ("M4440000005", 153)]},
        {"nameOrig": "C5550000003", "amount": 42000.00, "type": "CASH-OUT",
         "dests": [("C4440000006", 250), ("C4440000007", 253), ("C4440000008", 255)]},
    ]
    for ac in amt_clones:
        for dest, s in ac["dests"]:
            pattern_rows.append({
                "step": s, "type": ac["type"], "amount": ac["amount"],
                "nameOrig": ac["nameOrig"], "oldbalanceOrg": 200000.0,
                "newbalanceOrig": 200000.0 - ac["amount"],
                "nameDest": dest, "oldbalanceDest": 30000.0,
                "newbalanceDest": 30000.0 + ac["amount"],
                "isFraud": 0, "isFlaggedFraud": 0,
            })

    # Pattern 4: STRUCTURING — multiple txns below threshold summing to ~threshold within 24 steps
    struct_groups = [
        {"nameOrig": "C3330000001", "type": "TRANSFER",
         "txns": [(95000, 60), (94000, 63), (95500, 66), (96000, 68), (95500, 70)]},  # total ~476000, near 500000
        {"nameOrig": "C3330000002", "type": "CASH-OUT",
         "txns": [(32000, 130), (33000, 133), (35000, 136)]},  # total = 100000, near 100000
        {"nameOrig": "C3330000003", "type": "PAYMENT",
         "txns": [(48000, 230), (51000, 233), (49500, 236), (50500, 238)]},  # total = 199000, near 200000
    ]
    for sg in struct_groups:
        for amt, s in sg["txns"]:
            pattern_rows.append({
                "step": s, "type": sg["type"], "amount": float(amt),
                "nameOrig": sg["nameOrig"], "oldbalanceOrg": 600000.0,
                "newbalanceOrig": 600000.0 - float(amt),
                "nameDest": "M" + "".join(rng.choice(list("0123456789"), size=10)),
                "oldbalanceDest": 10000.0, "newbalanceDest": 10000.0 + float(amt),
                "isFraud": 0, "isFlaggedFraud": 0,
            })

    # Pattern 5: MIRROR TRANSACTIONS — A→B then B→A same amount within 48 steps (TRANSFER/CASH-OUT only)
    mirror_pairs = [
        {"a": "C2220000001", "b": "C1110000001", "amount": 85000.0, "fwd_step": 350, "rev_step": 360},
        {"a": "C2220000002", "b": "C1110000002", "amount": 120000.0, "fwd_step": 450, "rev_step": 470},
        {"a": "C2220000003", "b": "C1110000003", "amount": 50000.0, "fwd_step": 550, "rev_step": 565},
        {"a": "C2220000004", "b": "C1110000004", "amount": 200000.0, "fwd_step": 650, "rev_step": 680},
    ]
    for mp in mirror_pairs:
        # Forward: A → B
        pattern_rows.append({
            "step": mp["fwd_step"], "type": "TRANSFER", "amount": mp["amount"],
            "nameOrig": mp["a"], "oldbalanceOrg": 500000.0,
            "newbalanceOrig": 500000.0 - mp["amount"],
            "nameDest": mp["b"], "oldbalanceDest": 100000.0,
            "newbalanceDest": 100000.0 + mp["amount"],
            "isFraud": 1, "isFlaggedFraud": 0,
        })
        # Reverse: B → A
        pattern_rows.append({
            "step": mp["rev_step"], "type": "TRANSFER", "amount": mp["amount"],
            "nameOrig": mp["b"], "oldbalanceOrg": 100000.0 + mp["amount"],
            "newbalanceOrig": 100000.0,
            "nameDest": mp["a"], "oldbalanceDest": 500000.0 - mp["amount"],
            "newbalanceDest": 500000.0,
            "isFraud": 1, "isFlaggedFraud": 0,
        })

    # Combine base + pattern rows
    pattern_df = pd.DataFrame(pattern_rows)
    df = pd.concat([base_df, pattern_df], ignore_index=True)
    df = df.sort_values("step").reset_index(drop=True)

    stream = io.StringIO()
    df.to_csv(stream, index=False)
    stream.seek(0)

    return StreamingResponse(
        iter([stream.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=paysim_sample_500.csv"},
    )
