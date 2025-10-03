"""
Backend service client for communicating with vocaai-backend services
"""

import os
import httpx
from typing import Dict, Any, Optional, List
from voca_engine_shared_utils.core.logger import get_logger
from voca_engine_shared_utils.core.config import get_settings

logger = get_logger("voca-service-client")

class VocaServiceClient:
    """Client for communicating with backend services"""
    
    def __init__(self):
        self.settings = get_settings()
        self.user_service_url = self.settings.vocaai_user_url
        self.order_service_url = self.settings.vocaai_order_url
        self.conversation_service_url = self.settings.vocaai_conversation_url
        
        # HTTP client configuration
        self.timeout = 30.0
        self.headers = {
            "Content-Type": "application/json",
            "User-Agent": "VocaAI-Engine/1.0.0"
        }
    
    async def _make_request(
        self, 
        method: str, 
        url: str, 
        data: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Make HTTP request to backend service"""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.request(
                    method=method,
                    url=url,
                    json=data,
                    params=params,
                    headers=self.headers
                )
                
                response.raise_for_status()
                return response.json()
                
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error {e.response.status_code}: {e.response.text}")
            raise
        except httpx.RequestError as e:
            logger.error(f"Request error: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            raise
    # Order Service Methods
    async def get_order_by_id(self, order_id: str) -> Optional[Dict[str, Any]]:
        """Get order by ID"""
        try:
            response = await self._make_request(
                "GET", 
                f"{self.order_service_url}/v1/orders/{order_id}"
            )
            return response.get("order")
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            raise
    
    async def get_order_by_number(self, order_number: str) -> Optional[Dict[str, Any]]:
        """Get order by order number"""
        try:
            response = await self._make_request(
                "GET", 
                f"{self.order_service_url}/v1/orders/number/{order_number}"
            )
            return response.get("order")
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            raise
    
    async def search_orders(self, query: str, store_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Search orders"""
        params = {"search": query}
        if store_id:
            params["store_id"] = store_id
            
        response = await self._make_request(
            "GET", 
            f"{self.order_service_url}/v1/orders",
            params=params
        )
        return response.get("orders", [])
    
    async def update_order_status(
        self, 
        order_id: str, 
        status: str, 
        metadata: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        """Update order status"""
        data = {"status": status}
        if metadata:
            data.update(metadata)
            
        response = await self._make_request(
            "PUT", 
            f"{self.order_service_url}/v1/orders/{order_id}/status",
            data=data
        )
        return response.get("order")
    
    async def create_order(self, order_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Create new order"""
        response = await self._make_request(
            "POST", 
            f"{self.order_service_url}/v1/orders",
            data=order_data
        )
        return response.get("order")
    
    # Conversation Service Methods
    async def create_conversation(self, conversation_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Create new conversation"""
        response = await self._make_request(
            "POST", 
            f"{self.conversation_service_url}/conversations",
            data=conversation_data
        )
        return response.get("conversation")
    
    async def get_conversation_by_id(self, conversation_id: str) -> Optional[Dict[str, Any]]:
        """Get conversation by ID"""
        try:
            response = await self._make_request(
                "GET", 
                f"{self.conversation_service_url}/conversations/{conversation_id}"
            )
            return response.get("conversation")
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            raise
    
    async def add_message_to_conversation(
        self, 
        conversation_id: str, 
        message_data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Add message to conversation"""
        response = await self._make_request(
            "POST", 
            f"{self.conversation_service_url}/conversations/{conversation_id}/messages",
            data=message_data
        )
        return response.get("message")
    
    async def get_conversation_messages(
        self, 
        conversation_id: str, 
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Get conversation messages"""
        response = await self._make_request(
            "GET", 
            f"{self.conversation_service_url}/conversations/{conversation_id}/messages",
            params={"limit": limit}
        )
        return response.get("messages", [])
    

# Global instance
voca_service_client = VocaServiceClient()

