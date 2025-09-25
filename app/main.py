"""
Voca AI Engine - Main FastAPI Application

This is the core orchestration service that handles agent provisioning requests
and coordinates with Voca OS (ElizaOS agents) and Voca Connect (AWS Connect).
"""

import os
import logging
from datetime import datetime
from typing import Dict, Any

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

# Import shared utils
from voca_engine_shared_utils.core.config import get_settings
from voca_engine_shared_utils.core.logger import get_logger
# Import only the routes we've created
from api.routes import health, agent_provisioning, service_status, message_routing, webhooks

URL_PREFIX = "/voca-engine/api/v1"

# Setup logging
logger = get_logger("voca-ai-engine")

# Get settings
settings = get_settings()

# Create FastAPI app
app = FastAPI(
    title="Voca AI Engine",
    description="Core orchestration service for agent routing and provisioning",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, prefix=f"{URL_PREFIX}/health", tags=["Health"])
app.include_router(agent_provisioning.router, prefix=f"{URL_PREFIX}/agent", tags=["Agent Provisioning"])
app.include_router(service_status.router, prefix=f"{URL_PREFIX}/status", tags=["Service Status"])
app.include_router(message_routing.router, prefix=f"{URL_PREFIX}/messages", tags=["Message Routing"])
app.include_router(webhooks.router, prefix="/webhooks", tags=["Webhooks"])

@app.on_event("startup")
async def startup_event():
    """Initialize the application on startup."""
    logger.info("Starting Voca AI Engine...")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on application shutdown."""
    logger.info("Shutting down Voca AI Engine...")

@app.get("/")
async def root():
    """Root endpoint with basic service information."""
    return {
        "service": "Voca AI Engine",
        "version": "1.0.0",
        "status": "running",
        "timestamp": datetime.utcnow().isoformat(),
        "environment": settings.app_env,
        "endpoints": {
            "health": f"{URL_PREFIX}/health",
            "docs": "/docs",
            "agent_provisioning": f"{URL_PREFIX}/agent",
            "service_status": f"{URL_PREFIX}/status",
            "message_routing": f"{URL_PREFIX}/messages",
            "webhooks": "/webhooks"
        }
    }

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler for unhandled errors."""
    logger.log_error(exc, context={"request_path": str(request.url)})
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "message": "An unexpected error occurred",
            "timestamp": datetime.utcnow().isoformat()
        }
    )

if __name__ == "__main__":
    # Run the application
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8008)),
        reload=settings.debug,
        log_level=settings.log_level.lower()
    )
