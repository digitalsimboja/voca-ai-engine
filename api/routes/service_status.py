"""
Service status endpoints for Voca AI Engine.

This module provides endpoints for monitoring the status of dependent services.
"""

from datetime import datetime
from typing import Dict, Any

from fastapi import APIRouter, HTTPException
import httpx

from voca_engine_shared_utils.core.config import get_settings
from voca_engine_shared_utils.core.logger import get_logger

logger = get_logger("voca-ai-engine.service_status")
router = APIRouter()
settings = get_settings()


@router.get("/")
async def get_all_services_status() -> Dict[str, Any]:
    """Get status of all dependent services."""
    services_status = {
        "timestamp": datetime.utcnow().isoformat(),
        "services": {}
    }
    
    # Check Voca OS service
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{settings.voca_os_url}/health")
            if response.status_code == 200:
                data = response.json()
                services_status["services"]["voca_os"] = {
                    "status": "healthy",
                    "url": settings.voca_os_url,
                    "response_time_ms": response.elapsed.total_seconds() * 1000,
                    "details": data
                }
            else:
                services_status["services"]["voca_os"] = {
                    "status": "unhealthy",
                    "url": settings.voca_os_url,
                    "error": f"HTTP {response.status_code}"
                }
    except Exception as e:
        services_status["services"]["voca_os"] = {
            "status": "unreachable",
            "url": settings.voca_os_url,
            "error": str(e)
        }
    
    # Check Voca Connect service
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{settings.voca_connect_url}/health")
            if response.status_code == 200:
                data = response.json()
                services_status["services"]["voca_connect"] = {
                    "status": "healthy",
                    "url": settings.voca_connect_url,
                    "response_time_ms": response.elapsed.total_seconds() * 1000,
                    "details": data
                }
            else:
                services_status["services"]["voca_connect"] = {
                    "status": "unhealthy",
                    "url": settings.voca_connect_url,
                    "error": f"HTTP {response.status_code}"
                }
    except Exception as e:
        services_status["services"]["voca_connect"] = {
            "status": "unreachable",
            "url": settings.voca_connect_url,
            "error": str(e)
        }
    
    # Determine overall status
    all_healthy = all(
        service.get("status") == "healthy" 
        for service in services_status["services"].values()
    )
    services_status["overall_status"] = "healthy" if all_healthy else "degraded"
    
    return services_status


@router.get("/voca-os")
async def get_voca_os_status() -> Dict[str, Any]:
    """Get detailed status of Voca OS service."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{settings.voca_os_url}/health")
            
            if response.status_code == 200:
                data = response.json()
                return {
                    "service": "voca_os",
                    "status": "healthy",
                    "url": settings.voca_os_url,
                    "response_time_ms": response.elapsed.total_seconds() * 1000,
                    "timestamp": datetime.utcnow().isoformat(),
                    "details": data
                }
            else:
                return {
                    "service": "voca_os",
                    "status": "unhealthy",
                    "url": settings.voca_os_url,
                    "error": f"HTTP {response.status_code}",
                    "timestamp": datetime.utcnow().isoformat()
                }
                
    except Exception as e:
        logger.log_error(e, context={"service": "voca_os", "action": "check_status"})
        return {
            "service": "voca_os",
            "status": "unreachable",
            "url": settings.voca_os_url,
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }


@router.get("/voca-connect")
async def get_voca_connect_status() -> Dict[str, Any]:
    """Get detailed status of Voca Connect service."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{settings.voca_connect_url}/health")
            
            if response.status_code == 200:
                data = response.json()
                return {
                    "service": "voca_connect",
                    "status": "healthy",
                    "url": settings.voca_connect_url,
                    "response_time_ms": response.elapsed.total_seconds() * 1000,
                    "timestamp": datetime.utcnow().isoformat(),
                    "details": data
                }
            else:
                return {
                    "service": "voca_connect",
                    "status": "unhealthy",
                    "url": settings.voca_connect_url,
                    "error": f"HTTP {response.status_code}",
                    "timestamp": datetime.utcnow().isoformat()
                }
                
    except Exception as e:
        logger.log_error(e, context={"service": "voca_connect", "action": "check_status"})
        return {
            "service": "voca_connect",
            "status": "unreachable",
            "url": settings.voca_connect_url,
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }


@router.post("/voca-os/restart")
async def restart_voca_os() -> Dict[str, Any]:
    """Request Voca OS service restart (if supported)."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(f"{settings.voca_os_url}/admin/restart")
            
            if response.status_code == 200:
                return {
                    "service": "voca_os",
                    "action": "restart_requested",
                    "status": "success",
                    "timestamp": datetime.utcnow().isoformat()
                }
            else:
                return {
                    "service": "voca_os",
                    "action": "restart_requested",
                    "status": "failed",
                    "error": f"HTTP {response.status_code}",
                    "timestamp": datetime.utcnow().isoformat()
                }
                
    except Exception as e:
        logger.log_error(e, context={"service": "voca_os", "action": "restart"})
        raise HTTPException(
            status_code=500,
            detail={
                "service": "voca_os",
                "action": "restart_requested",
                "status": "error",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
        )


@router.post("/voca-connect/restart")
async def restart_voca_connect() -> Dict[str, Any]:
    """Request Voca Connect service restart (if supported)."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(f"{settings.voca_connect_url}/admin/restart")
            
            if response.status_code == 200:
                return {
                    "service": "voca_connect",
                    "action": "restart_requested",
                    "status": "success",
                    "timestamp": datetime.utcnow().isoformat()
                }
            else:
                return {
                    "service": "voca_connect",
                    "action": "restart_requested",
                    "status": "failed",
                    "error": f"HTTP {response.status_code}",
                    "timestamp": datetime.utcnow().isoformat()
                }
                
    except Exception as e:
        logger.log_error(e, context={"service": "voca_connect", "action": "restart"})
        raise HTTPException(
            status_code=500,
            detail={
                "service": "voca_connect",
                "action": "restart_requested",
                "status": "error",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
        )
