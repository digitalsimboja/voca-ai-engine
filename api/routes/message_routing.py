"""
Message routing engine for Voca AI Engine.

This module handles incoming messages from various platforms (WhatsApp, Instagram, etc.)
and routes them to the correct agent based on vendor identification.
"""

from datetime import datetime
import httpx
from typing import Dict, Any, Optional
import re
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from voca_engine_shared_utils.core.config import get_settings
from voca_engine_shared_utils.core.database import get_database
from voca_engine_shared_utils.core.logger import get_logger

logger = get_logger("voca-ai-engine.message_routing")
router = APIRouter()
settings = get_settings()


class IncomingMessage(BaseModel):
    """Incoming message from external platform."""
    platform: str = Field(..., description="Platform (whatsapp, instagram_dm, facebook_messenger, etc.)")
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


class AgentLookupRequest(BaseModel):
    """Request for agent lookup by user identifier."""
    user_id: str = Field(..., description="User identifier")
    platform: str = Field(..., description="Platform")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional context")


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
        logger.info("Routing incoming message", 
                   platform=request.platform,
                   user_id=request.user_id,
                   vendor_id=request.vendor_id,
                   message_preview=request.message[:50] + "..." if len(request.message) > 50 else request.message)
        
        # Step 1: Determine the correct agent
        agent_info = await _determine_agent(request)
        
        if not agent_info:
            raise HTTPException(
                status_code=404,
                detail={
                    "error": "agent_not_found",
                    "message": f"No agent found for user {request.user_id} on platform {request.platform}",
                    "timestamp": datetime.utcnow().isoformat()
                }
            )
        
        logger.info("Agent determined", 
                   agent_id=agent_info["agent_id"],
                   vendor_id=agent_info["vendor_id"])
        
        # Step 2: Route message to VocaOS
        response = await _route_to_vocaos(agent_info, request)
        
        processing_time = int((datetime.utcnow() - start_time).total_seconds() * 1000)
        
        return MessageResponse(
            status="success",
            message="Message routed and processed successfully",
            response=response.get("response"),
            agent_id=agent_info["agent_id"],
            vendor_id=agent_info["vendor_id"],
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


@router.post("/lookup-agent", response_model=Dict[str, Any])
async def lookup_agent(request: AgentLookupRequest) -> Dict[str, Any]:
    """
    Lookup agent information by user identifier.
    
    This endpoint helps identify which agent should handle messages from a specific user.
    """
    try:
        logger.info("Looking up agent for user", 
                   user_id=request.user_id,
                   platform=request.platform)
        
        agent_info = await _lookup_agent_by_user(request.user_id, request.platform, request.metadata)
        
        if not agent_info:
            return {
                "status": "not_found",
                "message": f"No agent found for user {request.user_id}",
                "user_id": request.user_id,
                "platform": request.platform,
                "timestamp": datetime.utcnow().isoformat()
            }
        
        return {
            "status": "found",
            "message": "Agent found successfully",
            "agent_info": agent_info,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.log_error(e, context={
            "user_id": request.user_id,
            "platform": request.platform,
            "action": "lookup_agent"
        })
        raise HTTPException(
            status_code=500,
            detail={
                "error": "lookup_failed",
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


async def _determine_agent(request: IncomingMessage) -> Optional[Dict[str, Any]]:
    """
    Determine which agent should handle the message.
    
    Priority:
    1. If vendor_id is provided, use it directly
    2. If not, lookup agent by user_id and platform
    3. If still not found, try to infer from message content or metadata
    """
    
    # Priority 1: Direct vendor_id provided
    if request.vendor_id:
        logger.info("Using provided vendor_id", vendor_id=request.vendor_id)
        return {
            "agent_id": f"vendor-{request.vendor_id}",
            "vendor_id": request.vendor_id,
            "lookup_method": "direct_vendor_id"
        }
    
    # Priority 2: Lookup by user_id and platform
    agent_info = await _lookup_agent_by_user(request.user_id, request.platform, request.metadata)
    if agent_info:
        logger.info("Found agent via user lookup", agent_info=agent_info)
        return agent_info
    
    # Priority 3: Try to infer from message content or metadata
    inferred_agent = await _infer_agent_from_message(request)
    if inferred_agent:
        logger.info("Inferred agent from message", inferred_agent=inferred_agent)
        return inferred_agent
    
    logger.warning("No agent found for message", 
                  user_id=request.user_id,
                  platform=request.platform)
    return None


async def _lookup_agent_by_user(user_id: str, platform: str, metadata: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    """
    Lookup agent by user identifier.
    
    This would typically query a database or external service to find
    which agent/vendor is associated with a specific user.
    """
    
    # TODO: Implement actual database lookup
    # For now, we'll use some heuristics based on the test data we have
    
    # Check if this is a test user (for our current test agents)
    if user_id.startswith("+") or user_id.isdigit():
        # This looks like a phone number
        # For testing, we'll assign to the most recent agent
        # In production, this would be a database lookup
        
        # Get the latest agent from VocaOS
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{settings.voca_os_url}/voca-os/api/v1/pools",
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    pools_data = response.json()
                    
                    # Find the most recent agent (last in the list)
                    for pool in pools_data.get("pools", []):
                        runtimes = pool.get("vocaClient", {}).get("runtimeMetrics", {}).get("runtimes", [])
                        if runtimes:
                            # Get the last runtime (most recent)
                            latest_runtime = runtimes[-1]
                            if latest_runtime.get("agentId") and latest_runtime.get("agentId") != "default-runtime":
                                return {
                                    "agent_id": latest_runtime["agentId"],
                                    "vendor_id": latest_runtime["agentId"].replace("vendor-", ""),
                                    "lookup_method": "user_phone_lookup",
                                    "character": latest_runtime.get("character", "Unknown")
                                }
        except Exception as e:
            logger.error("Error looking up agent by user", error_message=str(e))
    
    return None


async def _infer_agent_from_message(request: IncomingMessage) -> Optional[Dict[str, Any]]:
    """
    Try to infer the correct agent from message content or metadata.
    
    This could analyze:
    - Message content for vendor-specific keywords
    - Metadata for platform-specific identifiers
    - User history or context
    """
    
    # TODO: Implement intelligent agent inference
    # For now, return None to indicate no inference possible
    return None


async def _route_to_vocaos(agent_info: Dict[str, Any], request: IncomingMessage) -> Dict[str, Any]:
    """
    Route the message to the appropriate VocaOS agent.
    """
    
    try:
        logger.info("Routing message to VocaOS", 
                   agent_id=agent_info["agent_id"],
                   vendor_id=agent_info["vendor_id"])
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.voca_os_url}/voca-os/api/v1/messages",
                json={
                    "vendor_id": agent_info["vendor_id"],
                    "message": request.message,
                    "platform": request.platform,
                    "user_id": request.user_id
                },
                timeout=30.0
            )
            
            if response.status_code == 200:
                vocaos_response = response.json()
                logger.info("Message processed by VocaOS", 
                           agent_id=agent_info["agent_id"],
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
        logger.error("Timeout routing message to VocaOS", agent_id=agent_info["agent_id"])
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
                   agent_id=agent_info["agent_id"],
                   error_message=str(e))
        raise HTTPException(
            status_code=502,
            detail={
                "error": "routing_to_vocaos_failed",
                "message": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
        )
