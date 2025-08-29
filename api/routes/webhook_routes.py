"""
Webhook Routes - AWS Connect Only
"""

from fastapi import APIRouter, HTTPException, Request, status
import structlog

from core.orchestrator.agent_orchestrator import AgentOrchestrator

logger = structlog.get_logger()
router = APIRouter()

# Initialize orchestrator
orchestrator = AgentOrchestrator()


@router.post("/connect")
async def connect_webhook(request: Request):
    """AWS Connect webhook handler"""
    try:
        body = await request.json()
        logger.info("Received Connect webhook", data=body)
        
        # Process Connect message
        response = await orchestrator.route_message("connect", body)
        
        return response
        
    except Exception as e:
        logger.error("Connect webhook error", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Webhook processing failed"
        )


@router.post("/elizaos")
async def elizaos_webhook(request: Request):
    """ElizaOS webhook handler for social media platforms"""
    try:
        body = await request.json()
        logger.info("Received ElizaOS webhook", data=body)
        
        # Extract platform from webhook data
        platform = body.get("platform", "unknown")
        
        # Process message through ElizaOS
        response = await orchestrator.route_message(platform, body)
        
        return response
        
    except Exception as e:
        logger.error("ElizaOS webhook error", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Webhook processing failed"
        )
