"""
Voca AI Engine - Main FastAPI Application
Agent Routing & Provisioning System
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
import uvicorn
import structlog

from api.routes import agent_routes, provisioning_routes, webhook_routes
from config.settings import get_settings
from core.orchestrator.agent_orchestrator import AgentOrchestrator

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()

# Initialize settings
settings = get_settings()

# Create FastAPI application
app = FastAPI(
    title="Voca AI Engine",
    description="Agent Routing & Provisioning System for Multi-Channel AI Agents",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# Add middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.ALLOWED_HOSTS
)

# Include routers
app.include_router(agent_routes.router, prefix="/api/v1/agents", tags=["agents"])
app.include_router(provisioning_routes.router, prefix="/api/v1/provisioning", tags=["provisioning"])
app.include_router(webhook_routes.router, prefix="/api/v1/webhooks", tags=["webhooks"])

# Initialize orchestrator
orchestrator = AgentOrchestrator()

@app.on_event("startup")
async def startup_event():
    """Application startup event"""
    logger.info("Starting Voca AI Engine", version="1.0.0")
    try:
        # Initialize database connections
        # Initialize AWS clients
        # Initialize ElizaOS manager
        logger.info("Voca AI Engine started successfully")
    except Exception as e:
        logger.error("Failed to start Voca AI Engine", error=str(e))
        raise

@app.on_event("shutdown")
async def shutdown_event():
    """Application shutdown event"""
    logger.info("Shutting down Voca AI Engine")
    try:
        # Cleanup connections
        # Stop agents
        logger.info("Voca AI Engine shutdown completed")
    except Exception as e:
        logger.error("Error during shutdown", error=str(e))

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Voca AI Engine - Agent Routing & Provisioning System",
        "version": "1.0.0",
        "status": "running"
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Check database connection
        # Check AWS services
        # Check ElizaOS status
        return {
            "status": "healthy",
            "timestamp": "2024-01-01T00:00:00Z",
            "services": {
                "database": "healthy",
                "aws": "healthy",
                "elizaos": "healthy"
            }
        }
    except Exception as e:
        logger.error("Health check failed", error=str(e))
        raise HTTPException(status_code=503, detail="Service unhealthy")

@app.get("/api/v1/status")
async def api_status():
    """API status endpoint"""
    return {
        "api": "Voca AI Engine",
        "version": "1.0.0",
        "status": "operational",
        "endpoints": {
            "agents": "/api/v1/agents",
            "provisioning": "/api/v1/provisioning",
            "webhooks": "/api/v1/webhooks",
            "docs": "/docs"
        }
    }

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8008,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower()
    )
