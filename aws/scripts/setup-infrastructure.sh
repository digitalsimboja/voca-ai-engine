#!/bin/bash

# Voca AI Engine - Infrastructure Setup Script
set -e

# Configuration
AWS_REGION="us-east-1"
TERRAFORM_DIR="aws/terraform"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🏗️  Setting up Voca AI Engine Infrastructure${NC}"

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

# Check if Terraform is installed
if ! command -v terraform &> /dev/null; then
    error "Terraform is not installed. Please install Terraform first."
fi

# Create ECS Cluster
log "Creating ECS cluster..."
aws ecs create-cluster \
    --cluster-name voca-ai-cluster \
    --region "$AWS_REGION" \
    --capacity-providers FARGATE FARGATE_SPOT \
    --default-capacity-provider-strategy capacityProvider=FARGATE,weight=1

# Create secrets in AWS Secrets Manager
log "Creating secrets in AWS Secrets Manager..."

# Generate random passwords if not provided
DB_PASSWORD=${DB_PASSWORD:-$(openssl rand -base64 32)}
JWT_SECRET=${JWT_SECRET:-$(openssl rand -base64 64)}
WEBHOOK_SECRET=${WEBHOOK_SECRET:-$(openssl rand -base64 32)}

# Create database password secret
aws secretsmanager create-secret \
    --name voca-db-password \
    --description "Database password for Voca AI Engine" \
    --secret-string "$DB_PASSWORD" \
    --region "$AWS_REGION" || log "Secret voca-db-password already exists"

# Create JWT secret
aws secretsmanager create-secret \
    --name voca-jwt-secret \
    --description "JWT secret for Voca AI Engine" \
    --secret-string "$JWT_SECRET" \
    --region "$AWS_REGION" || log "Secret voca-jwt-secret already exists"

# Create webhook secret
aws secretsmanager create-secret \
    --name voca-webhook-secret \
    --description "Webhook secret for Voca Connect" \
    --secret-string "$WEBHOOK_SECRET" \
    --region "$AWS_REGION" || log "Secret voca-webhook-secret already exists"

# Create AWS credentials secret (if provided)
if [ ! -z "$AWS_ACCESS_KEY_ID" ] && [ ! -z "$AWS_SECRET_ACCESS_KEY" ]; then
    aws secretsmanager create-secret \
        --name voca-aws-credentials \
        --description "AWS credentials for Voca AI Engine" \
        --secret-string "{\"access_key_id\":\"$AWS_ACCESS_KEY_ID\",\"secret_access_key\":\"$AWS_SECRET_ACCESS_KEY\"}" \
        --region "$AWS_REGION" || log "Secret voca-aws-credentials already exists"
fi

# Initialize Terraform
log "Initializing Terraform..."
cd "$TERRAFORM_DIR"
terraform init

# Plan Terraform deployment
log "Planning Terraform deployment..."
terraform plan \
    -var="db_password=$DB_PASSWORD" \
    -var="jwt_secret=$JWT_SECRET" \
    -var="webhook_secret=$WEBHOOK_SECRET" \
    -out=tfplan

# Apply Terraform deployment
log "Applying Terraform deployment..."
terraform apply tfplan

# Get outputs
log "Getting Terraform outputs..."
terraform output -json > ../terraform-outputs.json

log "🎉 Infrastructure setup completed successfully!"
log "Terraform outputs saved to aws/terraform-outputs.json"

# Display important information
echo ""
echo -e "${GREEN}📋 Important Information:${NC}"
echo "Database Password: $DB_PASSWORD"
echo "JWT Secret: $JWT_SECRET"
echo "Webhook Secret: $WEBHOOK_SECRET"
echo ""
echo -e "${YELLOW}⚠️  Please save these secrets securely!${NC}"
echo ""
echo "Next steps:"
echo "1. Update your ECS task definitions with the correct subnet and security group IDs"
echo "2. Run the deployment script: ./aws/deploy.sh"
