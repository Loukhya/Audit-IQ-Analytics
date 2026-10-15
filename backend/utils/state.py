# Shared in-memory state for the AuditIQ session
from .cache_manager import save_cache, load_cache


data = {
    "df": None,           # pandas DataFrame — the loaded dataset
    "filename": None,     # str — original uploaded filename
    "rows": 0,            # int
    "fraud_count": 0,     # int
    "flagged_count": 0,   # int
    "transaction_types": {},  # dict
    "amount_stats": {}    # dict
}
