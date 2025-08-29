"""
Agent Models
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field
from enum import Enum


class AgentStatus(str, Enum):
    """Agent status enumeration"""
    DRAFT = "draft"
    PROVISIONING = "provisioning"
    ACTIVE = "active"
    PAUSED = "paused"
    STOPPED = "stopped"
    ERROR = "error"


class ChannelType(str, Enum):
    """Channel type enumeration"""
    VOICE = "voice"
    SMS = "sms"
    WHATSAPP = "whatsapp"
    INSTAGRAM = "instagram"
    TWITTER = "twitter"
    FACEBOOK = "facebook"


class AgentCreate(BaseModel):
    """Agent creation model"""
    name: str = Field(..., min_length=1, max_length=255, description="Agent name")
    description: Optional[str] = Field(None, max_length=1000, description="Agent description")
    business_type: str = Field(..., description="Type of business (e.g., microfinance, retail)")
    channels: List[ChannelType] = Field(..., description="List of channels to enable")
    character_config: Optional[Dict[str, Any]] = Field(None, description="Character configuration")
    context: Optional[Dict[str, Any]] = Field(None, description="Agent context and knowledge base")


class AgentUpdate(BaseModel):
    """Agent update model"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    business_type: Optional[str] = None
    channels: Optional[List[ChannelType]] = None
    character_config: Optional[Dict[str, Any]] = None
    context: Optional[Dict[str, Any]] = None
    status: Optional[AgentStatus] = None


class ChannelInfo(BaseModel):
    """Channel information model"""
    channel_type: ChannelType
    status: str
    config: Optional[Dict[str, Any]] = None
    aws_connect_instance_id: Optional[str] = None
    elizaos_agent_id: Optional[str] = None
    created_at: datetime


class AgentResponse(BaseModel):
    """Agent response model"""
    id: str
    name: str
    description: Optional[str] = None
    business_type: str
    status: AgentStatus
    channels: List[ChannelInfo]
    character_config: Optional[Dict[str, Any]] = None
    context: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AgentList(BaseModel):
    """Agent list response model"""
    agents: List[AgentResponse]
    total: int
    skip: int
    limit: int
