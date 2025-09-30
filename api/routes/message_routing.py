"""
Message routing engine for Voca AI Engine.

This module handles incoming messages from various platforms (WhatsApp, Instagram, etc.)
and routes them to the correct agent based on vendor identification.
"""

from datetime import datetime
import httpx
from typing import Dict, Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from voca_engine_shared_utils.core.config import get_settings
from voca_engine_shared_utils.core.logger import get_logger

logger = get_logger("voca-ai-engine.message_routing")
router = APIRouter()
settings = get_settings()


class IncomingMessage(BaseModel):
    """Incoming message from external platform."""
    platform: str = Field(..., description="Platform (whatsapp, instagram, facebook_messenger, twitter, etc.)")
    message: str = Field(..., description="Message content")
    user_id: str = Field(..., description="User identifier (phone number, username, etc.)")
    vendor_id: Optional[str] = Field(None, description="Vendor identifier (if known)")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional platform-specific metadata")
    
    class Config:
        schema_extra = {
            "example": {
                "platform": "whatsapp",
                "message": "Where is my order #12345?",
                "user_id": "+1234567890",
                "vendor_id": "vendor-store-a",
                "metadata": {
                    "message_id": "msg_123",
                    "timestamp": "2024-01-01T12:00:00Z",
                    "from": "+1234567890",
                    "to": "+0987654321"
                }
            }
        }


class MessageResponse(BaseModel):
    """Response from message processing."""
    status: str
    message: str
    response: Optional[str] = None
    agent_id: Optional[str] = None
    vendor_id: Optional[str] = None
    processing_time_ms: Optional[int] = None
    timestamp: str

@router.post("/chat", response_model=MessageResponse)
async def route_message(request: IncomingMessage) -> MessageResponse:
    """
    Route incoming message to the correct agent.
    
    This endpoint:
    1. Identifies the correct agent based on vendor_id or user lookup
    2. Routes the message to the appropriate VocaOS agent
    3. Returns the agent's response
    """
    start_time = datetime.utcnow()
    
    try:
        # Step 2: Route message to VocaOS
        response = await _route_to_vocaos(request)
        
        # Debug logging
        logger.info("VocaOS response received", response_structure=response)
        
        processing_time = int((datetime.utcnow() - start_time).total_seconds() * 1000)
        
        return MessageResponse(
            status="success",
            message="Message routed and processed successfully",
            response=response.get("data", {}).get("response"),
            agent_id=response.get("data", {}).get("vendor_id", "unknown"),
            vendor_id=request.vendor_id,
            processing_time_ms=processing_time,
            timestamp=datetime.utcnow().isoformat()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.log_error(e, context={
            "platform": request.platform,
            "user_id": request.user_id,
            "vendor_id": request.vendor_id,
            "action": "route_message"
        })
        raise HTTPException(
            status_code=500,
            detail={
                "error": "routing_failed",
                "message": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
        )

@router.get("/agents/{agent_id}/status")
async def get_agent_status(agent_id: str) -> Dict[str, Any]:
    """Get the status of a specific agent."""
    try:
        logger.info("Getting agent status", agent_id=agent_id)
        
        # Check if agent exists in VocaOS
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{settings.voca_os_url}/voca-os/api/v1/pools",
                timeout=10.0
            )
            
            if response.status_code == 200:
                pools_data = response.json()
                
                # Search for the agent in all pools
                for pool in pools_data.get("pools", []):
                    for runtime in pool.get("vocaClient", {}).get("runtimeMetrics", {}).get("runtimes", []):
                        if runtime.get("agentId") == agent_id:
                            return {
                                "status": "success",
                                "agent_id": agent_id,
                                "agent_status": runtime.get("status", "unknown"),
                                "character": runtime.get("character", "unknown"),
                                "vendor_count": runtime.get("vendorCount", 0),
                                "vendors": runtime.get("vendors", []),
                                "timestamp": datetime.utcnow().isoformat()
                            }
                
                return {
                    "status": "not_found",
                    "message": f"Agent {agent_id} not found in VocaOS",
                    "timestamp": datetime.utcnow().isoformat()
                }
            else:
                raise HTTPException(
                    status_code=503,
                    detail={
                        "error": "vocaos_unavailable",
                        "message": "Unable to connect to VocaOS service",
                        "timestamp": datetime.utcnow().isoformat()
                    }
                )
                
    except Exception as e:
        logger.log_error(e, context={"agent_id": agent_id, "action": "get_agent_status"})
        raise HTTPException(
            status_code=500,
            detail={
                "error": "status_check_failed",
                "message": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
        )

async def _route_to_vocaos( request: IncomingMessage) -> Dict[str, Any]:
    """
    Route the message to the appropriate VocaOS agent.
    """
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.voca_os_url}/voca-os/api/v1/messages/process",
                json={
                    "vendor_id": f"vendor-{request.vendor_id}",
                    "message": request.message,
                    "platform": request.platform,
                    "user_id": request.user_id
                },
                timeout=30.0
            )
            
            if response.status_code == 200:
                vocaos_response = response.json()
                logger.info("Message processed by VocaOS", 
                           response_preview=vocaos_response.get("response", "")[:100] + "..." if len(vocaos_response.get("response", "")) > 100 else vocaos_response.get("response", ""))
                return vocaos_response
            else:
                logger.error("VocaOS processing failed", 
                           status_code=response.status_code,
                           response=response.text)
                raise HTTPException(
                    status_code=502,
                    detail={
                        "error": "vocaos_processing_failed",
                        "message": f"VocaOS returned status {response.status_code}: {response.text}",
                        "timestamp": datetime.utcnow().isoformat()
                    }
                )
                
    except httpx.TimeoutException:
        logger.error("Timeout routing message to VocaOS", vendor_id=request.vendor_id)
        raise HTTPException(
            status_code=504,
            detail={
                "error": "vocaos_timeout",
                "message": "VocaOS service timeout",
                "timestamp": datetime.utcnow().isoformat()
            }
        )
    except Exception as e:
        logger.error("Error routing message to VocaOS", 
                   vendor_id=request.vendor_id,
                   error_message=str(e))
        raise HTTPException(
            status_code=502,
            detail={
                "error": "routing_to_vocaos_failed",
                "message": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
        )
