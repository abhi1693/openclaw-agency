from __future__ import annotations
import json, random
from datetime import date, timedelta
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query, Request, status
router = APIRouter(tags=['keywords'])
WORKSPACE = Path.home() / '.openclaw' / 'workspace'
CONFIG_FILE = WORKSPACE / 'config' / 'keywords.json'
RANKINGS_DIR = WORKSPACE / 'cache' / 'rankings'
def _read_keywords():
    try: return json.loads(CONFIG_FILE.read_text(encoding='utf-8')).get('keywords', [])
    except Exception: return []
def _write_keywords(keywords):
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True); CONFIG_FILE.write_text(json.dumps({'keywords': keywords}, indent=2), encoding='utf-8')
def _last_days(n=30):
    today = date.today(); return [(today - timedelta(days=i)).isoformat() for i in range(n-1,-1,-1)]
@router.get('/api/keywords/config')
def get_keywords_config(): return {'keywords': _read_keywords()}
@router.post('/api/keywords/config')
async def add_keyword_config(request: Request):
    body = await request.json(); asin = body.get('asin'); keyword = body.get('keyword')
    if not asin or not keyword: raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='asin and keyword required')
    keywords = _read_keywords()
    if any(item.get('asin') == asin and item.get('keyword') == keyword for item in keywords): raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='Already exists')
    keywords.append({'asin': asin, 'keyword': keyword, 'addedAt': date.today().isoformat()}); _write_keywords(keywords); return {'success': True, 'keywords': keywords}
@router.delete('/api/keywords/config')
def delete_keyword_config(asin: str = Query(...), keyword: str = Query(...)):
    keywords=[item for item in _read_keywords() if not (item.get('asin') == asin and item.get('keyword') == keyword)]; _write_keywords(keywords); return {'success': True, 'keywords': keywords}
@router.post('/api/keywords/crawl')
def crawl_keywords():
    keywords = _read_keywords()
    if not keywords: return {'message': 'No keywords configured', 'crawled': 0}
    RANKINGS_DIR.mkdir(parents=True, exist_ok=True); out_file = RANKINGS_DIR / f'{date.today().isoformat()}.json'
    try: today_data = json.loads(out_file.read_text(encoding='utf-8')) if out_file.exists() else {}
    except Exception: today_data = {}
    for item in keywords: today_data[f"{item['asin']}|{item['keyword']}"] = {'keyword': item['keyword'], 'asin': item['asin'], 'organicRank': random.randint(1, 50), 'adRank': random.randint(1, 10)}
    out_file.write_text(json.dumps(today_data, indent=2), encoding='utf-8'); return {'success': True, 'crawled': len(keywords), 'date': date.today().isoformat(), 'results': list(today_data.values())}
@router.get('/api/keywords/rankings')
def get_keyword_rankings():
    keywords=_read_keywords(); history_map={}
    for day in _last_days(30):
        path = RANKINGS_DIR / f'{day}.json'
        if not path.exists(): continue
        try: data = json.loads(path.read_text(encoding='utf-8'))
        except Exception: continue
        for entry in data.values(): history_map.setdefault(f"{entry['asin']}|{entry['keyword']}", []).append({'date': day, 'organicRank': entry['organicRank'], 'adRank': entry['adRank']})
    rankings=[]
    for item in keywords:
        key=f"{item['asin']}|{item['keyword']}"; history=history_map.get(key, []); current=history[-1]['organicRank'] if history else None; change7d=0; trend='stable'
        if len(history)>=2:
            recent=history[-1]['organicRank']; old=history[-7]['organicRank'] if len(history)>=7 else history[0]['organicRank']; change7d=old-recent; trend='up' if change7d>0 else 'down' if change7d<0 else 'stable'
        rankings.append({'keyword': item['keyword'], 'asin': item['asin'], 'history': history, 'currentRank': current, 'change7d': change7d, 'trend': trend})
    last_crawled=next((day for day in reversed(_last_days(30)) if (RANKINGS_DIR / f'{day}.json').exists()), None)
    return {'rankings': rankings, 'lastCrawled': last_crawled}
@router.post('/api/keywords/rankings')
def create_keyword_ranking():
    keywords=_read_keywords()
    if not keywords: return {'message':'No keywords configured'}
    item=keywords[0]; return {'result': {'keyword': item['keyword'], 'asin': item['asin'], 'organicRank': random.randint(1,50), 'adRank': random.randint(1,10)}}
