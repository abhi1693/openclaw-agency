# ruff: noqa: INP001
from app.services.amazon_sync import _clean_json_stdout, inventory_status


def test_clean_json_stdout_filters_dotenv_noise() -> None:
    raw = '[dotenv@17.2.3] injecting env\n{"ok": true}\n'
    assert _clean_json_stdout(raw) == '{"ok": true}'


def test_inventory_status_thresholds() -> None:
    assert inventory_status(5) == 'critical'
    assert inventory_status(20) == 'lowStock'
    assert inventory_status(200) == 'healthy'
    assert inventory_status(900) == 'overstock'
