"""
Provisioning Routes
"""

from fastapi import APIRouter, HTTPException, Depends, status
import structlog

from core.orchestrator.agent_orchestrator import AgentOrchestrator
from api.middleware.auth import get_current_user

logger = structlog.get_logger()
router = APIRouter()

# Initialize orchestrator
orchestrator = AgentOrchestrator()


@router.post("/{agent_id}/provision")
async def start_provisioning(
    agent_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Start agent provisioning"""
    try:
        logger.info("Starting agent provisioning", user_id=current_user["id"], agent_id=agent_id)
        
        result = await orchestrator.start_provisioning(agent_id)
        
        return {
            "message": "Provisioning started",
            "agent_id": agent_id,
            "provisioning_id": result["provisioning_id"]
        }
        
    except Exception as e:
        logger.error("Failed to start provisioning", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start provisioning: {str(e)}"
        )


@router.get("/{agent_id}/provisioning-status")
async def get_provisioning_status(
    agent_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get provisioning status"""
    try:
        logger.info("Getting provisioning status", user_id=current_user["id"], agent_id=agent_id)
        
        status = await orchestrator.get_provisioning_status(agent_id)
        
        return status
        
    except Exception as e:
        logger.error("Failed to get provisioning status", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get provisioning status: {str(e)}"
        )


@router.post("/{agent_id}/deprovision")
async def deprovision_agent(
    agent_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Deprovision agent"""
    try:
        logger.info("Deprovisioning agent", user_id=current_user["id"], agent_id=agent_id)
        
        result = await orchestrator.deprovision_agent(agent_id)
        
        return {
            "message": "Agent deprovisioned successfully",
            "agent_id": agent_id
        }
        
    except Exception as e:
        logger.error("Failed to deprovision agent", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to deprovision agent: {str(e)}"
        )


@router.get("/{agent_id}/logs")
async def get_provisioning_logs(
    agent_id: str,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """Get provisioning logs"""
    try:
        logger.info("Getting provisioning logs", user_id=current_user["id"], agent_id=agent_id)
        
        logs = await orchestrator.get_provisioning_logs(agent_id, limit=limit)
        
        return {
            "agent_id": agent_id,
            "logs": logs,
            "total": len(logs)
        }
        
    except Exception as e:
        logger.error("Failed to get provisioning logs", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get provisioning logs: {str(e)}"
        )
