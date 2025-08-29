"""
Agent Orchestrator - Main orchestration logic for agent management
"""

import uuid
from typing import List, Dict, Any, Optional
from datetime import datetime
import structlog

from core.provisioner.aws_connect import AWSConnectProvisioner
from core.provisioner.elizaos_manager import ElizaOSManager
from core.context_manager import ContextManager

logger = structlog.get_logger()


class AgentOrchestrator:
    """Main agent orchestration class"""
    
    def __init__(self):
        self.aws_provisioner = AWSConnectProvisioner()
        self.elizaos_manager = ElizaOSManager()
        self.context_manager = ContextManager()
        
    async def create_multi_channel_agent(self, agent_config: Dict[str, Any]) -> Dict[str, Any]:
        """Create agent across multiple channels"""
        try:
            agent_id = str(uuid.uuid4())
            logger.info("Creating multi-channel agent", agent_id=agent_id, config=agent_config)
            
            # Create base agent record
            agent = {
                "id": agent_id,
                "name": agent_config["name"],
                "description": agent_config.get("description"),
                "business_type": agent_config["business_type"],
                "status": "draft",
                "channels": [],
                "character_config": agent_config.get("character_config"),
                "context": agent_config.get("context"),
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            
            # Process each channel
            for channel_type in agent_config["channels"]:
                channel_info = await self._setup_channel(agent_id, channel_type, agent_config)
                agent["channels"].append(channel_info)
            
            # Update agent status
            agent["status"] = "provisioning"
            
            logger.info("Multi-channel agent created successfully", agent_id=agent_id)
            return agent
            
        except Exception as e:
            logger.error("Failed to create multi-channel agent", error=str(e))
            raise
    
    async def _setup_channel(self, agent_id: str, channel_type: str, agent_config: Dict[str, Any]) -> Dict[str, Any]:
        """Setup individual channel for agent"""
        try:
            channel_id = str(uuid.uuid4())
            logger.info("Setting up channel", agent_id=agent_id, channel_type=channel_type)
            
            channel_info = {
                "id": channel_id,
                "agent_id": agent_id,
                "channel_type": channel_type,
                "status": "provisioning",
                "config": {},
                "created_at": datetime.utcnow()
            }
            
            # Setup based on channel type
            if channel_type in ["voice", "sms"]:
                # Setup AWS Connect
                connect_info = await self.aws_provisioner.provision_instance({
                    "agent_id": agent_id,
                    "channel_type": channel_type,
                    "business_type": agent_config["business_type"]
                })
                channel_info["aws_connect_instance_id"] = connect_info["instance_id"]
                channel_info["config"] = connect_info
                
            else:
                # All other channels (whatsapp, instagram, twitter, facebook) handled by ElizaOS
                elizaos_info = await self.elizaos_manager.create_agent({
                    "agent_id": agent_id,
                    "channel_type": channel_type,
                    "business_type": agent_config["business_type"],
                    "character_config": agent_config.get("character_config")
                })
                channel_info["elizaos_agent_id"] = elizaos_info["agent_id"]
                channel_info["config"] = elizaos_info
            
            channel_info["status"] = "active"
            logger.info("Channel setup completed", channel_id=channel_id, channel_type=channel_type)
            
            return channel_info
            
        except Exception as e:
            logger.error("Failed to setup channel", error=str(e), channel_type=channel_type)
            raise
    
    async def route_message(self, channel: str, message: Dict[str, Any]) -> Dict[str, Any]:
        """Route incoming message to appropriate agent"""
        try:
            logger.info("Routing message", channel=channel, message_id=message.get("id"))
            
            # Extract agent information from message
            agent_id = self._extract_agent_id(message, channel)
            
            # Get agent context
            context = await self.context_manager.get_agent_context(agent_id)
            
            # Route to appropriate handler
            if channel in ["voice", "sms"]:
                response = await self.aws_provisioner.handle_message(agent_id, message)
            else:
                # All social media channels handled by ElizaOS
                response = await self.elizaos_manager.handle_message(agent_id, channel, message)
            
            # Update context
            await self.context_manager.update_context(agent_id, {
                "last_message": message,
                "last_response": response,
                "timestamp": datetime.utcnow().isoformat()
            })
            
            logger.info("Message routed successfully", channel=channel, agent_id=agent_id)
            return response
            
        except Exception as e:
            logger.error("Failed to route message", error=str(e), channel=channel)
            raise
    
    def _extract_agent_id(self, message: Dict[str, Any], channel: str) -> str:
        """Extract agent ID from message based on channel"""
        # This is a simplified implementation
        # In production, you'd have more sophisticated routing logic
        if channel in ["voice", "sms"]:
            return message.get("agent_id") or message.get("instance_id")
        else:
            return message.get("agent_id") or message.get("recipient_id")
    
    async def list_agents(self, skip: int = 0, limit: int = 100, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """List agents with optional filtering"""
        try:
            logger.info("Listing agents", skip=skip, limit=limit, status=status)
            
            # This would typically query the database
            # For now, return mock data
            agents = [
                {
                    "id": "mock-agent-1",
                    "name": "Customer Support Agent",
                    "status": "active",
                    "business_type": "microfinance",
                    "channels": ["whatsapp", "voice"],
                    "created_at": datetime.utcnow()
                }
            ]
            
            return agents
            
        except Exception as e:
            logger.error("Failed to list agents", error=str(e))
            raise
    
    async def get_agent(self, agent_id: str) -> Optional[Dict[str, Any]]:
        """Get agent by ID"""
        try:
            logger.info("Getting agent", agent_id=agent_id)
            
            # This would typically query the database
            # For now, return mock data
            if agent_id == "mock-agent-1":
                return {
                    "id": agent_id,
                    "name": "Customer Support Agent",
                    "status": "active",
                    "business_type": "microfinance",
                    "channels": ["whatsapp", "voice"],
                    "created_at": datetime.utcnow()
                }
            
            return None
            
        except Exception as e:
            logger.error("Failed to get agent", error=str(e))
            raise
    
    async def update_agent(self, agent_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update agent"""
        try:
            logger.info("Updating agent", agent_id=agent_id, updates=updates)
            
            # This would typically update the database
            # For now, return mock data
            agent = await self.get_agent(agent_id)
            if agent:
                agent.update(updates)
                agent["updated_at"] = datetime.utcnow()
                return agent
            
            return None
            
        except Exception as e:
            logger.error("Failed to update agent", error=str(e))
            raise
    
    async def delete_agent(self, agent_id: str) -> bool:
        """Delete agent"""
        try:
            logger.info("Deleting agent", agent_id=agent_id)
            
            # This would typically delete from database and cleanup resources
            # For now, return success
            return True
            
        except Exception as e:
            logger.error("Failed to delete agent", error=str(e))
            raise
    
    async def start_agent(self, agent_id: str) -> Optional[Dict[str, Any]]:
        """Start agent"""
        try:
            logger.info("Starting agent", agent_id=agent_id)
            
            agent = await self.get_agent(agent_id)
            if agent:
                agent["status"] = "active"
                agent["updated_at"] = datetime.utcnow()
                return agent
            
            return None
            
        except Exception as e:
            logger.error("Failed to start agent", error=str(e))
            raise
    
    async def stop_agent(self, agent_id: str) -> Optional[Dict[str, Any]]:
        """Stop agent"""
        try:
            logger.info("Stopping agent", agent_id=agent_id)
            
            agent = await self.get_agent(agent_id)
            if agent:
                agent["status"] = "stopped"
                agent["updated_at"] = datetime.utcnow()
                return agent
            
            return None
            
        except Exception as e:
            logger.error("Failed to stop agent", error=str(e))
            raise
    
    async def pause_agent(self, agent_id: str) -> Optional[Dict[str, Any]]:
        """Pause agent"""
        try:
            logger.info("Pausing agent", agent_id=agent_id)
            
            agent = await self.get_agent(agent_id)
            if agent:
                agent["status"] = "paused"
                agent["updated_at"] = datetime.utcnow()
                return agent
            
            return None
            
        except Exception as e:
            logger.error("Failed to pause agent", error=str(e))
            raise
    
    async def resume_agent(self, agent_id: str) -> Optional[Dict[str, Any]]:
        """Resume agent"""
        try:
            logger.info("Resuming agent", agent_id=agent_id)
            
            agent = await self.get_agent(agent_id)
            if agent:
                agent["status"] = "active"
                agent["updated_at"] = datetime.utcnow()
                return agent
            
            return None
            
        except Exception as e:
            logger.error("Failed to resume agent", error=str(e))
            raise
    
    async def get_agent_status(self, agent_id: str) -> Optional[Dict[str, Any]]:
        """Get agent status"""
        try:
            logger.info("Getting agent status", agent_id=agent_id)
            
            agent = await self.get_agent(agent_id)
            if agent:
                return {
                    "agent_id": agent_id,
                    "status": agent["status"],
                    "channels": agent.get("channels", []),
                    "last_updated": agent.get("updated_at")
                }
            
            return None
            
        except Exception as e:
            logger.error("Failed to get agent status", error=str(e))
            raise
    
    async def start_provisioning(self, agent_id: str) -> Dict[str, Any]:
        """Start agent provisioning"""
        try:
            logger.info("Starting agent provisioning", agent_id=agent_id)
            
            provisioning_id = str(uuid.uuid4())
            
            return {
                "provisioning_id": provisioning_id,
                "agent_id": agent_id,
                "status": "started"
            }
            
        except Exception as e:
            logger.error("Failed to start provisioning", error=str(e))
            raise
    
    async def get_provisioning_status(self, agent_id: str) -> Dict[str, Any]:
        """Get provisioning status"""
        try:
            logger.info("Getting provisioning status", agent_id=agent_id)
            
            return {
                "agent_id": agent_id,
                "status": "completed",
                "progress": 100,
                "current_step": "finished",
                "total_steps": 5
            }
            
        except Exception as e:
            logger.error("Failed to get provisioning status", error=str(e))
            raise
    
    async def deprovision_agent(self, agent_id: str) -> Dict[str, Any]:
        """Deprovision agent"""
        try:
            logger.info("Deprovisioning agent", agent_id=agent_id)
            
            return {
                "agent_id": agent_id,
                "status": "deprovisioned"
            }
            
        except Exception as e:
            logger.error("Failed to deprovision agent", error=str(e))
            raise
    
    async def get_provisioning_logs(self, agent_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        """Get provisioning logs"""
        try:
            logger.info("Getting provisioning logs", agent_id=agent_id, limit=limit)
            
            return [
                {
                    "id": "log-1",
                    "agent_id": agent_id,
                    "step": "agent_creation",
                    "status": "completed",
                    "created_at": datetime.utcnow()
                }
            ]
            
        except Exception as e:
            logger.error("Failed to get provisioning logs", error=str(e))
            raise
