#!/bin/bash

# Voca AI Engine AWS ECS Deployment Script
set -e

# Configuration
AWS_REGION="us-east-1"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPOSITORY_PREFIX="voca"
ECS_CLUSTER_NAME="voca-ai-cluster"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting Voca AI Engine AWS Deployment${NC}"
echo "AWS Account ID: $AWS_ACCOUNT_ID"
echo "AWS Region: $AWS_REGION"
echo "ECS Cluster: $ECS_CLUSTER_NAME"

# Function to log messages
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
    exit 1
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

# Check if AWS CLI is configured
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    error "AWS CLI is not configured. Please run 'aws configure' first."
fi

# Create ECR repositories if they don't exist
create_ecr_repository() {
    local repo_name=$1
    local full_repo_name="$ECR_REPOSITORY_PREFIX-$repo_name"
    
    if ! aws ecr describe-repositories --repository-names "$full_repo_name" --region "$AWS_REGION" > /dev/null 2>&1; then
        log "Creating ECR repository: $full_repo_name"
        aws ecr create-repository \
            --repository-name "$full_repo_name" \
            --region "$AWS_REGION" \
            --image-scanning-configuration scanOnPush=true \
            --encryption-configuration encryptionType=AES256
    else
        log "ECR repository $full_repo_name already exists"
    fi
}

# Build and push Docker image
build_and_push_image() {
    local service_name=$1
    local dockerfile_path=$2
    local context_path=$3
    
    local full_repo_name="$ECR_REPOSITORY_PREFIX-$service_name"
    local ecr_uri="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$full_repo_name"
    
    log "Building and pushing $service_name image..."
    
    # Get ECR login token
    aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
    
    # Build image
    docker build \
        -f "$dockerfile_path" \
        -t "$full_repo_name:latest" \
        -t "$ecr_uri:latest" \
        "$context_path"
    
    # Push image
    docker push "$ecr_uri:latest"
    
    log "Successfully pushed $service_name image to ECR"
}

# Register ECS task definition
register_task_definition() {
    local task_def_file=$1
    local task_family=$2
    
    log "Registering task definition for $task_family..."
    
    # Replace placeholders in task definition
    sed -i.bak "s/ACCOUNT_ID/$AWS_ACCOUNT_ID/g" "$task_def_file"
    sed -i.bak "s/REGION/$AWS_REGION/g" "$task_def_file"
    
    # Register task definition
    aws ecs register-task-definition \
        --cli-input-json "file://$task_def_file" \
        --region "$AWS_REGION"
    
    # Restore original file
    mv "$task_def_file.bak" "$task_def_file"
    
    log "Successfully registered task definition for $task_family"
}

# Update ECS service
update_service() {
    local service_file=$1
    local service_name=$2
    
    log "Updating ECS service: $service_name..."
    
    # Replace placeholders in service definition
    sed -i.bak "s/ACCOUNT_ID/$AWS_ACCOUNT_ID/g" "$service_file"
    sed -i.bak "s/REGION/$AWS_REGION/g" "$service_file"
    
    # Update service
    aws ecs update-service \
        --cluster "$ECS_CLUSTER_NAME" \
        --service "$service_name" \
        --task-definition "$service_name" \
        --region "$AWS_REGION"
    
    # Restore original file
    mv "$service_file.bak" "$service_file"
    
    log "Successfully updated service: $service_name"
}

# Main deployment process
main() {
    log "Starting deployment process..."
    
    # Create ECR repositories
    log "Creating ECR repositories..."
    create_ecr_repository "ai-engine"
    create_ecr_repository "os"
    create_ecr_repository "connect"
    
    # Build and push images
    log "Building and pushing Docker images..."
    build_and_push_image "ai-engine" "docker/Dockerfile.voca-ai-engine" "."
    build_and_push_image "os" "docker/Dockerfile.voca-os" "services/voca-os"
    build_and_push_image "connect" "docker/Dockerfile.voca-connect" "services/voca-connect"
    
    # Register task definitions
    log "Registering ECS task definitions..."
    register_task_definition "aws/ecs-task-definitions/voca-ai-engine-task.json" "voca-ai-engine"
    register_task_definition "aws/ecs-task-definitions/voca-os-task.json" "voca-os"
    register_task_definition "aws/ecs-task-definitions/voca-connect-task.json" "voca-connect"
    
    # Update services
    log "Updating ECS services..."
    update_service "aws/ecs-services/voca-ai-engine-service.json" "voca-ai-engine-service"
    update_service "aws/ecs-services/voca-os-service.json" "voca-os-service"
    update_service "aws/ecs-services/voca-connect-service.json" "voca-connect-service"
    
    log "🎉 Deployment completed successfully!"
    log "Services are being updated. Check ECS console for status."
}

# Run main function
main "$@"
