import logging
from typing import Optional, Dict, Any, Callable
from functools import wraps
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

logger = logging.getLogger(__name__)
security = HTTPBearer()

class VendorAuthManager:
    """
    Manages vendor API key authentication by dynamically fetching vendor credentials
    from an external key store (e.g., DB, Redis, Secrets Manager).
    """

    def __init__(self, key_fetcher: Callable[[str], Optional[Dict[str, Any]]]):
        """
        Args:
            key_fetcher: Function that receives vendor_id and returns stored vendor data:
                {
                    "api_key": "...",
                    "name": "...",
                    "permissions": [...],
                    "metadata": {...}
                }
        """
        self.key_fetcher = key_fetcher

    def extract_vendor_id_from_api_key(self, api_key: str) -> Optional[str]:
        """
        Extract vendor ID from API key format.
        Expected format: 'vendor123:ABCDEF' → vendor123

        You can modify this logic if your keys are structured differently.
        """
        if ":" in api_key:
            return api_key.split(":", 1)[0]
        return None

    def validate_api_key(self, api_key: str) -> Optional[Dict[str, Any]]:
        """
        Validate API key by fetching stored vendor data and comparing keys.
        """
        vendor_id = self.extract_vendor_id_from_api_key(api_key)
        if not vendor_id:
            logger.warning("API key format invalid or vendor ID missing")
            return None

        vendor_data = self.key_fetcher(vendor_id)
        if not vendor_data:
            logger.warning(f"No vendor data found for vendor ID: {vendor_id}")
            return None

        # Strict key comparison
        if vendor_data.get("api_key") == api_key:
            logger.info(f"Authenticated vendor: {vendor_id}")
            return {
                "vendor_id": vendor_id,
                "name": vendor_data.get("name", vendor_id),
                "permissions": vendor_data.get("permissions", []),
                "metadata": vendor_data.get("metadata", {}),
            }

        logger.warning(f"Invalid API key attempted for vendor {vendor_id}")
        return None

    def get_vendor_permissions(self, api_key: str) -> list[str]:
        """Return list of vendor permissions or empty list."""
        vendor_data = self.validate_api_key(api_key)
        return vendor_data.get("permissions", []) if vendor_data else []

    def has_vendor_permission(self, api_key: str, permission: str) -> bool:
        """Check if vendor has specified permission."""
        return permission in self.get_vendor_permissions(api_key)

    def verify_vendor_api_key(
        self, 
        credentials: HTTPAuthorizationCredentials = Depends(security)
    ) -> Dict[str, Any]:
        """
        FastAPI dependency to verify vendor API key and return vendor information
        
        Args:
            credentials: HTTP Bearer token credentials
            
        Returns:
            Dict containing vendor_id, name, permissions, and metadata
            
        Raises:
            HTTPException: If API key is invalid
        """
        api_key = credentials.credentials
        
        vendor_data = self.validate_api_key(api_key)
        if not vendor_data:
            logger.warning(f"Invalid API key attempted: {api_key[:10]}...")
            raise HTTPException(
                status_code=401,
                detail="Invalid vendor API key",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        return {
            "vendor_id": vendor_data["vendor_id"],
            "vendor_name": vendor_data["name"],
            "permissions": vendor_data["permissions"],
            "metadata": vendor_data["metadata"],
            "api_key": api_key
        }

    def vendor_auth_required(self, func: Callable) -> Callable:
        """
        Decorator to require vendor API key authentication for route functions
        
        Usage:
            @auth_manager.vendor_auth_required
            async def my_route(vendor_auth: Dict[str, Any] = Depends(auth_manager.verify_vendor_api_key)):
                vendor_id = vendor_auth["vendor_id"]
                # Your route logic here
        """
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # The actual authentication is handled by FastAPI dependency injection
            # This decorator is mainly for documentation and consistency
            return await func(*args, **kwargs)
        
        return wrapper
