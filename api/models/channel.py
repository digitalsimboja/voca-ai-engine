"""
Channel Models
"""

from typing import Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field
from .agent import ChannelType


class ChannelCreate(BaseModel):
    """Channel creation model"""
    channel_type: ChannelType
    config: Optional[Dict[str, Any]] = None


class ChannelUpdate(BaseModel):
    """Channel update model"""
    config: Optional[Dict[str, Any]] = None
    status: Optional[str] = None


class ChannelResponse(BaseModel):
    """Channel response model"""
    id: str
    agent_id: str
    channel_type: ChannelType
    status: str
    config: Optional[Dict[str, Any]] = None
    aws_connect_instance_id: Optional[str] = None
    elizaos_agent_id: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
