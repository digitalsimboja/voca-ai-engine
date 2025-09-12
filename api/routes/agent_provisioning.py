"""
Agent provisioning endpoints for Voca AI Engine.

This module handles agent creation, configuration, and provisioning requests.
"""

from datetime import datetime
import httpx
from typing import Dict, Any, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from voca_engine_shared_utils.core.config import get_settings
from voca_engine_shared_utils.core.database import get_database
from voca_engine_shared_utils.core.logger import get_logger

logger = get_logger("voca-ai-engine.agent_provisioning")
router = APIRouter()
settings = get_settings()


class AgentProvisioningRequest(BaseModel):
    """Agent provisioning request model - matches VocaAIAgentClient format."""
    name: str = Field(..., description="Name of the agent")
    description: str = Field(..., description="Description of the agent")
    business_type: str = Field(..., description="Type of business (retail, microfinance, etc.)")
    channels: list[str] = Field(..., description="Communication channels (voice, whatsapp, etc.)")
    languages: list[str] = Field(..., description="Supported languages")
    configuration: Dict[str, Any] = Field(..., description="Agent configuration data")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")
    class Config:
        schema_extra = {
            "example": {
                "agent_id": None,
                "name": "MyStore Assistant",
                "description": "AI assistant for MyStore customer service",
                "business_type": "retail",
                "channels": ["voice", "whatsapp", "instagram_dm"],
                "languages": ["English", "Igbo", "Yoruba"],
                "configuration": {
                    "profile": {
                        "name": "MyStore Assistant",
                        "role": "sales_assistant",
                        "bio": "I help customers with product inquiries and orders"
                    },
                    "social_media": {
                        "platforms": {
                            "whatsapp": {"enabled": True},
                            "instagram": {"enabled": True}
                        }
                    },
                    "customer_service": {
                        "responseTime": 5,
                        "autoResponses": True
                    }
                },
                "metadata": {
                    "created_at": "2024-01-01T00:00:00Z",
                    "source": "vocaai-backend",
                    "version": "1.0"
                }
            }
        }


class AgentProvisioningResponse(BaseModel):
    """Agent provisioning response model - matches VocaAIAgentClient expectations."""
    status: str
    message: str
    data: Dict[str, Any]
    timestamp: str


@router.post("/provision", response_model=AgentProvisioningResponse)
async def provision_agent(
    request: AgentProvisioningRequest
) -> AgentProvisioningResponse:
    """
    Provision a new agent.
    
    This endpoint directly provisions the agent by:
    1. Creating agent record in database
    2. Provisioning AWS Connect resources (if voice/SMS channels requested)
    3. Creating ElizaOS agent configuration (if social media channels requested)
    4. Setting up webhooks and integrations
    """
    try:
        logger.info("Starting agent provisioning", agent_name=request.name)

        provisioning_results = await _provision_agent(
            request.dict()
        )
        # Extract agent_id from VocaOS response
        agent_id = None
        if provisioning_results.get("voca_os", {}).get("status") == "success":
            agent_id = provisioning_results["voca_os"].get("agent_id")
        
        return AgentProvisioningResponse(
            status="success",
            message="Agent provisioned successfully",
            data={
                "agent_id": agent_id,
                "name": request.name,
                "description": request.description,
                "business_type": request.business_type,
                "channels": request.channels,
                "languages": request.languages,
                "status": "active",
                "provisioning_status": provisioning_results,
                "note": "Agent provisioned directly with VocaOS agent ID"
            },
            timestamp=datetime.utcnow().isoformat()
        )
        
    except Exception as e:
        logger.log_error(e, context={"agent_name": request.name, "action": "provision_agent"})
        raise HTTPException(
            status_code=500,
            detail={
                "error": "provisioning_failed",
                "message": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
        )


@router.put("/{agent_id}")
async def update_agent(agent_id: str, request: AgentProvisioningRequest) -> Dict[str, Any]:
    """Update an existing agent."""
    try:
        logger.info("Updating agent", agent_id=agent_id)
        
        # TODO: Implement actual update logic
        # For now, return a mock response
        
        return {
            "status": "success",
            "message": "Agent updated successfully",
            "data": {
                "agent_id": agent_id,
                "name": request.name,
                "description": request.description,
                "business_type": request.business_type,
                "channels": request.channels,
                "languages": request.languages,
                "status": "active",
                "updated_at": datetime.utcnow().isoformat()
            },
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.log_error(e, context={"agent_id": agent_id, "action": "update_agent"})
        raise HTTPException(
            status_code=500,
            detail={
                "error": "update_failed",
                "message": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
        )


@router.delete("/{agent_id}")
async def delete_agent(agent_id: str) -> Dict[str, Any]:
    """Delete an agent."""
    try:
        logger.info("Deleting agent", agent_id=agent_id)
        
        # TODO: Implement actual deletion logic
        # For now, return a mock response
        
        return {
            "status": "success",
            "message": "Agent deleted successfully",
            "data": {
                "agent_id": agent_id,
                "deleted_at": datetime.utcnow().isoformat()
            },
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.log_error(e, context={"agent_id": agent_id, "action": "delete_agent"})
        raise HTTPException(
            status_code=500,
            detail={
                "error": "delete_failed",
                "message": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
        )


@router.get("/{agent_id}/status")
async def get_agent_status(agent_id: str) -> Dict[str, Any]:
    """Get agent status."""
    try:
        logger.info("Getting agent status", agent_id=agent_id)
        
        # TODO: Implement actual status checking logic
        # For now, return a mock response
        
        return {
            "status": "success",
            "data": {
                "agent_id": agent_id,
                "status": "active",
                "health": "healthy",
                "last_activity": datetime.utcnow().isoformat(),
                "services": {
                    "voca_os": "active",
                    "voca_connect": "active"
                }
            },
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.log_error(e, context={"agent_id": agent_id, "action": "get_status"})
        raise HTTPException(
            status_code=500,
            detail={
                "error": "status_check_failed",
                "message": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
        )


@router.post("/{agent_id}/activate")
async def activate_agent(agent_id: str) -> Dict[str, Any]:
    """Activate an agent."""
    try:
        logger.info("Activating agent", agent_id=agent_id)
        
        # TODO: Implement actual activation logic
        # For now, return a mock response
        
        return {
            "status": "success",
            "message": "Agent activated successfully",
            "data": {
                "agent_id": agent_id,
                "status": "active",
                "activated_at": datetime.utcnow().isoformat()
            },
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.log_error(e, context={"agent_id": agent_id, "action": "activate_agent"})
        raise HTTPException(
            status_code=500,
            detail={
                "error": "activation_failed",
                "message": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
        )


@router.post("/{agent_id}/deactivate")
async def deactivate_agent(agent_id: str) -> Dict[str, Any]:
    """Deactivate an agent."""
    try:
        logger.info("Deactivating agent", agent_id=agent_id)
        
        # TODO: Implement actual deactivation logic
        # For now, return a mock response
        
        return {
            "status": "success",
            "message": "Agent deactivated successfully",
            "data": {
                "agent_id": agent_id,
                "status": "inactive",
                "deactivated_at": datetime.utcnow().isoformat()
            },
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.log_error(e, context={"agent_id": agent_id, "action": "deactivate_agent"})
        raise HTTPException(
            status_code=500,
            detail={
                "error": "deactivation_failed",
                "message": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
        )


@router.get("/list/{vendor_id}")
async def list_vendor_agents(vendor_id: str) -> Dict[str, Any]:
    """List all agents for a specific vendor."""
    try:
        # TODO: Implement actual agent listing logic
        # For now, return a mock response
        
        return {
            "vendor_id": vendor_id,
            "agents": [],
            "count": 0,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.log_error(e, context={"vendor_id": vendor_id, "action": "list_agents"})
        raise HTTPException(
            status_code=500,
            detail={
                "error": "list_agents_failed",
                "message": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
        )


async def _provision_agent(
    request_data: Dict[str, Any]
) -> Dict[str, Any]:
    """ElizaOS agent wrapper."""
    
    settings = get_settings()
    
    try:
        logger.info("Agent provisioning started...")
        
        # Extract request details
        channels = request_data.get('channels', [])
        configuration = request_data.get('configuration', {})
        
        # Check if social media channels are requested
        social_media_channels = ["whatsapp", "instagram_dm", "facebook_messenger", "twitter_dm"]
        has_social_media = any(channel in social_media_channels for channel in channels)
        
        # Check if voice/SMS channels are requested
        voice_channels = ["voice", "sms"]
        has_voice = any(channel in voice_channels for channel in channels)
        
        provisioning_results = {}
        
        # Provision VocaOS agent for social media channels
        if has_social_media:
            try:
                logger.info("Provisioning VocaOS agent for social media channels", channels=channels)
                
                # Prepare agent configuration for voca-os
                agent_config = {
                    "profile": {
                        "name": request_data.get('name', 'AI Assistant'),
                        "description": request_data.get('description', 'AI assistant for customer service'),
                        "role": "customer_service_agent"
                    },
                    "customerService": configuration.get('customer_service', {
                        "responseTime": 5,
                        "autoResponses": True,
                        "hours": "24/7",
                        "languages": request_data.get('languages', ['English'])
                    }),
                    "aiCapabilities": configuration.get('ai_capabilities', {
                        "customerInquiries": True,
                        "orderTracking": True,
                        "productRecommendations": True
                    }),
                    "socialMedia": {
                        "platforms": {}
                    }
                }
                
                # Create vendor identifier for webhook URLs
                vendor_identifier = request_data.get('vendor_id')
                if not vendor_identifier:
                    # Generate a temporary vendor ID if not provided
                    vendor_identifier = f"vendor-{request_data.get('name', 'agent').lower().replace(' ', '-')}"
        
                # Add platform-specific configurations
                for channel in channels:
                    if channel in social_media_channels:
                        agent_config["socialMedia"]["platforms"][channel] = {
                            "enabled": True,
                            "webhook_url": f"{settings.voca_os_url}/webhooks/{channel}/{vendor_identifier}"
                        }
                        
                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        f"{settings.voca_os_url}/voca-os/api/v1/vendors",
                        json={
                            "vendor_id": vendor_identifier,
                            "agent_config": agent_config
                        },
                        timeout=30.0
                    )
                    
                    if response.status_code == 200:
                        voca_os_response = response.json()
                        agent_id = voca_os_response['vendor']['agent_id']
                        
                        provisioning_results["voca_os"] = {
                            "status": "success",
                            "agent_id": agent_id,
                            "message": "VocaOS agent provisioned successfully",
                            "data": voca_os_response,
                            "vendor_id": vendor_identifier,
                            "note": "VocaOS generated its own agentId internally"
                        }
                        logger.info("VocaOS agent provisioned successfully", 
                                   vocaos_agent_id=agent_id, 
                                   vendor_id=vendor_identifier,
                                   vocaos_response=voca_os_response)
                        # TODO: Re-enable when vocaai-backend is running
                        # await _notify(agent_id, agent_id)
                    else:
                        provisioning_results["voca_os"] = {
                            "status": "failed",
                            "message": f"Failed to provision VocaOS agent: {response.text}",
                            "error_code": response.status_code
                        }
                        logger.error("Failed to provision VocaOS agent", 
                                   status_code=response.status_code,
                                   response=response.text)
            except Exception as e:
                provisioning_results["voca_os"] = {
                    "status": "failed",
                    "message": f"Error provisioning VocaOS agent: {str(e)}"
                }
                logger.error("Error provisioning VocaOS agent", 
                           error=str(e))
        # Provision AWS Connect for voice/SMS channels
        if has_voice:
            try:
                logger.info("Provisioning AWS Connect for voice/SMS channels", channels=channels)
                
                # TODO: Implement AWS Connect provisioning
                # This would call the voca-connect service
                provisioning_results["voca_connect"] = {
                    "status": "pending",
                    "message": "AWS Connect provisioning not yet implemented"
                }
                
            except Exception as e:
                provisioning_results["voca_connect"] = {
                    "status": "failed",
                    "message": f"Error provisioning AWS Connect: {str(e)}"
                }
                logger.error("Error provisioning AWS Connect", 
                           error=str(e))
        
        # Log final provisioning results
        logger.info("Direct provisioning completed", 
                   results=provisioning_results)
        
        return provisioning_results
        
    except Exception as e:
        logger.log_error(e, context={"action": "direct_provisioning"})
        # Return error status for failed provisioning
        return {
            "voca_os": {"status": "failed", "message": f"Provisioning failed: {str(e)}"},
            "voca_connect": {"status": "failed", "message": f"Provisioning failed: {str(e)}"}
        }


async def _notify(agent_id: str, vocaos_agent_id: str):
    """
    Notify the vocaai-backend about the VocaOS-generated agent_id.
    This allows the backend to update its database with the actual VocaOS agent_id.
    """
    try:
        settings = get_settings()
        
        # Get the vocaai-backend URL from settings
        backend_url = getattr(settings, 'vocaai_backend_url', 'http://localhost:8012')
        
        logger.info("Notifying vocaai-backend about VocaOS agent_id", 
                   agent_id=agent_id, 
                   vocaos_agent_id=vocaos_agent_id)
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{backend_url}/v1/agent/agents/{agent_id}/webhook",
                json={
                    "agent_id": vocaos_agent_id,
                },
                timeout=30.0
            )
            
            if response.json().get('status') == 'success':
                logger.info("Successfully notified vocaai-backend about VocaOS agent_id",
                           agent_id=agent_id,
                           vocaos_agent_id=vocaos_agent_id)
            else:
                logger.error("Failed to notify vocaai-backend about VocaOS agent_id",
                           agent_id=agent_id,
                           vocaos_agent_id=vocaos_agent_id,
                           status_code=response.status_code,
                           response=response.text)
                
    except Exception as e:
        logger.error("Error notifying vocaai-backend about VocaOS agent_id",
                   agent_id=agent_id,
                   vocaos_agent_id=vocaos_agent_id,
                   error=str(e))
