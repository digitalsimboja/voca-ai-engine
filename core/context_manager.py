"""
Context Manager - Handles agent context and conversation history
"""

import boto3
from typing import Dict, Any, Optional, List
from datetime import datetime
import structlog

logger = structlog.get_logger()


class ContextManager:
    """Manages agent context and conversation history"""
    
    def __init__(self):
        self.dynamodb_client = boto3.client('dynamodb')
        self.table_name = "voca-ai-agent-contexts"
        
    async def get_agent_context(self, agent_id: str) -> Dict[str, Any]:
        """Get agent's current context and conversation history"""
        try:
            logger.info("Getting agent context", agent_id=agent_id)
            
            # This is a simplified implementation
            # In production, you'd query DynamoDB for the agent's context
            context = {
                "agent_id": agent_id,
                "context_data": {
                    "business_type": "microfinance",
                    "services": ["loan_inquiry", "payment_support"],
                    "current_conversation": None
                },
                "conversation_history": [],
                "last_updated": datetime.utcnow().isoformat()
            }
            
            return context
            
        except Exception as e:
            logger.error("Failed to get agent context", error=str(e))
            raise
    
    async def update_context(self, agent_id: str, context_update: Dict[str, Any]):
        """Update agent's context with new information"""
        try:
            logger.info("Updating agent context", agent_id=agent_id, update=context_update)
            
            # This is a simplified implementation
            # In production, you'd update DynamoDB with the new context
            # self.dynamodb_client.update_item(
            #     TableName=self.table_name,
            #     Key={"agent_id": {"S": agent_id}},
            #     UpdateExpression="SET context_data = :context, last_updated = :timestamp",
            #     ExpressionAttributeValues={
            #         ":context": {"S": json.dumps(context_update)},
            #         ":timestamp": {"S": datetime.utcnow().isoformat()}
            #     }
            # )
            
            logger.info("Agent context updated", agent_id=agent_id)
            
        except Exception as e:
            logger.error("Failed to update agent context", error=str(e))
            raise
    
    async def share_context_across_channels(self, agent_id: str):
        """Share context across all channels for the agent"""
        try:
            logger.info("Sharing context across channels", agent_id=agent_id)
            
            # Get current context
            context = await self.get_agent_context(agent_id)
            
            # Share context with all channels
            # This is a simplified implementation
            # In production, you'd update all channel-specific context stores
            
            logger.info("Context shared across channels", agent_id=agent_id)
            
        except Exception as e:
            logger.error("Failed to share context across channels", error=str(e))
            raise
    
    async def store_conversation_history(self, agent_id: str, channel: str, conversation: Dict[str, Any]):
        """Store conversation history for the agent"""
        try:
            logger.info("Storing conversation history", agent_id=agent_id, channel=channel)
            
            # This is a simplified implementation
            # In production, you'd store in DynamoDB or another database
            conversation_record = {
                "id": f"{agent_id}-{datetime.utcnow().timestamp()}",
                "agent_id": agent_id,
                "channel": channel,
                "conversation": conversation,
                "timestamp": datetime.utcnow().isoformat()
            }
            
            logger.info("Conversation history stored", agent_id=agent_id, channel=channel)
            
        except Exception as e:
            logger.error("Failed to store conversation history", error=str(e))
            raise
    
    async def get_conversation_history(self, agent_id: str, channel: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Get conversation history for the agent"""
        try:
            logger.info("Getting conversation history", agent_id=agent_id, channel=channel, limit=limit)
            
            # This is a simplified implementation
            # In production, you'd query the database for conversation history
            history = [
                {
                    "id": "conv-1",
                    "agent_id": agent_id,
                    "channel": channel,
                    "conversation": {
                        "user_message": "Hello, I need help with my loan",
                        "agent_response": "Hello! I'd be happy to help you with your loan. What specific assistance do you need?",
                        "timestamp": "2024-01-01T00:00:00Z"
                    },
                    "timestamp": "2024-01-01T00:00:00Z"
                }
            ]
            
            return history[:limit]
            
        except Exception as e:
            logger.error("Failed to get conversation history", error=str(e))
            raise
    
    async def clear_context(self, agent_id: str):
        """Clear agent's context"""
        try:
            logger.info("Clearing agent context", agent_id=agent_id)
            
            # This is a simplified implementation
            # In production, you'd clear the context from the database
            
            logger.info("Agent context cleared", agent_id=agent_id)
            
        except Exception as e:
            logger.error("Failed to clear agent context", error=str(e))
            raise
    
    async def get_context_summary(self, agent_id: str) -> Dict[str, Any]:
        """Get a summary of the agent's context"""
        try:
            logger.info("Getting context summary", agent_id=agent_id)
            
            context = await self.get_agent_context(agent_id)
            history = await self.get_conversation_history(agent_id, "all", limit=10)
            
            summary = {
                "agent_id": agent_id,
                "context_data": context.get("context_data", {}),
                "recent_conversations": len(history),
                "last_updated": context.get("last_updated"),
                "total_conversations": len(history)  # This would be a count in production
            }
            
            return summary
            
        except Exception as e:
            logger.error("Failed to get context summary", error=str(e))
            raise
