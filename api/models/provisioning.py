"""
Provisioning Models
"""

from typing import Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field


class ProvisioningStatus(str, BaseModel):
    """Provisioning status model"""
    agent_id: str
    status: str
    progress: int = Field(..., ge=0, le=100)
    current_step: str
    total_steps: int
    details: Optional[Dict[str, Any]] = None
    started_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None


class ProvisioningLog(BaseModel):
    """Provisioning log model"""
    id: str
    agent_id: str
    channel_id: Optional[str] = None
    step: str
    status: str
    details: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True
