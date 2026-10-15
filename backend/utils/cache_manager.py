import os
import json
from pathlib import Path

CACHE_DIR = Path(__file__).parent.parent / "cache"

def _ensure_cache_dir():
    if not CACHE_DIR.exists():
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        # Create .gitignore inside cache to ignore all files
        with open(CACHE_DIR / ".gitignore", "w") as f:
            f.write("*\n!.gitignore\n")

def save_cache(module_name: str, data: dict):
    _ensure_cache_dir()
    cache_file = CACHE_DIR / f"{module_name}.json"
    with open(cache_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)

def load_cache(module_name: str) -> dict:
    cache_file = CACHE_DIR / f"{module_name}.json"
    if cache_file.exists():
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return None

def get_all_cached_results() -> dict:
    results = {}
    if not CACHE_DIR.exists():
        return results
    for file in CACHE_DIR.glob("*.json"):
        module_name = file.stem
        data = load_cache(module_name)
        if data:
            results[module_name] = data
    return results

def clear_cache():
    if CACHE_DIR.exists():
        for file in CACHE_DIR.glob("*.json"):
            file.unlink()
