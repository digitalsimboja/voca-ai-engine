"""
Voca Connect Service - AWS Connect Provisioning and Webhook Handler
"""
import os
import json
import logging
from typing import Dict, Any
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
import boto3
from botocore.exceptions import ClientError
import httpx

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Voca Connect Service",
    description="AWS Connect provisioning and webhook handler for Voca AI",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Environment variables
AWS_REGION = os.getenv("AWS_DEFAULT_REGION", "us-east-1")
VOCA_AI_ENGINE_URL = os.getenv("VOCA_AI_ENGINE_URL", "http://voca-ai-engine:8008")
CONNECT_INSTANCE_PREFIX = os.getenv("CONNECT_INSTANCE_ALIAS_PREFIX", "voca-connect")
LAMBDA_PREFIX = os.getenv("LAMBDA_FUNCTION_PREFIX", "voca-lambda")

# AWS clients
connect_client = boto3.client('connect', region_name=AWS_REGION)
lambda_client = boto3.client('lambda', region_name=AWS_REGION)
iam_client = boto3.client('iam', region_name=AWS_REGION)

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "voca-connect",
        "aws_region": AWS_REGION
    }

@app.post("/api/v1/provision")
async def provision_connect_instance(request: Request):
    """Provision AWS Connect instance for a vendor"""
    try:
        body = await request.json()
        vendor_id = body.get("vendor_id")
        agent_config = body.get("agent_config", {})
        
        if not vendor_id:
            raise HTTPException(status_code=400, detail="vendor_id is required")
        
        logger.info(f"Provisioning Connect instance for vendor: {vendor_id}")
        
        # Create Connect instance
        instance_response = await create_connect_instance(vendor_id, agent_config)
        
        # Create contact flow
        flow_response = await create_contact_flow(vendor_id, instance_response['InstanceId'])
        
        # Assign phone number
        phone_response = await assign_phone_number(vendor_id, instance_response['InstanceId'])
        
        # Deploy Lambda function
        lambda_response = await deploy_lambda_function(vendor_id, agent_config)
        
        return {
            "success": True,
            "vendor_id": vendor_id,
            "instance_id": instance_response['InstanceId'],
            "instance_arn": instance_response['InstanceArn'],
            "contact_flow_id": flow_response['ContactFlowId'],
            "phone_number": phone_response.get('PhoneNumber'),
            "lambda_function": lambda_response['FunctionName']
        }
        
    except Exception as e:
        logger.error(f"Error provisioning Connect instance: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Provisioning failed: {str(e)}")

@app.post("/api/v1/webhook")
async def handle_connect_webhook(request: Request):
    """Handle AWS Connect webhook events"""
    try:
        body = await request.json()
        logger.info(f"Received Connect webhook: {body}")
        
        # Extract event details
        event_type = body.get("event_type")
        vendor_id = body.get("vendor_id")
        message = body.get("message", {})
        
        if not vendor_id:
            raise HTTPException(status_code=400, detail="vendor_id is required")
        
        # Route to Voca AI Engine
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{VOCA_AI_ENGINE_URL}/api/v1/webhooks/connect",
                json={
                    "vendor_id": vendor_id,
                    "event_type": event_type,
                    "message": message,
                    "platform": "connect"
                }
            )
            
            if response.status_code != 200:
                logger.error(f"Error routing to Voca AI Engine: {response.text}")
                raise HTTPException(status_code=500, detail="Failed to route message")
            
            return response.json()
            
    except Exception as e:
        logger.error(f"Error handling Connect webhook: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Webhook processing failed: {str(e)}")

@app.delete("/api/v1/deprovision/{vendor_id}")
async def deprovision_connect_instance(vendor_id: str):
    """Deprovision AWS Connect instance for a vendor"""
    try:
        logger.info(f"Deprovisioning Connect instance for vendor: {vendor_id}")
        
        # Get instance ID
        instance_id = await get_instance_id_for_vendor(vendor_id)
        
        if not instance_id:
            return {"success": True, "message": "No instance found for vendor"}
        
        # Delete Lambda function
        await delete_lambda_function(vendor_id)
        
        # Release phone number
        await release_phone_number(vendor_id, instance_id)
        
        # Delete contact flow
        await delete_contact_flow(vendor_id, instance_id)
        
        # Delete Connect instance
        await delete_connect_instance(instance_id)
        
        return {
            "success": True,
            "vendor_id": vendor_id,
            "message": "Successfully deprovisioned"
        }
        
    except Exception as e:
        logger.error(f"Error deprovisioning Connect instance: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Deprovisioning failed: {str(e)}")

# Helper functions
async def create_connect_instance(vendor_id: str, agent_config: Dict[str, Any]) -> Dict[str, str]:
    """Create AWS Connect instance"""
    try:
        instance_alias = f"{CONNECT_INSTANCE_PREFIX}-{vendor_id}"
        
        response = connect_client.create_instance(
            IdentityManagementType='CONNECT_MANAGED',
            InstanceAlias=instance_alias,
            InboundCallsEnabled=True,
            OutboundCallsEnabled=True
        )
        
        return {
            'InstanceId': response['Id'],
            'InstanceArn': response['Arn']
        }
    except ClientError as e:
        logger.error(f"Error creating Connect instance: {e}")
        raise

async def create_contact_flow(vendor_id: str, instance_id: str) -> Dict[str, str]:
    """Create contact flow for the instance"""
    try:
        flow_name = f"VocaFlow-{vendor_id}"
        
        # Basic contact flow content
        flow_content = {
            "Version": "2019-10-30",
            "StartAction": "12345678-1234-1234-1234-123456789012",
            "Actions": {
                "12345678-1234-1234-1234-123456789012": {
                    "Type": "InvokeLambdaFunction",
                    "Parameters": {
                        "FunctionArn": f"arn:aws:lambda:{AWS_REGION}:*:function:{LAMBDA_PREFIX}-{vendor_id}"
                    },
                    "Transitions": {
                        "NextAction": "87654321-4321-4321-4321-210987654321",
                        "Errors": []
                    }
                },
                "87654321-4321-4321-4321-210987654321": {
                    "Type": "DisconnectFlow",
                    "Parameters": {}
                }
            }
        }
        
        response = connect_client.create_contact_flow(
            InstanceId=instance_id,
            Name=flow_name,
            Type='CONTACT_FLOW',
            Content=json.dumps(flow_content)
        )
        
        return {
            'ContactFlowId': response['ContactFlowId'],
            'ContactFlowArn': response['ContactFlowArn']
        }
    except ClientError as e:
        logger.error(f"Error creating contact flow: {e}")
        raise

async def assign_phone_number(vendor_id: str, instance_id: str) -> Dict[str, str]:
    """Assign phone number to the instance"""
    try:
        # Get available phone numbers
        response = connect_client.list_phone_numbers(
            InstanceId=instance_id,
            PhoneNumberTypes=['DID']
        )
        
        if response['PhoneNumberSummaryList']:
            phone_number = response['PhoneNumberSummaryList'][0]['PhoneNumber']
            return {'PhoneNumber': phone_number}
        else:
            # Request a new phone number
            response = connect_client.claim_phone_number(
                TargetArn=f"arn:aws:connect:{AWS_REGION}:*:instance/{instance_id}",
                PhoneNumber="+1234567890"  # This would be a real number in production
            )
            return {'PhoneNumber': response['PhoneNumberId']}
            
    except ClientError as e:
        logger.error(f"Error assigning phone number: {e}")
        raise

async def deploy_lambda_function(vendor_id: str, agent_config: Dict[str, Any]) -> Dict[str, str]:
    """Deploy Lambda function for the vendor"""
    try:
        function_name = f"{LAMBDA_PREFIX}-{vendor_id}"
        
        # Create Lambda function (simplified)
        # In production, this would include actual function code
        response = lambda_client.create_function(
            FunctionName=function_name,
            Runtime='python3.11',
            Role='arn:aws:iam::*:role/lambda-execution-role',
            Handler='index.handler',
            Code={
                'ZipFile': b'def handler(event, context): return {"statusCode": 200, "body": "Hello from Lambda"}'
            }
        )
        
        return {
            'FunctionName': response['FunctionName'],
            'FunctionArn': response['FunctionArn']
        }
    except ClientError as e:
        logger.error(f"Error deploying Lambda function: {e}")
        raise

async def get_instance_id_for_vendor(vendor_id: str) -> str:
    """Get Connect instance ID for a vendor"""
    try:
        response = connect_client.list_instances()
        instance_alias = f"{CONNECT_INSTANCE_PREFIX}-{vendor_id}"
        
        for instance in response['InstanceSummaryList']:
            if instance['InstanceAlias'] == instance_alias:
                return instance['Id']
        
        return None
    except ClientError as e:
        logger.error(f"Error getting instance ID: {e}")
        raise

async def delete_lambda_function(vendor_id: str):
    """Delete Lambda function for the vendor"""
    try:
        function_name = f"{LAMBDA_PREFIX}-{vendor_id}"
        lambda_client.delete_function(FunctionName=function_name)
    except ClientError as e:
        logger.error(f"Error deleting Lambda function: {e}")
        # Don't raise - function might not exist

async def release_phone_number(vendor_id: str, instance_id: str):
    """Release phone number from the instance"""
    try:
        response = connect_client.list_phone_numbers(InstanceId=instance_id)
        for phone in response['PhoneNumberSummaryList']:
            connect_client.release_phone_number(PhoneNumberId=phone['PhoneNumberId'])
    except ClientError as e:
        logger.error(f"Error releasing phone number: {e}")
        # Don't raise - phone might not exist

async def delete_contact_flow(vendor_id: str, instance_id: str):
    """Delete contact flow for the instance"""
    try:
        flow_name = f"VocaFlow-{vendor_id}"
        response = connect_client.list_contact_flows(
            InstanceId=instance_id,
            ContactFlowTypes=['CONTACT_FLOW']
        )
        
        for flow in response['ContactFlowSummaryList']:
            if flow['Name'] == flow_name:
                connect_client.delete_contact_flow(
                    InstanceId=instance_id,
                    ContactFlowId=flow['Id']
                )
                break
    except ClientError as e:
        logger.error(f"Error deleting contact flow: {e}")
        # Don't raise - flow might not exist

async def delete_connect_instance(instance_id: str):
    """Delete Connect instance"""
    try:
        connect_client.delete_instance(InstanceId=instance_id)
    except ClientError as e:
        logger.error(f"Error deleting Connect instance: {e}")
        raise

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
