import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))

from build_train_box_models import derive_family


def test_drive_type_selects_body_family_for_every_metro_line() -> None:
    import json

    stock_path = ROOT / "cities" / "paris" / "data" / "rolling-stock.json"
    if not stock_path.exists():
        stock_path = ROOT / "data" / "rolling-stock.json"
    stock = json.loads(stock_path.read_text(encoding="utf-8"))
    expected = {
        "1": "pneumatic_generic", "2": "steel_classic", "3": "steel_classic",
        "3bis": "steel_classic", "4": "pneumatic_generic", "5": "steel_classic",
        "6": "pneumatic_generic", "7": "steel_classic", "7bis": "steel_classic",
        "8": "steel_classic", "9": "steel_classic", "10": "steel_classic",
        "11": "pneumatic_generic", "12": "steel_classic", "13": "steel_classic",
        "14": "pneumatic_generic",
    }
    for line, family in expected.items():
        model_id = stock["lines"][line]["model_id"]
        assert derive_family(model_id, stock["models"][model_id]) == family