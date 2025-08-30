"""
Database models for Voca AI Engine.

This module contains Pydantic models for database operations.
"""

from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field


class BaseModelWithTimestamps(BaseModel):
    """Base model with created_at and updated_at timestamps."""
    
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    
    class Config:
        from_attributes = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class AgentModel(BaseModelWithTimestamps):
    """Agent model for database operations."""
    
    id: Optional[str] = None
    vendor_id: str
    name: str
    description: Optional[str] = None
    agent_type: str
    channels: List[str]
    languages: List[str]
    configuration: Dict[str, Any]
    status: str = "active"
    is_active: bool = True
    
    class Config:
        from_attributes = True


class ProvisioningRequestModel(BaseModelWithTimestamps):
    """Agent provisioning request model."""
    
    id: Optional[str] = None
    agent_id: str
    vendor_id: str
    status: str = "pending"
    progress: int = 0
    services_status: Dict[str, Any] = {}
    error_message: Optional[str] = None
    
    class Config:
        from_attributes = True


class ServiceStatusModel(BaseModelWithTimestamps):
    """Service status model."""
    
    id: Optional[str] = None
    service_name: str
    status: str
    url: str
    response_time_ms: Optional[float] = None
    last_check: datetime
    error_message: Optional[str] = None
    
    class Config:
        from_attributes = True


class CommunicationLogModel(BaseModelWithTimestamps):
    """Communication log model."""
    
    id: Optional[str] = None
    agent_id: str
    vendor_id: str
    direction: str  # "inbound" or "outbound"
    channel: str
    message_type: str
    content: Dict[str, Any]
    status: str = "sent"
    error_message: Optional[str] = None
    
    class Config:
        from_attributes = True
