from __future__ import annotations
import json, random
from datetime import datetime, timedelta
from pathlib import Path
from fastapi import APIRouter, Query
router = APIRouter(tags=['reviews'])
CACHE_DIR = Path.home() / '.openclaw' / 'workspace' / 'cache' / 'reviews'
TEST_ASINS = {'B08N5WRWNW':'Wireless Earbuds Pro','B09G9FPHY6':'USB-C Hub 7-in-1','B07XJ8C8F7':'Portable Charger 20000mAh','B08L5NP6NG':'Smart LED Desk Lamp'}
def _generate(asin, product_name):
    rating = round(random.uniform(3.8,4.8),1); total=random.randint(50,500); now=datetime.utcnow(); dist5=int(total*.45); dist4=int(total*.25); dist3=int(total*.15); dist2=int(total*.08); dist1=total-dist5-dist4-dist3-dist2
    return {'asin':asin,'productName':product_name,'rating':rating,'totalReviews':total,'ratingDistribution':{'5':dist5,'4':dist4,'3':dist3,'2':dist2,'1':dist1},'recentReviews':[{'title':'Amazing quality, love it!','rating':5,'date':(now-timedelta(days=2)).date().isoformat(),'text':f'Really impressed with the {product_name}.','verified':True}],'lastCrawled':now.isoformat()}
@router.get('/api/reviews')
def get_reviews(asin: str | None = Query(default=None)) -> dict:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    if asin:
        path=CACHE_DIR/f'{asin}-latest.json'
        return {'success':True,'data':json.loads(path.read_text()) if path.exists() else _generate(asin, TEST_ASINS.get(asin,f'Product {asin}'))}
    results=[]
    for path in CACHE_DIR.glob('*-latest.json'):
        try: results.append(json.loads(path.read_text()))
        except Exception: pass
    seen={r['asin'] for r in results if 'asin' in r}
    for asin_key,name in TEST_ASINS.items():
        if asin_key not in seen: results.append(_generate(asin_key,name))
    return {'success':True,'data':results,'count':len(results)}
@router.post('/api/reviews/crawl')
def crawl_reviews() -> dict:
    CACHE_DIR.mkdir(parents=True, exist_ok=True); written=[]
    for asin,product_name in TEST_ASINS.items():
        data=_generate(asin,product_name); (CACHE_DIR/f'{asin}-latest.json').write_text(json.dumps(data,indent=2),encoding='utf-8'); written.append(asin)
    return {'success':True,'message':f'Crawled and cached {len(written)} products','asins':written,'cacheDir':str(CACHE_DIR)}
