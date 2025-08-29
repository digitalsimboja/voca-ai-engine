"""
Agent Management Routes
"""

from fastapi import APIRouter, HTTPException, Depends, status
from typing import List, Optional
import structlog

from api.models.agent import AgentCreate, AgentUpdate, AgentResponse, AgentList
from core.orchestrator.agent_orchestrator import AgentOrchestrator
from api.middleware.auth import get_current_user

logger = structlog.get_logger()
router = APIRouter()

# Initialize orchestrator
orchestrator = AgentOrchestrator()


@router.post("/", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def create_agent(
    agent_data: AgentCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new agent"""
    try:
        logger.info("Creating new agent", user_id=current_user["id"], agent_name=agent_data.name)
        
        agent = await orchestrator.create_multi_channel_agent(agent_data.dict())
        
        logger.info("Agent created successfully", agent_id=agent["id"])
        return AgentResponse(**agent)
        
    except Exception as e:
        logger.error("Failed to create agent", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create agent: {str(e)}"
        )


@router.get("/", response_model=AgentList)
async def list_agents(
    skip: int = 0,
    limit: int = 100,
    status_filter: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """List all agents"""
    try:
        logger.info("Listing agents", user_id=current_user["id"], skip=skip, limit=limit)
        
        agents = await orchestrator.list_agents(skip=skip, limit=limit, status=status_filter)
        
        return AgentList(
            agents=[AgentResponse(**agent) for agent in agents],
            total=len(agents),
            skip=skip,
            limit=limit
        )
        
    except Exception as e:
        logger.error("Failed to list agents", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list agents: {str(e)}"
        )


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get agent details"""
    try:
        logger.info("Getting agent details", user_id=current_user["id"], agent_id=agent_id)
        
        agent = await orchestrator.get_agent(agent_id)
        if not agent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Agent not found"
            )
        
        return AgentResponse(**agent)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get agent", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get agent: {str(e)}"
        )


@router.put("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: str,
    agent_data: AgentUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update agent"""
    try:
        logger.info("Updating agent", user_id=current_user["id"], agent_id=agent_id)
        
        agent = await orchestrator.update_agent(agent_id, agent_data.dict(exclude_unset=True))
        if not agent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Agent not found"
            )
        
        logger.info("Agent updated successfully", agent_id=agent_id)
        return AgentResponse(**agent)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update agent", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update agent: {str(e)}"
        )


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(
    agent_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete agent"""
    try:
        logger.info("Deleting agent", user_id=current_user["id"], agent_id=agent_id)
        
        success = await orchestrator.delete_agent(agent_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Agent not found"
            )
        
        logger.info("Agent deleted successfully", agent_id=agent_id)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete agent", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete agent: {str(e)}"
        )


@router.post("/{agent_id}/start", response_model=AgentResponse)
async def start_agent(
    agent_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Start agent"""
    try:
        logger.info("Starting agent", user_id=current_user["id"], agent_id=agent_id)
        
        agent = await orchestrator.start_agent(agent_id)
        if not agent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Agent not found"
            )
        
        logger.info("Agent started successfully", agent_id=agent_id)
        return AgentResponse(**agent)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to start agent", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start agent: {str(e)}"
        )


@router.post("/{agent_id}/stop", response_model=AgentResponse)
async def stop_agent(
    agent_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Stop agent"""
    try:
        logger.info("Stopping agent", user_id=current_user["id"], agent_id=agent_id)
        
        agent = await orchestrator.stop_agent(agent_id)
        if not agent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Agent not found"
            )
        
        logger.info("Agent stopped successfully", agent_id=agent_id)
        return AgentResponse(**agent)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to stop agent", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to stop agent: {str(e)}"
        )


@router.post("/{agent_id}/pause", response_model=AgentResponse)
async def pause_agent(
    agent_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Pause agent"""
    try:
        logger.info("Pausing agent", user_id=current_user["id"], agent_id=agent_id)
        
        agent = await orchestrator.pause_agent(agent_id)
        if not agent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Agent not found"
            )
        
        logger.info("Agent paused successfully", agent_id=agent_id)
        return AgentResponse(**agent)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to pause agent", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to pause agent: {str(e)}"
        )


@router.post("/{agent_id}/resume", response_model=AgentResponse)
async def resume_agent(
    agent_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Resume agent"""
    try:
        logger.info("Resuming agent", user_id=current_user["id"], agent_id=agent_id)
        
        agent = await orchestrator.resume_agent(agent_id)
        if not agent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Agent not found"
            )
        
        logger.info("Agent resumed successfully", agent_id=agent_id)
        return AgentResponse(**agent)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to resume agent", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to resume agent: {str(e)}"
        )


@router.get("/{agent_id}/status")
async def get_agent_status(
    agent_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get agent status"""
    try:
        logger.info("Getting agent status", user_id=current_user["id"], agent_id=agent_id)
        
        status = await orchestrator.get_agent_status(agent_id)
        if not status:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Agent not found"
            )
        
        return status
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get agent status", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get agent status: {str(e)}"
        )
