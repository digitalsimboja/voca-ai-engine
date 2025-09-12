"""
Webhook endpoints for external platforms.

This module handles incoming webhooks from WhatsApp, Instagram, Facebook Messenger, etc.
and routes them through the message routing engine.
"""

from datetime import datetime
from typing import Dict, Any, Optional
import re

from fastapi import APIRouter, HTTPException, Request, Path
from pydantic import BaseModel, Field

from voca_engine_shared_utils.core.config import get_settings
from voca_engine_shared_utils.core.logger import get_logger
from .message_routing import IncomingMessage, route_message

logger = get_logger("voca-ai-engine.webhooks")
router = APIRouter()
settings = get_settings()


class WhatsAppWebhookPayload(BaseModel):
    """WhatsApp webhook payload structure."""
    object: str
    entry: list[Dict[str, Any]]


class InstagramWebhookPayload(BaseModel):
    """Instagram webhook payload structure."""
    object: str
    entry: list[Dict[str, Any]]


class FacebookMessengerWebhookPayload(BaseModel):
    """Facebook Messenger webhook payload structure."""
    object: str
    entry: list[Dict[str, Any]]


@router.post("/whatsapp/{vendor_id}")
async def whatsapp_webhook(
    vendor_id: str = Path(..., description="Vendor identifier"),
    request: Request = None
) -> Dict[str, Any]:
    """
    Handle WhatsApp webhooks.
    
    Expected webhook URL format: /webhooks/whatsapp/{vendor_id}
    """
    try:
        # Get the raw request body
        body = await request.body()
        logger.info("Received WhatsApp webhook", 
                   vendor_id=vendor_id,
                   body_size=len(body))
        
        # Parse the webhook payload
        webhook_data = await request.json()
        
        # Process WhatsApp messages
        responses = []
        for entry in webhook_data.get("entry", []):
            for change in entry.get("changes", []):
                if change.get("field") == "messages":
                    for message in change.get("value", {}).get("messages", []):
                        response = await _process_whatsapp_message(vendor_id, message, change.get("value", {}))
                        if response:
                            responses.append(response)
        
        return {
            "status": "success",
            "message": f"Processed {len(responses)} WhatsApp messages",
            "responses": responses,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.log_error(e, context={"vendor_id": vendor_id, "action": "whatsapp_webhook"})
        raise HTTPException(
            status_code=500,
            detail={
                "error": "webhook_processing_failed",
                "message": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
        )


@router.post("/instagram/{vendor_id}")
async def instagram_webhook(
    vendor_id: str = Path(..., description="Vendor identifier"),
    request: Request = None
) -> Dict[str, Any]:
    """
    Handle Instagram DM webhooks.
    
    Expected webhook URL format: /webhooks/instagram/{vendor_id}
    """
    try:
        body = await request.body()
        logger.info("Received Instagram webhook", 
                   vendor_id=vendor_id,
                   body_size=len(body))
        
        webhook_data = await request.json()
        
        # Process Instagram messages
        responses = []
        for entry in webhook_data.get("entry", []):
            for change in entry.get("changes", []):
                if change.get("field") == "messages":
                    for message in change.get("value", {}).get("messages", []):
                        response = await _process_instagram_message(vendor_id, message, change.get("value", {}))
                        if response:
                            responses.append(response)
        
        return {
            "status": "success",
            "message": f"Processed {len(responses)} Instagram messages",
            "responses": responses,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.log_error(e, context={"vendor_id": vendor_id, "action": "instagram_webhook"})
        raise HTTPException(
            status_code=500,
            detail={
                "error": "webhook_processing_failed",
                "message": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
        )


@router.post("/facebook/{vendor_id}")
async def facebook_webhook(
    vendor_id: str = Path(..., description="Vendor identifier"),
    request: Request = None
) -> Dict[str, Any]:
    """
    Handle Facebook Messenger webhooks.
    
    Expected webhook URL format: /webhooks/facebook/{vendor_id}
    """
    try:
        body = await request.body()
        logger.info("Received Facebook webhook", 
                   vendor_id=vendor_id,
                   body_size=len(body))
        
        webhook_data = await request.json()
        
        # Process Facebook messages
        responses = []
        for entry in webhook_data.get("entry", []):
            for messaging in entry.get("messaging", []):
                if messaging.get("message"):
                    response = await _process_facebook_message(vendor_id, messaging, entry)
                    if response:
                        responses.append(response)
        
        return {
            "status": "success",
            "message": f"Processed {len(responses)} Facebook messages",
            "responses": responses,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.log_error(e, context={"vendor_id": vendor_id, "action": "facebook_webhook"})
        raise HTTPException(
            status_code=500,
            detail={
                "error": "webhook_processing_failed",
                "message": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
        )


@router.get("/whatsapp/{vendor_id}")
async def whatsapp_webhook_verification(
    vendor_id: str = Path(..., description="Vendor identifier"),
    hub_mode: str = None,
    hub_challenge: str = None,
    hub_verify_token: str = None
) -> str:
    """
    Handle WhatsApp webhook verification.
    """
    logger.info("WhatsApp webhook verification", 
               vendor_id=vendor_id,
               hub_mode=hub_mode)
    
    # TODO: Implement proper verification token checking
    if hub_mode == "subscribe" and hub_challenge:
        return hub_challenge
    
    raise HTTPException(status_code=403, detail="Verification failed")


@router.get("/instagram/{vendor_id}")
async def instagram_webhook_verification(
    vendor_id: str = Path(..., description="Vendor identifier"),
    hub_mode: str = None,
    hub_challenge: str = None,
    hub_verify_token: str = None
) -> str:
    """
    Handle Instagram webhook verification.
    """
    logger.info("Instagram webhook verification", 
               vendor_id=vendor_id,
               hub_mode=hub_mode)
    
    # TODO: Implement proper verification token checking
    if hub_mode == "subscribe" and hub_challenge:
        return hub_challenge
    
    raise HTTPException(status_code=403, detail="Verification failed")


@router.get("/facebook/{vendor_id}")
async def facebook_webhook_verification(
    vendor_id: str = Path(..., description="Vendor identifier"),
    hub_mode: str = None,
    hub_challenge: str = None,
    hub_verify_token: str = None
) -> str:
    """
    Handle Facebook webhook verification.
    """
    logger.info("Facebook webhook verification", 
               vendor_id=vendor_id,
               hub_mode=hub_mode)
    
    # TODO: Implement proper verification token checking
    if hub_mode == "subscribe" and hub_challenge:
        return hub_challenge
    
    raise HTTPException(status_code=403, detail="Verification failed")


async def _process_whatsapp_message(vendor_id: str, message: Dict[str, Any], context: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Process a WhatsApp message and route it to the appropriate agent."""
    
    try:
        # Extract message details
        message_id = message.get("id")
        from_number = message.get("from")
        timestamp = message.get("timestamp")
        
        # Extract text content
        text_content = ""
        if message.get("text"):
            text_content = message.get("text", {}).get("body", "")
        elif message.get("type") == "interactive":
            # Handle interactive messages (buttons, lists)
            interactive = message.get("interactive", {})
            if interactive.get("type") == "button_reply":
                text_content = interactive.get("button_reply", {}).get("title", "")
            elif interactive.get("type") == "list_reply":
                text_content = interactive.get("list_reply", {}).get("title", "")
        
        if not text_content:
            logger.warning("No text content in WhatsApp message", message_id=message_id)
            return None
        
        # Create incoming message
        incoming_message = IncomingMessage(
            platform="whatsapp",
            message=text_content,
            user_id=from_number,
            vendor_id=vendor_id,
            metadata={
                "message_id": message_id,
                "timestamp": timestamp,
                "from": from_number,
                "context": context
            }
        )
        
        # Route the message
        response = await route_message(incoming_message)
        
        return {
            "message_id": message_id,
            "user_id": from_number,
            "response": response.response,
            "agent_id": response.agent_id,
            "processing_time_ms": response.processing_time_ms
        }
        
    except Exception as e:
        logger.error("Error processing WhatsApp message", 
                   vendor_id=vendor_id,
                   message_id=message.get("id"),
                   error=str(e))
        return None


async def _process_instagram_message(vendor_id: str, message: Dict[str, Any], context: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Process an Instagram DM message and route it to the appropriate agent."""
    
    try:
        # Extract message details
        message_id = message.get("id")
        from_user = message.get("from", {}).get("id")
        timestamp = message.get("timestamp")
        
        # Extract text content
        text_content = ""
        if message.get("text"):
            text_content = message.get("text")
        
        if not text_content:
            logger.warning("No text content in Instagram message", message_id=message_id)
            return None
        
        # Create incoming message
        incoming_message = IncomingMessage(
            platform="instagram_dm",
            message=text_content,
            user_id=from_user,
            vendor_id=vendor_id,
            metadata={
                "message_id": message_id,
                "timestamp": timestamp,
                "from": from_user,
                "context": context
            }
        )
        
        # Route the message
        response = await route_message(incoming_message)
        
        return {
            "message_id": message_id,
            "user_id": from_user,
            "response": response.response,
            "agent_id": response.agent_id,
            "processing_time_ms": response.processing_time_ms
        }
        
    except Exception as e:
        logger.error("Error processing Instagram message", 
                   vendor_id=vendor_id,
                   message_id=message.get("id"),
                   error=str(e))
        return None


async def _process_facebook_message(vendor_id: str, messaging: Dict[str, Any], entry: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Process a Facebook Messenger message and route it to the appropriate agent."""
    
    try:
        # Extract message details
        sender_id = messaging.get("sender", {}).get("id")
        recipient_id = messaging.get("recipient", {}).get("id")
        timestamp = messaging.get("timestamp")
        message = messaging.get("message", {})
        
        # Extract text content
        text_content = message.get("text", "")
        
        if not text_content:
            logger.warning("No text content in Facebook message", sender_id=sender_id)
            return None
        
        # Create incoming message
        incoming_message = IncomingMessage(
            platform="facebook_messenger",
            message=text_content,
            user_id=sender_id,
            vendor_id=vendor_id,
            metadata={
                "sender_id": sender_id,
                "recipient_id": recipient_id,
                "timestamp": timestamp,
                "message_id": message.get("mid"),
                "entry": entry
            }
        )
        
        # Route the message
        response = await route_message(incoming_message)
        
        return {
            "sender_id": sender_id,
            "user_id": sender_id,
            "response": response.response,
            "agent_id": response.agent_id,
            "processing_time_ms": response.processing_time_ms
        }
        
    except Exception as e:
        logger.error("Error processing Facebook message", 
                   vendor_id=vendor_id,
                   sender_id=messaging.get("sender", {}).get("id"),
                   error=str(e))
        return None
