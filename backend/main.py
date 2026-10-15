import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from routers import upload, benford, temporal, risk, duplicates, report, nlquery
from utils import state, cache_manager

# ─── Track server start time ───
_start_time = time.time()

app = FastAPI(title="AuditIQ API", description="AI-powered Financial Audit Analytics Platform")

# CORS — allow all origins for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Global Exception Handler ───
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={
            "error": True,
            "message": str(exc),
            "detail": f"Internal server error: {type(exc).__name__}",
        },
    )


# ─── Startup Event: Restore cached stats ───
@app.on_event("startup")
def restore_cached_stats():
    """Restore dataset statistics from cache on server restart."""
    cached_stats = cache_manager.load_cache("dataset_stats")
    if cached_stats:
        state.data["rows"] = cached_stats.get("rows", 0)
        state.data["fraud_count"] = cached_stats.get("fraud_count", 0)
        state.data["flagged_count"] = cached_stats.get("flagged_count", 0)
        state.data["filename"] = cached_stats.get("filename", None)
        print(f"[Startup] Restored cached stats: {cached_stats.get('rows', 0)} rows, file: {cached_stats.get('filename', 'N/A')}")
    else:
        print("[Startup] No cached stats found. Starting fresh.")


# ─── Routers ───
app.include_router(upload.router, prefix="/upload", tags=["Upload"])
app.include_router(benford.router, prefix="/benford", tags=["Benford"])
app.include_router(temporal.router, prefix="/temporal", tags=["Temporal"])
app.include_router(risk.router, prefix="/risk", tags=["Risk"])
app.include_router(duplicates.router, prefix="/duplicates", tags=["Duplicates"])
app.include_router(report.router, prefix="/report", tags=["Report"])
app.include_router(nlquery.router, prefix="/nlquery", tags=["NL Query"])


@app.get("/")
def read_root():
    return {"status": "AuditIQ API running"}


@app.get("/health")
def health_check():
    """Health check endpoint for monitoring."""
    # Gather module statuses
    modules = {}
    for mod_name in ["benford", "temporal_analysis", "risk_scoring", "duplicates", "audit_report"]:
        modules[mod_name] = cache_manager.load_cache(mod_name) is not None

    return {
        "status": "healthy",
        "dataset_loaded": state.data.get("df") is not None,
        "dataset_rows": state.data.get("rows", 0),
        "dataset_filename": state.data.get("filename", None),
        "modules_cached": modules,
        "uptime_seconds": round(time.time() - _start_time, 1),
        "version": "1.0.0",
    }
