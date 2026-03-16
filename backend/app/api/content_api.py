from __future__ import annotations
import json, mimetypes, re
from datetime import date, datetime
from pathlib import Path
from uuid import uuid4
from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import FileResponse
router = APIRouter(tags=['content'])
WORKSPACE = Path.home() / '.openclaw' / 'workspace'
PRODUCTS_FILE = WORKSPACE / 'config' / 'zoviro-products.md'
PROMPTS_FILE = WORKSPACE / 'content' / 'prompts.json'
IMAGES_BASE = WORKSPACE / 'content' / 'product-images'
STRATEGIES_DIR = WORKSPACE / 'content' / 'strategies'
def _parse_products():
    if not PRODUCTS_FILE.exists(): return []
    md = PRODUCTS_FILE.read_text(encoding='utf-8'); products=[]; seen=set()
    for section in re.split(r'\n(?=### )', md):
        m = re.search(r'^###\s+(B\w{9,})\s*[—–-]+\s*(.+)', section, re.M)
        if not m: continue
        asin=m.group(1).strip()
        if asin in seen: continue
        seen.add(asin); name_match=re.search(r'产品名[：:]\s*\*?\*?\s*(.+)', section); name=(name_match.group(1).strip().strip('*') if name_match else m.group(2).strip()); category='Other'
        img_dir = IMAGES_BASE / asin
        images=[f'/api/content/images/{asin}/{p.name}' for p in img_dir.iterdir() if p.is_file() and p.suffix.lower() in {'.jpg','.jpeg','.png','.webp'}] if img_dir.exists() else []
        products.append({'asin': asin, 'name': name, 'category': category, 'images': images})
    return products
def _read_prompts():
    try: return json.loads(PROMPTS_FILE.read_text(encoding='utf-8'))
    except Exception: return []
def _write_prompts(prompts):
    PROMPTS_FILE.parent.mkdir(parents=True, exist_ok=True); PROMPTS_FILE.write_text(json.dumps(prompts, indent=2), encoding='utf-8')
@router.get('/api/content')
def get_content_root(): return {'items': [], 'demo': False}
@router.get('/api/content/products')
def get_content_products(): return {'products': _parse_products()}
@router.post('/api/content/strategy')
async def post_content_strategy(request: Request):
    body = await request.json(); strategy_type = body.get('type', 'aplus'); asin = body.get('asin') or ((body.get('asins') or [None])[0]); channels = body.get('channels') or []
    markdown = f"# {strategy_type.title()} Strategy\n\n- asin: {asin or ''}\n- category: {body.get('category','')}\n- season: {body.get('season','')}\n- scenario: {body.get('scenario','')}\n- channels: {', '.join(channels)}\n\n## Notes\n{body.get('extras') or 'No extra notes provided.'}\n"
    return {'markdown': markdown, 'prompts': [{'label': 'Primary prompt', 'prompt': f"Generate {strategy_type} assets for {asin or 'selected products'}"}]}
@router.get('/api/content/strategy/save')
def list_saved_content_strategies():
    STRATEGIES_DIR.mkdir(parents=True, exist_ok=True)
    return {'files': [{'filename': p.name, 'type': p.stem.split('-')[0], 'date': '-'.join(p.stem.split('-')[-3:]), 'sizeKb': round(p.stat().st_size/1024)} for p in STRATEGIES_DIR.glob('*.md')]}
@router.post('/api/content/strategy/save')
async def save_content_strategy(request: Request):
    body=await request.json(); strategy_type=body.get('type'); markdown=body.get('markdown'); asin=body.get('asin','all')
    if not strategy_type or not markdown: raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='type and markdown are required')
    STRATEGIES_DIR.mkdir(parents=True, exist_ok=True); filename=f"{strategy_type}-{asin}-{date.today().isoformat()}.md"; (STRATEGIES_DIR/filename).write_text(markdown, encoding='utf-8'); return {'ok': True, 'filename': filename}
@router.get('/api/content/prompts')
def get_content_prompts(starred: bool = Query(default=False)):
    prompts=_read_prompts();
    if starred: prompts=[p for p in prompts if p.get('starred')]
    prompts.sort(key=lambda p: ((not p.get('starred', False)), p.get('createdAt', '')))
    return {'prompts': prompts}
@router.post('/api/content/prompts')
async def create_content_prompt(request: Request):
    body=await request.json(); prompts=_read_prompts(); entry={'id': f'p_{int(datetime.utcnow().timestamp())}_{uuid4().hex[:5]}','starred':False,'createdAt':datetime.utcnow().isoformat(), **body}; prompts.insert(0,entry); _write_prompts(prompts); return {'prompt': entry}
@router.patch('/api/content/prompts')
async def update_content_prompt(request: Request, id: str = Query(...)):
    updates=await request.json(); prompts=_read_prompts()
    for idx,prompt in enumerate(prompts):
        if prompt.get('id') == id: prompts[idx]={**prompt, **updates}; _write_prompts(prompts); return {'prompt': prompts[idx]}
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Not found')
@router.delete('/api/content/prompts')
def delete_content_prompt(id: str = Query(...)):
    prompts=_read_prompts(); filtered=[p for p in prompts if p.get('id') != id]
    if len(filtered) == len(prompts): raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Not found')
    _write_prompts(filtered); return {'ok': True}
@router.get('/api/content/images')
def list_content_images(asin: str = Query(...)):
    directory=IMAGES_BASE/asin
    if not directory.exists(): return {'images': []}
    return {'images': [{'name': p.name, 'url': f'/api/content/images/{asin}/{p.name}'} for p in directory.iterdir() if p.is_file() and p.suffix.lower() in {'.jpg','.jpeg','.png','.webp'}]}
@router.post('/api/content/images')
async def upload_content_image(_: Request):
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail='Multipart image upload requires python-multipart in backend environment')
@router.delete('/api/content/images')
def delete_content_image(asin: str = Query(...), file: str = Query(...)):
    if '/' in file or '..' in file: raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Invalid filename')
    target = IMAGES_BASE / asin / file
    if not target.exists(): raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Not found')
    target.unlink(); return {'ok': True}
@router.get('/api/content/images/{asin}/{filename:path}')
def get_content_image(asin: str, filename: str):
    if '..' in filename: raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Forbidden')
    target = IMAGES_BASE / asin / filename
    if not target.exists(): raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Not found')
    return FileResponse(target, media_type=mimetypes.guess_type(target.name)[0] or 'application/octet-stream', headers={'Cache-Control':'public, max-age=3600'})
