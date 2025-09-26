"""
Agent provisioning utility functions.

This module contains reusable functions for agent provisioning,
configuration building, and platform-specific setup.
"""

from typing import Dict, Any, List, Optional
import httpx
import logging

logger = logging.getLogger(__name__)


def build_agent_configuration(request_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build comprehensive agent configuration from request data.
    
    Args:
        request_data: The complete request data containing agent information
        
    Returns:
        Dict containing the complete agent configuration
    """
    configuration = request_data.get('configuration', {})
    
    agent_config = {
        "profile": {
            "name": request_data.get('name', 'AI Assistant'),
            "description": request_data.get('description', 'AI assistant for customer service'),
            "role": configuration.get('profile', {}).get('role', 'sales_assistant'),
            "avatar": configuration.get('profile', {}).get('avatar', ''),
            "bio": configuration.get('profile', {}).get('bio', request_data.get('description', ''))
        },
        "customerService": {
            "responseTime": configuration.get('customerService', {}).get('responseTime', 5),
            "autoResponses": configuration.get('customerService', {}).get('autoResponses', True),
            "hours": "24/7",
            "languages": configuration.get('customerService', {}).get('languages', request_data.get('languages', ['English'])),
            "channels": configuration.get('customerService', {}).get('channels', {})
        },
        "aiCapabilities": configuration.get('aiCapabilities', {
            "customerInquiries": True,
            "orderTracking": True,
            "productRecommendations": True,
            "deliveryUpdates": True,
            "socialMediaEngagement": True,
            "inventoryAlerts": False
        }),
        "socialMedia": {
            "platforms": configuration.get('socialMedia', {}).get('platforms', {}),
            "contentTypes": configuration.get('socialMedia', {}).get('contentTypes', [])
        },
        "orderManagement": configuration.get('orderManagement', {
            "trackingEnabled": True,
            "autoUpdates": True,
            "deliveryPartners": [],
            "orderStatuses": [],
            "inventorySync": False
        }),
        "integrations": configuration.get('integrations', {
            "payment": {"enabled": False, "gateways": []},
            "delivery": {"enabled": False, "services": []},
            "analytics": {"enabled": False, "platforms": []},
            "inventory": {"enabled": False, "systems": []}
        })
    }
    
    logger.info("Built agent configuration", 
               agent_name=request_data.get('name'),
               has_profile=bool(configuration.get('profile')),
               has_social_media=bool(configuration.get('socialMedia')),
               has_integrations=bool(configuration.get('integrations')))
    
    return agent_config


def build_platform_configuration(
    channel: str, 
    platform_config: Dict[str, Any], 
    vendor_identifier: str, 
    voca_os_url: str
) -> Dict[str, Any]:
    """
    Build platform-specific configuration for a social media channel.
    
    Args:
        channel: The social media channel (instagram, facebook, etc.)
        platform_config: Platform-specific configuration from request
        vendor_identifier: The vendor identifier for webhook URLs
        voca_os_url: Base URL for VocaOS service
        
    Returns:
        Dict containing the platform configuration
    """
    # Create base platform configuration with webhook URL
    channel_config = {
        "enabled": platform_config.get('enabled', True),
        "webhook_url": f"{voca_os_url}/webhooks/{channel}/{vendor_identifier}"
    }
    
    # Add platform-specific fields
    if channel == 'instagram' and 'handle' in platform_config:
        channel_config['handle'] = platform_config['handle']
    elif channel == 'facebook':
        if 'page' in platform_config:
            channel_config['page'] = platform_config['page']
        if 'messenger' in platform_config:
            channel_config['messenger'] = platform_config['messenger']
    elif channel in ['tiktok', 'twitter'] and 'username' in platform_config:
        channel_config['username'] = platform_config['username']
    
    logger.debug("Built platform configuration", 
                channel=channel,
                enabled=channel_config.get('enabled'),
                has_handle=bool(channel_config.get('handle')),
                has_username=bool(channel_config.get('username')))
    
    return channel_config


def configure_social_media_platforms(
    channels: List[str],
    configuration: Dict[str, Any],
    vendor_identifier: str,
    voca_os_url: str,
    agent_config: Dict[str, Any]
) -> None:
    """
    Configure social media platforms in the agent configuration.
    
    Args:
        channels: List of requested channels
        configuration: Complete configuration from request
        vendor_identifier: The vendor identifier
        voca_os_url: Base URL for VocaOS service
        agent_config: Agent configuration dict to update
    """
    social_media_channels = ["whatsapp", "instagram", "facebook", "facebook_messenger", "twitter"]
    
    for channel in channels:
        if channel in social_media_channels:
            # Get the platform configuration from the request data
            platform_config = configuration.get('socialMedia', {}).get('platforms', {}).get(channel, {})
            
            # Build platform-specific configuration
            channel_config = build_platform_configuration(
                channel, platform_config, vendor_identifier, voca_os_url
            )
            
            # Add to agent configuration
            agent_config["socialMedia"]["platforms"][channel] = channel_config
    
    logger.info("Configured social media platforms", 
               channels=channels,
               configured_platforms=list(agent_config["socialMedia"]["platforms"].keys()))


async def provision_vocaos_agent(
    vendor_identifier: str,
    agent_config: Dict[str, Any],
    voca_os_url: str
) -> Dict[str, Any]:
    """
    Provision agent with VocaOS service.
    
    Args:
        vendor_identifier: The vendor identifier
        agent_config: Complete agent configuration
        voca_os_url: Base URL for VocaOS service
        
    Returns:
        Dict containing provisioning results
    """
    try:
        logger.info("Provisioning VocaOS agent", vendor_id=vendor_identifier)
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{voca_os_url}/voca-os/api/v1/vendors/register",
                json={
                    "vendor_id": f"vendor-{vendor_identifier}",
                    "agent_config": agent_config
                },
                timeout=30.0
            )
            
            if response.status_code in [200, 201]:
                voca_os_response = response.json()
                agent_id = voca_os_response['data']['agent_id']
                
                result = {
                    "status": "success",
                    "agent_id": agent_id,
                    "message": "VocaOS agent provisioned successfully",
                    "data": voca_os_response,
                    "vendor_id": vendor_identifier,
                    "note": "VocaOS generated its own agentId internally"
                }
                
                logger.info("VocaOS agent provisioned successfully", 
                           vocaos_agent_id=agent_id, 
                           vendor_id=vendor_identifier,
                           vocaos_response=voca_os_response)
                
                return result
            else:
                result = {
                    "status": "failed",
                    "message": f"Failed to provision VocaOS agent: {response.text}",
                    "error_code": response.status_code
                }
                
                logger.error("Failed to provision VocaOS agent", 
                           status_code=response.status_code,
                           response=response.text)
                
                return result
                
    except Exception as e:
        result = {
            "status": "failed",
            "message": f"Error provisioning VocaOS agent: {str(e)}"
        }
        
        logger.error("Error provisioning VocaOS agent", error_message=str(e))
        return result


def validate_vendor_id(request_data: Dict[str, Any]) -> str:
    """
    Validate and extract vendor ID from request data.
    
    Args:
        request_data: The request data containing vendor information
        
    Returns:
        The validated vendor identifier
        
    Raises:
        ValueError: If vendor_id is missing or invalid
    """
    vendor_identifier = request_data.get('vendor_id')
    
    if not vendor_identifier:
        # Generate a temporary vendor ID if not provided (fallback)
        vendor_identifier = f"vendor-{request_data.get('name', 'agent').lower().replace(' ', '-')}"
        logger.warning("No vendor_id provided, using generated identifier", 
                     generated_vendor_id=vendor_identifier)
    else:
        logger.info("Using provided vendor_id", vendor_id=vendor_identifier)
    
    return vendor_identifier


def check_channel_requirements(channels: List[str]) -> Dict[str, bool]:
    """
    Check what types of channels are requested.
    
    Args:
        channels: List of requested channels
        
    Returns:
        Dict indicating which channel types are present
    """
    social_media_channels = ["whatsapp", "instagram", "facebook", "facebook_messenger", "twitter"]
    voice_channels = ["voice", "sms"]
    
    return {
        "has_social_media": any(channel in social_media_channels for channel in channels),
        "has_voice": any(channel in voice_channels for channel in channels)
    }


def create_provisioning_result(
    service: str,
    status: str,
    message: str,
    **kwargs
) -> Dict[str, Any]:
    """
    Create a standardized provisioning result.
    
    Args:
        service: The service name (voca_os, voca_connect, etc.)
        status: The status (success, failed, pending)
        message: The result message
        **kwargs: Additional fields to include
        
    Returns:
        Dict containing the provisioning result
    """
    result = {
        "status": status,
        "message": message
    }
    
    # Add any additional fields
    result.update(kwargs)
    
    return result
