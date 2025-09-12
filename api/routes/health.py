"""
Health check endpoints for Voca AI Engine.

This module provides health check endpoints for monitoring service status.
"""

from datetime import datetime
from typing import Dict, Any

from fastapi import APIRouter, HTTPException
import httpx

from voca_engine_shared_utils.core.config import get_settings
from voca_engine_shared_utils.core.database import get_database
from voca_engine_shared_utils.core.logger import get_logger

logger = get_logger("voca-ai-engine.health")
router = APIRouter()
settings = get_settings()


@router.get("")
async def health_check() -> Dict[str, Any]:
    """Basic health check endpoint."""
    return {
        "status": "healthy",
        "service": "Voca AI Engine",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat(),
        "environment": settings.app_env
    }


@router.get("/detailed")
async def detailed_health_check() -> Dict[str, Any]:
    """Detailed health check with dependency status."""
    health_status = {
        "status": "healthy",
        "service": "Voca AI Engine",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat(),
        "environment": settings.app_env,
        "dependencies": {}
    }
    
    overall_healthy = True
    
    # Check database connection
    try:
        db = get_database()
        await db.test_connection()
        health_status["dependencies"]["database"] = {
            "status": "healthy",
            "url": settings.database_url.split("@")[1] if "@" in settings.database_url else "hidden",
            "message": "Connection successful"
        }
    except Exception as e:
        logger.log_error(e, context={"check_type": "database"})
        health_status["dependencies"]["database"] = {
            "status": "unhealthy",
            "message": str(e)
        }
        overall_healthy = False
    
    # Check Voca OS service
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{settings.voca_os_url}/health")
            if response.status_code == 200:
                health_status["dependencies"]["voca_os"] = {
                    "status": "healthy",
                    "url": settings.voca_os_url,
                    "message": "Service responding"
                }
            else:
                health_status["dependencies"]["voca_os"] = {
                    "status": "unhealthy",
                    "url": settings.voca_os_url,
                    "message": f"HTTP {response.status_code}"
                }
                overall_healthy = False
    except Exception as e:
        logger.warning("Voca OS health check failed", error=str(e), service="voca_os")
        health_status["dependencies"]["voca_os"] = {
            "status": "unhealthy",
            "url": settings.voca_os_url,
            "message": str(e)
        }
        overall_healthy = False
    
    # Check Voca Connect service
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{settings.voca_connect_url}/health")
            if response.status_code == 200:
                health_status["dependencies"]["voca_connect"] = {
                    "status": "healthy",
                    "url": settings.voca_connect_url,
                    "message": "Service responding"
                }
            else:
                health_status["dependencies"]["voca_connect"] = {
                    "status": "unhealthy",
                    "url": settings.voca_connect_url,
                    "message": f"HTTP {response.status_code}"
                }
                overall_healthy = False
    except Exception as e:
        logger.warning("Voca Connect health check failed", error=str(e), service="voca_connect")
        health_status["dependencies"]["voca_connect"] = {
            "status": "unhealthy",
            "url": settings.voca_connect_url,
            "message": str(e)
        }
        overall_healthy = False
    
    # Set overall status
    health_status["status"] = "healthy" if overall_healthy else "degraded"
    
    return health_status


@router.get("/ready")
async def readiness_check() -> Dict[str, Any]:
    """Readiness check for Kubernetes/container orchestration."""
    try:
        # Check if database is ready
        db = get_database()
        await db.test_connection()
        
        return {
            "status": "ready",
            "service": "Voca AI Engine",
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.log_error(e, context={"check_type": "readiness"})
        raise HTTPException(
            status_code=503,
            detail={
                "status": "not_ready",
                "service": "Voca AI Engine",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
        )


@router.get("/live")
async def liveness_check() -> Dict[str, Any]:
    """Liveness check for Kubernetes/container orchestration."""
    return {
        "status": "alive",
        "service": "Voca AI Engine",
        "timestamp": datetime.utcnow().isoformat()
    }
