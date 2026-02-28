#!/usr/bin/env python3
"""
Crime Scene — Backend Proxy

Provides a custom LLM webhook for ElevenLabs Conversational AI.
API keys live here (server-side) instead of in the browser.

── Setup ──────────────────────────────────────────────────────
    cp .env.example .env      # then fill in your keys
    pip install -r requirements.txt
    uvicorn server:app --reload --port 8080

── Exposing to ElevenLabs (development) ──────────────────────
    ElevenLabs servers need to reach this endpoint. Use ngrok:
        ngrok http 8080
    Then set the public URL in ElevenLabs Dashboard:
        Agent → LLM → Custom LLM → URL: https://<ngrok-id>.ngrok.io/api/llm
"""

import os
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import httpx
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Crime Scene Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten to your domain in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Config ───────────────────────────────────────────────────

LLM_API_KEY  = os.getenv("LLM_API_KEY",  "")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.mistral.ai/v1").rstrip("/")
LLM_MODEL    = os.getenv("LLM_MODEL",    "mistral-small-latest")
FAL_API_KEY  = os.getenv("FAL_API_KEY",  "")
IMAGE_MODEL  = os.getenv("IMAGE_MODEL",  "fal-ai/flux/schnell")

# ── Health ───────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "llm_configured":   bool(LLM_API_KEY),
        "image_configured": bool(FAL_API_KEY),
    }

# ── Custom LLM Webhook (ElevenLabs Conversational AI) ────────

@app.post("/api/llm")
async def custom_llm_webhook(request: Request):
    """
    ElevenLabs calls this endpoint for every LLM turn.
    It sends an OpenAI-compatible streaming request; we forward it
    to the real LLM provider and stream the response back.

    Configure in ElevenLabs Dashboard:
      Agent → LLM → Custom LLM URL → <your-public-url>/api/llm
    """
    body = await request.json()

    messages    = body.get("messages",    [])
    max_tokens  = body.get("max_tokens",  350)
    temperature = body.get("temperature", 0.85)

    async def stream():
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST",
                f"{LLM_BASE_URL}/chat/completions",
                headers={
                    "Content-Type":  "application/json",
                    "Authorization": f"Bearer {LLM_API_KEY}",
                },
                json={
                    "model":       LLM_MODEL,
                    "messages":    messages,
                    "max_tokens":  max_tokens,
                    "temperature": temperature,
                    "stream":      True,
                },
            ) as resp:
                async for chunk in resp.aiter_text():
                    yield chunk

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "X-Accel-Buffering": "no",
        },
    )

# ── Image Generation Proxy (optional — keeps fal.ai key server-side) ─

@app.post("/api/image")
async def image_proxy(request: Request):
    """
    Optional: proxy fal.ai image generation so the API key
    never reaches the browser. Set backendUrl in config.js
    and update generateImage() in services.js to use this route.
    """
    if not FAL_API_KEY:
        return JSONResponse({"error": "Image generation not configured."}, status_code=503)

    body = await request.json()

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"https://fal.run/{IMAGE_MODEL}",
            headers={
                "Authorization": f"Key {FAL_API_KEY}",
                "Content-Type":  "application/json",
            },
            json=body,
        )

    return JSONResponse(content=resp.json(), status_code=resp.status_code)
