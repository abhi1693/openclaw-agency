from __future__ import annotations
import json, time
from pathlib import Path
from fastapi import APIRouter
router = APIRouter(tags=['agents'])
OPENCLAW_JSON = Path.home() / '.openclaw' / 'openclaw.json'
AGENTS_DIR = Path.home() / '.openclaw' / 'agents'
@router.get('/api/agents/local')
def get_local_agents() -> dict:
    config = json.loads(OPENCLAW_JSON.read_text(encoding='utf-8')) if OPENCLAW_JSON.exists() else {}
    agent_list = config.get('agents', {}).get('list', [])
    default_model = config.get('agents', {}).get('defaults', {}).get('model', {}).get('primary', '')
    available_models = list((config.get('agents', {}).get('defaults', {}).get('models', {}) or {}).keys())
    agents=[]
    for agent in agent_list:
        sessions_file = AGENTS_DIR / agent.get('id','') / 'sessions' / 'sessions.json'; last_active=None; total_sessions=0; active_sessions=0
        if sessions_file.exists():
            try:
                sess_data=json.loads(sessions_file.read_text(encoding='utf-8')); entries=list(sess_data.values()); total_sessions=len(entries); active_sessions=len([s for s in entries if s.get('model')]); timestamps=[s.get('updatedAt',0) for s in entries if s.get('updatedAt')]; last_active=max(timestamps) if timestamps else None
            except Exception: pass
        model = agent.get('model'); model_id = model if isinstance(model, str) else (model or {}).get('primary', default_model)
        agents.append({'id': agent.get('id'),'name':agent.get('id'),'emoji':'🤖','role':'Agent','description':'','modelId':model_id,'modelLabel':(model_id or 'default').split('/')[-1],'modelRaw':model,'skills':len(agent.get('skills',[])),'lastActive':last_active,'totalSessions':total_sessions,'activeSessions':active_sessions,'online':bool(last_active and (time.time()*1000-last_active)<24*60*60*1000)})
    return {'agents': agents, 'defaultModel': default_model, 'availableModels': available_models}
