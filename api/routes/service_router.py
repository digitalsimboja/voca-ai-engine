"""
Service Router for VocaAI Engine
Handles service requests from VocaOS with vendor-based authentication
Routes requests to appropriate backend services
"""

from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel, Field
from datetime import datetime

from voca_engine_shared_utils.clients.voca_service_client import voca_service_client as backend_client
from voca_engine_shared_utils.core.logger import get_logger

logger = get_logger("service-router")

# Create router
router = APIRouter()


# ---------------------------
# Request/Response Models
# ---------------------------
class ServiceRequest(BaseModel):
    """Unified service request model"""
    service: str = Field(..., description="Service name (e.g., order, conversation)")
    action: str = Field(..., description="Action to perform")
    data: Dict[str, Any] = Field(default_factory=dict, description="Request data")


class ServiceResponse(BaseModel):
    """Unified service response model"""
    success: bool
    data: Optional[Dict[str, Any]] = None
    message: Optional[str] = None
    error: Optional[str] = None

# ---------------------------
# Service Handlers
# ---------------------------
class ServiceHandler:
    """Routes service actions to backend client"""

    # ---------- ORDER SERVICE ----------
    @staticmethod
    async def handle_order_service(action: str, data: Dict[str, Any]) -> Dict[str, Any]:
        if action == "get_order_by_id":
            order_id = data.get("order_id")
            if not order_id:
                raise ValueError("order_id is required")
            result = await backend_client.get_order_by_id(order_id)
            return {"order": result}

        if action == "get_order_by_number":
            order_number = data.get("order_number")
            if not order_number:
                raise ValueError("order_number is required")
            result = await backend_client.get_order_by_number(order_number)
            return {"order": result}

        if action == "search_orders":
            query = data.get("query", "")
            store_id = data.get("store_id")
            result = await backend_client.search_orders(query, store_id)
            return {"orders": result}

        if action == "update_order_status":
            order_id = data.get("order_id")
            status = data.get("status")
            metadata = data.get("metadata", {})
            if not order_id or not status:
                raise ValueError("order_id and status are required")
            result = await backend_client.update_order_status(order_id, status, metadata)
            return {"order": result}

        if action == "create_order":
            result = await backend_client.create_order(data)
            return {"order": result}

        raise ValueError(f"Unknown order action: {action}")

    # ---------- CONVERSATION SERVICE ----------
    @staticmethod
    async def handle_conversation_service(action: str, data: Dict[str, Any]) -> Dict[str, Any]:
        if action == "create_conversation":
            result = await backend_client.create_conversation(data)
            return {"conversation": result}

        if action == "get_conversation_by_id":
            conversation_id = data.get("conversation_id")
            if not conversation_id:
                raise ValueError("conversation_id is required")
            result = await backend_client.get_conversation_by_id(conversation_id)
            return {"conversation": result}

        if action == "add_message":
            conversation_id = data.get("conversation_id")
            if not conversation_id:
                raise ValueError("conversation_id is required")

            message_data = {
                "content": data.get("content"),
                "role": data.get("role", "user"),
                "type": data.get("type", "text"),
                "metadata": data.get("metadata", {})
            }
            result = await backend_client.add_message_to_conversation(conversation_id, message_data)
            return {"message": result}

        if action == "get_messages":
            conversation_id = data.get("conversation_id")
            if not conversation_id:
                raise ValueError("conversation_id is required")

            limit = data.get("limit", 50)
            result = await backend_client.get_conversation_messages(conversation_id, limit)
            return {"messages": result}

        raise ValueError(f"Unknown conversation action: {action}")


# ---------------------------
# Main Router Endpoint
# ---------------------------
@router.post("/call", response_model=ServiceResponse)
async def route_service_request(
    request: ServiceRequest,
    vendor_auth: str = Header(..., alias="vendor_auth")
) -> ServiceResponse:
    """
    Unified service endpoint for VocaOS to communicate with backend services.
    Validates vendor, routes to correct handler, and returns a unified response.
    """
    try:
        # Add vendor_id to request data
        request.data["vendor_auth"] = vendor_auth

        logger.info(f"Service request from vendor {vendor_auth['vendor_id']}: "
                    f"{request.service}.{request.action}")

        # Route request
        if request.service == "order":
            result = await ServiceHandler.handle_order_service(request.action, request.data)
        elif request.service == "conversation":
            result = await ServiceHandler.handle_conversation_service(request.action, request.data)
        else:
            raise ValueError(f"Unknown service: {request.service}")

        return ServiceResponse(
            success=True,
            data=result,
            message=f"Successfully executed {request.service}.{request.action}"
        )

    except ValueError as e:
        logger.warning(f"Validation error: {e}")
        return ServiceResponse(success=False, error=str(e), message="Invalid request parameters")

    except Exception as e:
        logger.error(f"Service request error: {e}")
        return ServiceResponse(success=False, error=str(e), message="Internal server error")
