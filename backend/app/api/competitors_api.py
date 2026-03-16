from __future__ import annotations

import json, re, subprocess
from datetime import datetime, timedelta
from pathlib import Path
from fastapi import APIRouter, Query

router = APIRouter(tags=['competitors'])
BASE = Path.home() / '.openclaw' / 'skills' / 'amazon-sp-api'
REPORTS = BASE / 'reports' / 'competitors'
LATEST, ALERTS, HISTORY = REPORTS / 'latest.json', REPORTS / 'alerts.json', REPORTS / 'history.json'
COMP_FILE = BASE / 'lib' / 'competitors.js'

def _load(path: Path, default):
    try: return json.loads(path.read_text(encoding='utf-8'))
    except Exception: return default

def _save(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding='utf-8')

def _read_competitors():
    if COMP_FILE.exists():
        text = COMP_FILE.read_text(encoding='utf-8')
        matches = re.findall(r"asin:\s*'([A-Z0-9]{10})'.*?name:\s*'([^']+)'.*?brand:\s*'([^']+)'.*?category:\s*'([^']+)'", text, re.S)
        if matches: return [{'asin': a, 'name': n, 'brand': b, 'category': c} for a, n, b, c in matches]
    return [{'asin': 'B08N5WRWNW', 'name': 'Wireless Earbuds Pro', 'brand': 'Generic', 'category': 'Electronics'}]

def _run_node_snapshot(asin: str) -> dict:
    data = {'price': None, 'currency': 'USD', 'hasDeal': False, 'couponText': None, 'rating': None, 'reviewCount': None, 'imageUrl': None, 'bsr': None}
    for kind in ('pricing', 'listing'):
        try:
            result = subprocess.run(['node', str(BASE / 'index.js'), kind, '--asin', asin], capture_output=True, text=True, timeout=30, check=False)
            cleaned = '\n'.join(line for line in result.stdout.splitlines() if not line.startswith('[dotenv'))
            match = re.search(r'([\[{].*)', cleaned, re.S)
            payload = json.loads(match.group(1)) if match else {}
            if kind == 'pricing':
                data['price'] = payload.get('landedPrice') or payload.get('listingPrice') or payload.get('price')
                data['currency'] = payload.get('currency', 'USD')
                data['hasDeal'] = bool(payload.get('salePrice') or payload.get('dealPrice') or payload.get('couponDiscount'))
                data['couponText'] = payload.get('couponText')
            else:
                data['rating'] = payload.get('rating') or payload.get('averageRating')
                data['reviewCount'] = payload.get('reviewCount') or payload.get('numberOfReviews')
                data['imageUrl'] = payload.get('mainImage') or payload.get('imageUrl')
                data['bsr'] = payload.get('bsr') or payload.get('salesRank')
        except Exception:
            pass
    return data

@router.get('/api/competitors')
def get_competitors() -> dict:
    data = _load(LATEST, [])
    return {'data': data, 'noData': len(data) == 0}

@router.get('/api/competitors/alerts')
def get_competitor_alerts() -> dict:
    alerts = _load(ALERTS, [])
    return {'alerts': alerts, 'noData': len(alerts) == 0}

@router.get('/api/competitors/history')
def get_competitor_history(asin: str | None = Query(default=None), days: int = Query(default=30)) -> dict:
    history = _load(HISTORY, [])
    if asin: history = [item for item in history if item.get('asin') == asin]
    cutoff = datetime.utcnow() - timedelta(days=days)
    history = [item for item in history if item.get('snapshotTime', '') >= cutoff.isoformat()]
    return {'data': history, 'noData': len(history) == 0}

@router.post('/api/competitors/snapshot')
def create_competitor_snapshot() -> dict:
    prev = {item.get('asin'): item for item in _load(LATEST, [])}
    existing_alerts = _load(ALERTS, [])
    timestamp = datetime.utcnow().isoformat()
    snapshot, alerts = [], []
    for item in _read_competitors():
        curr = {**item, **_run_node_snapshot(item['asin']), 'timestamp': timestamp}
        prev_item = prev.get(item['asin'])
        if prev_item and prev_item.get('price') and curr.get('price') and prev_item['price'] != curr['price']:
            alerts.append({'asin': item['asin'], 'name': item['name'], 'type': 'price_change', 'oldValue': prev_item['price'], 'newValue': curr['price'], 'timestamp': timestamp, 'message': f"Price changed from {prev_item['price']} to {curr['price']}"})
        snapshot.append(curr)
    history = _load(HISTORY, []) + [{**item, 'snapshotTime': timestamp} for item in snapshot]
    _save(LATEST, snapshot); _save(HISTORY, history); _save(ALERTS, (existing_alerts + alerts)[-100:])
    return {'snapshot': snapshot, 'alerts': alerts, 'timestamp': timestamp}
