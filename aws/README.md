# 🚀 Voca AI Engine - AWS ECS Fargate Deployment

This directory contains all the configuration files and scripts needed to deploy the Voca AI Engine to AWS ECS Fargate.

## 📋 Architecture Overview

### **ECS Fargate Services**
- **voca-ai-engine-service** - Main API Gateway (FastAPI)
- **voca-os-service** - Agent Management (Node.js)
- **voca-connect-service** - AWS Connect Provisioning (FastAPI)

### **Infrastructure Components**
- **ECS Cluster**: `voca-ai-cluster` (Fargate)
- **ECR Repositories**: Container image storage
- **Application Load Balancer**: Traffic distribution
- **RDS Aurora**: PostgreSQL database
- **Secrets Manager**: Secure credential storage
- **CloudWatch Logs**: Centralized logging

## 🏗️ Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AWS ECS Fargate                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   voca-ai-engine│  │     voca-os     │  │  voca-connect   │  │
│  │   (Task)        │  │   (Task)        │  │   (Task)        │  │
│  │   Port: 8008    │  │   Port: 3001    │  │   Port: 8001    │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│           │                       │                       │      │
│           └───────────────────────┼───────────────────────┘      │
│                                   │                              │
│                    ┌─────────────────┐                          │
│                    │   RDS Aurora    │                          │
│                    │   PostgreSQL    │                          │
│                    └─────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Application Load Balancer                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │   Target    │  │   Target    │  │   Target    │            │
│  │   Group 1   │  │   Group 2   │  │   Group 3   │            │
│  │  voca-ai    │  │  voca-os    │  │ voca-connect│            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

## 📁 Directory Structure

```
aws/
├── ecs-task-definitions/          # ECS Task Definitions
│   ├── voca-ai-engine-task.json
│   ├── voca-os-task.json
│   └── voca-connect-task.json
├── ecs-services/                  # ECS Service Definitions
│   ├── voca-ai-engine-service.json
│   ├── voca-os-service.json
│   └── voca-connect-service.json
├── terraform/                     # Infrastructure as Code (Optional)
│   ├── main.tf
│   ├── variables.tf
│   └── outputs.tf
├── scripts/                       # Deployment Scripts
│   ├── setup-infrastructure.sh
│   └── create-secrets.sh
├── deploy.sh                      # Main Deployment Script
└── README.md                      # This file
```

## 🚀 Quick Start Deployment

### **Prerequisites**
1. **AWS CLI** configured with appropriate permissions
2. **Docker** installed and running
3. **ECS Cluster** created (see setup instructions below)
4. **RDS Database** provisioned
5. **Secrets Manager** secrets created

### **1. Setup Infrastructure**

```bash
# Create ECS Cluster
aws ecs create-cluster --cluster-name voca-ai-cluster --region us-east-1

# Create VPC and Subnets (if not exists)
# Create Security Groups
# Create RDS Aurora Cluster
# Create Application Load Balancer
```

### **2. Create Secrets**

```bash
# AWS Credentials
aws secretsmanager create-secret \
    --name voca-aws-credentials \
    --description "AWS credentials for Voca AI Engine" \
    --secret-string '{"access_key_id":"YOUR_ACCESS_KEY","secret_access_key":"YOUR_SECRET_KEY"}' \
    --region us-east-1

# JWT Secret
aws secretsmanager create-secret \
    --name voca-jwt-secret \
    --description "JWT secret for Voca AI Engine" \
    --secret-string "YOUR_JWT_SECRET" \
    --region us-east-1

# Webhook Secret
aws secretsmanager create-secret \
    --name voca-webhook-secret \
    --description "Webhook secret for Voca Connect" \
    --secret-string "YOUR_WEBHOOK_SECRET" \
    --region us-east-1
```

### **3. Deploy Services**

```bash
# Make deployment script executable
chmod +x aws/deploy.sh

# Run deployment
./aws/deploy.sh
```

## 🔧 Service Communication

### **Internal Communication**
Services communicate via HTTP/REST APIs within the ECS cluster:

```python
# voca-ai-engine → voca-os
POST http://voca-os-service:3001/api/v1/agents

# voca-ai-engine → voca-connect  
POST http://voca-connect-service:8001/api/v1/provision

# voca-os → voca-ai-engine (callbacks)
POST http://voca-ai-engine-service:8008/api/v1/agents/{vendor_id}/status
```

### **External Access**
- **Main API**: `https://api.voca-ai.com` (voca-ai-engine)
- **Agent Service**: `https://agents.voca-ai.com` (voca-os)
- **Connect Service**: `https://connect.voca-ai.com` (voca-connect)

## 📊 Resource Allocation

### **Task Definitions**
| Service | CPU | Memory | Desired Count |
|---------|-----|--------|---------------|
| voca-ai-engine | 512 | 1024MB | 2 |
| voca-os | 256 | 512MB | 1 |
| voca-connect | 512 | 1024MB | 1 |

### **Scaling Configuration**
- **Auto Scaling**: Enabled for all services
- **Target Tracking**: CPU utilization at 70%
- **Min/Max**: 1-10 tasks per service

## 🔐 Security

### **IAM Roles**
- **ecsTaskExecutionRole**: Pull images from ECR
- **voca-ai-engine-task-role**: Access to AWS services
- **voca-os-task-role**: S3 and database access
- **voca-connect-task-role**: AWS Connect and Lambda access

### **Security Groups**
- **sg-voca-ai-engine**: Port 8008 (HTTP)
- **sg-voca-os**: Port 3001 (HTTP)
- **sg-voca-connect**: Port 8001 (HTTP)
- **sg-rds**: Port 5432 (PostgreSQL)

### **Secrets Management**
- AWS credentials stored in Secrets Manager
- JWT secrets encrypted at rest
- Database passwords managed securely

## 📈 Monitoring & Logging

### **CloudWatch Logs**
- All services log to CloudWatch
- Log groups: `/ecs/voca-ai-engine`, `/ecs/voca-os`, `/ecs/voca-connect`
- Structured logging with JSON format

### **Health Checks**
- Application-level health checks on `/health` endpoints
- ECS health checks every 30 seconds
- Load balancer health checks for external traffic

### **Metrics**
- CPU and memory utilization
- Request count and latency
- Error rates and availability

## 🔄 CI/CD Pipeline

### **GitHub Actions Workflow**
```yaml
name: Deploy to AWS ECS
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v1
      - name: Build and push images
        run: ./aws/deploy.sh
```

## 🛠️ Troubleshooting

### **Common Issues**

1. **Service won't start**
   - Check task definition for missing environment variables
   - Verify ECR image exists and is accessible
   - Check security group rules

2. **Services can't communicate**
   - Verify service discovery is working
   - Check security group rules between services
   - Ensure correct service names in URLs

3. **Database connection issues**
   - Verify RDS endpoint and credentials
   - Check security group allows ECS tasks to connect
   - Ensure database is accessible from VPC

### **Useful Commands**

```bash
# Check service status
aws ecs describe-services --cluster voca-ai-cluster --services voca-ai-engine-service

# View logs
aws logs tail /ecs/voca-ai-engine --follow

# Scale service
aws ecs update-service --cluster voca-ai-cluster --service voca-ai-engine-service --desired-count 3

# Force new deployment
aws ecs update-service --cluster voca-ai-cluster --service voca-ai-engine-service --force-new-deployment
```

## 💰 Cost Optimization

### **Fargate Spot**
- Use Fargate Spot for non-critical workloads
- Can reduce costs by up to 70%

### **Auto Scaling**
- Scale down during low traffic periods
- Use scheduled scaling for predictable patterns

### **Resource Optimization**
- Monitor actual CPU/memory usage
- Adjust task definitions based on real usage
- Use CloudWatch insights for optimization

## 📞 Support

For deployment issues or questions:
1. Check CloudWatch logs for error details
2. Verify all prerequisites are met
3. Review security group and IAM permissions
4. Contact the DevOps team for assistance

---

**Note**: Replace all placeholder values (ACCOUNT_ID, REGION, etc.) with your actual AWS account details before deployment.
