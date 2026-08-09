"""Harness de TEST standalone (port séparé) — prouve les 3 endpoints read-only.
N'affecte PAS le hub live 8430. À lancer : uvicorn _publisher_api_standalone:app --port 8541
"""
from fastapi import FastAPI
from app.services.cofiapublisher.publisher_api import publisher_router

app = FastAPI(title="CofiaPublisher read-only API (TEST)")
app.include_router(publisher_router)


@app.get("/")
def root():
    return {"ok": True, "note": "TEST standalone read-only — hub live non touché"}
