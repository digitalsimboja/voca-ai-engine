# Voca AI Engine - Agent Routing & Provisioning System

## Phase 2: Core Engine for Autonomous Agent Management

The Voca AI Engine is the core backend system that handles agent routing, provisioning, and orchestration across multiple communication channels including AWS Connect (voice/SMS) and social media platforms (WhatsApp, Instagram, Twitter, Facebook) using the [ElizaOS framework](https://github.com/elizaOS/eliza).

## Table of Contents

1. [System Architecture Overview](#system-architecture-overview)
2. [Agent Provisioning Flow](#agent-provisioning-flow)
3. [Real-World Example](#real-world-example)
4. [Technical Implementation](#technical-implementation)
5. [API Documentation](#api-documentation)
6. [Getting Started](#getting-started)
7. [Development Guide](#development-guide)

## System Architecture Overview

```
Voca AI Frontend → vocaai-backend → voca-ai-engine → AWS Services + ElizaOS Agents
                        ↓                    ↓
                Vendor Management    Agent Router & Provisioner
                        ↓                    ↓
                ┌─────────────────────────────────────┐
                │  AWS Connect  │  ElizaOS Agents    │
                │  - Voice      │  - WhatsApp        │
                │  - SMS        │  - Instagram       │
                │  - Chat       │  - Twitter         │
                │               │  - Facebook        │
                └─────────────────────────────────────┘
```

### Key Components:
- **vocaai-backend**: Vendor management and API gateway
- **voca-ai-engine**: Agent Router Engine - Central orchestration system
- **AWS Connect Provisioner**: Automated Amazon Connect instance management
- **ElizaOS Agent Manager**: Social media agent creation and management
- **Context Manager**: Cross-channel context sharing and persistence

## Agent Provisioning Flow

### Overview
When a vendor creates an agent on the Voca AI platform:
1. **vocaai-backend** receives the request and manages vendor data
2. **vocaai-backend** calls **voca-ai-engine** to provision the agent
3. **voca-ai-engine** automatically provisions:
   - **AWS Connect Instance** - For voice and SMS communications
   - **ElizaOS Agent** - For all social media platforms (Instagram, WhatsApp, Facebook, Twitter)
   - **Shared Context** - Cross-channel conversation history and business context

### Step-by-Step Process

#### 1. Vendor Submits Agent Creation Request

**Frontend → vocaai-backend API Call:**
```json
POST /api/v1/agents
{
  "name": "Cozy Comfort Bedding Agent",
  "description": "AI agent for Cozy Comfort Bedding store",
  "business_type": "retail",
  "channels": ["instagram", "whatsapp", "facebook", "twitter", "voice"],
  "character_config": {
    "business_name": "Cozy Comfort Bedding",
    "products": ["bedding_sets", "pillows", "comforters", "duvets"],
    "specialties": ["bedding", "home_decor", "sleep_products"],
    "tone": "friendly_helpful",
    "knowledge_base": {
      "product_catalog": "bedding_products.json",
      "return_policy": "30-day returns",
      "shipping_info": "Free shipping over $50"
    }
  },
  "context": {
    "store_hours": "9 AM - 6 PM EST",
    "contact_info": "+1-555-BEDDING",
    "website": "cozycomfort.com"
  }
}
```

#### 2. vocaai-backend → voca-ai-engine Provisioning Request

**vocaai-backend processes the request and calls the engine:**
```json
POST http://voca-ai-engine:8008/api/v1/agents/provision
{
  "vendor_id": "vendor_ccb_123",
  "agent_config": {
    "name": "Cozy Comfort Bedding Agent",
    "description": "AI agent for Cozy Comfort Bedding store",
    "business_type": "retail",
    "channels": ["instagram", "whatsapp", "facebook", "twitter", "voice"],
    "character_config": {
      "business_name": "Cozy Comfort Bedding",
      "products": ["bedding_sets", "pillows", "comforters", "duvets"],
      "specialties": ["bedding", "home_decor", "sleep_products"],
      "tone": "friendly_helpful",
      "knowledge_base": {
        "product_catalog": "bedding_products.json",
        "return_policy": "30-day returns",
        "shipping_info": "Free shipping over $50"
      }
    },
    "context": {
      "store_hours": "9 AM - 6 PM EST",
      "contact_info": "+1-555-BEDDING",
      "website": "cozycomfort.com"
    }
  }
}
```

#### 3. voca-ai-engine Processing

**`provisioning_routes.py` → `AgentOrchestrator.create_multi_channel_agent()`**

```python
# 1. Generate unique agent ID
agent_id = "voca-agent-ccb-12345"

# 2. Create base agent record
agent = {
    "id": agent_id,
    "name": "Cozy Comfort Bedding Agent",
    "status": "draft",
    "channels": [],
    "character_config": {...},
    "context": {...}
}
```

#### 4. Channel-Specific Provisioning

**For each channel, the orchestrator calls `_setup_channel()`:**

##### A. Voice/SMS Channels (AWS Connect)
```python
# Channel: "voice"
channel_info = {
    "id": "channel-voice-001",
    "agent_id": "voca-agent-ccb-12345",
    "channel_type": "voice",
    "status": "provisioning"
}

# AWS Connect Provisioning
connect_info = await aws_provisioner.provision_instance({
    "agent_id": "voca-agent-ccb-12345",
    "channel_type": "voice",
    "business_type": "retail",
    "business_name": "Cozy Comfort Bedding"
})
```

**AWS Connect Provisioning Steps:**
1. **Create Connect Instance:**
   ```python
   # Creates: "voca-ai-voca-agent-ccb-12345" instance
   instance_id = "arn:aws:connect:us-east-1:123456789012:instance/abc123"
   ```

2. **Create Contact Flow:**
   ```python
   # Custom flow for bedding store
   flow_content = {
       "greeting": "Welcome to Cozy Comfort Bedding! How can I help you today?",
       "menu_options": [
           "Product inquiries",
           "Order status",
           "Returns & exchanges",
           "Speak to human agent"
       ],
       "business_hours": "9 AM - 6 PM EST"
   }
   ```

3. **Assign Phone Number:**
   ```python
   phone_number = "+1-555-BEDDING"
   # Links to the contact flow
   ```

4. **Deploy Lambda Function:**
   ```python
   # Lambda function that handles voice interactions
   lambda_arn = "arn:aws:lambda:us-east-1:123456789012:function:voca-ai-voca-agent-ccb-12345"
   ```

##### B. Social Media Channels (ElizaOS)
```python
# Channels: ["instagram", "whatsapp", "facebook", "twitter"]
for channel in ["instagram", "whatsapp", "facebook", "twitter"]:
    elizaos_info = await elizaos_manager.create_agent({
        "agent_id": "voca-agent-ccb-12345",
        "channel_type": channel,
        "business_type": "retail",
        "character_config": {...}
    })
```

**ElizaOS Agent Creation Steps:**

1. **Generate Character Configuration:**
   ```json
   {
     "name": "Cozy Comfort Bedding Agent",
     "description": "AI-powered customer service agent for Cozy Comfort Bedding",
     "instructions": "You are a friendly and helpful customer service agent for Cozy Comfort Bedding, a premium bedding store. You specialize in helping customers with bedding products, sleep solutions, and home decor. Always maintain a warm, professional tone and provide accurate product information.",
     "plugins": [
       "@elizaos/plugin-bootstrap",
       "@elizaos/plugin-sql",
       "@elizaos/plugin-instagram",
       "@elizaos/plugin-whatsapp",
       "@elizaos/plugin-facebook",
       "@elizaos/plugin-twitter"
     ],
     "context": {
       "business_name": "Cozy Comfort Bedding",
       "business_type": "retail",
       "products": ["bedding_sets", "pillows", "comforters", "duvets"],
       "specialties": ["bedding", "home_decor", "sleep_products"],
       "tone": "friendly_helpful",
       "store_hours": "9 AM - 6 PM EST",
       "contact_info": "+1-555-BEDDING",
       "website": "cozycomfort.com",
       "knowledge_base": {
         "product_catalog": "bedding_products.json",
         "return_policy": "30-day returns",
         "shipping_info": "Free shipping over $50"
       }
     }
   }
   ```

2. **Create ElizaOS Agent:**
   ```bash
   # ElizaOS CLI commands
   elizaos create agent --name "cozy-comfort-bedding-agent" --config character.json
   elizaos agent start --name "cozy-comfort-bedding-agent"
   ```

3. **Configure Social Media Plugins:**
   ```python
   # Instagram Plugin Configuration
   instagram_config = {
       "business_account_id": "cozy_comfort_bedding",
       "webhook_url": "https://api.voca-ai.com/webhooks/elizaos",
       "auto_reply_enabled": True,
       "response_templates": {
           "greeting": "Hi! Welcome to Cozy Comfort Bedding 🛏️ How can I help you today?",
           "product_inquiry": "I'd love to help you find the perfect bedding! What are you looking for?",
           "order_status": "I can help you check your order status. What's your order number?"
       }
   }
   ```

#### 5. Context Management Setup

```python
# Initialize agent context
context = {
    "agent_id": "voca-agent-ccb-12345",
    "context_data": {
        "business_name": "Cozy Comfort Bedding",
        "business_type": "retail",
        "products": ["bedding_sets", "pillows", "comforters", "duvets"],
        "current_conversations": {},
        "knowledge_base": {...}
    },
    "conversation_history": [],
    "last_updated": "2024-01-01T00:00:00Z"
}
```

#### 6. Final Agent Configuration

**voca-ai-engine → vocaai-backend Response:**
```json
{
  "provisioning_id": "prov_ccb_12345",
  "status": "completed",
  "agent_id": "voca-agent-ccb-12345",
  "agent_config": {
    "id": "voca-agent-ccb-12345",
    "name": "Cozy Comfort Bedding Agent",
    "status": "active",
    "channels": [
      {
        "channel_type": "voice",
        "status": "active",
        "phone_number": "+1-555-BEDDING",
        "aws_connect_instance_id": "arn:aws:connect:us-east-1:123456789012:instance/abc123"
      },
      {
        "channel_type": "instagram",
        "status": "active",
        "elizaos_agent_id": "elizaos-cozy-comfort-bedding-instagram",
        "webhook_url": "https://api.voca-ai.com/webhooks/elizaos"
      },
      {
        "channel_type": "whatsapp",
        "status": "active",
        "elizaos_agent_id": "elizaos-cozy-comfort-bedding-whatsapp"
      },
      {
        "channel_type": "facebook",
        "status": "active",
        "elizaos_agent_id": "elizaos-cozy-comfort-bedding-facebook"
      },
      {
        "channel_type": "twitter",
        "status": "active",
        "elizaos_agent_id": "elizaos-cozy-comfort-bedding-twitter"
      }
    ],
    "provisioning_complete": true
  }
}
```

**vocaai-backend → Vendor Response:**
```json
{
  "id": "voca-agent-ccb-12345",
  "name": "Cozy Comfort Bedding Agent",
  "status": "active",
  "channels": [
    {
      "channel_type": "voice",
      "status": "active",
      "phone_number": "+1-555-BEDDING",
      "aws_connect_instance_id": "arn:aws:connect:us-east-1:123456789012:instance/abc123"
    },
    {
      "channel_type": "instagram",
      "status": "active",
      "elizaos_agent_id": "elizaos-cozy-comfort-bedding-instagram",
      "webhook_url": "https://api.voca-ai.com/webhooks/elizaos"
    },
    {
      "channel_type": "whatsapp",
      "status": "active",
      "elizaos_agent_id": "elizaos-cozy-comfort-bedding-whatsapp"
    },
    {
      "channel_type": "facebook",
      "status": "active",
      "elizaos_agent_id": "elizaos-cozy-comfort-bedding-facebook"
    },
    {
      "channel_type": "twitter",
      "status": "active",
      "elizaos_agent_id": "elizaos-cozy-comfort-bedding-twitter"
    }
  ],
  "provisioning_complete": true
}
```

## Real-World Example

### 🏪 Vendor Scenario: Bedding Store on Instagram

**Vendor Details:**
- Business: "Cozy Comfort Bedding"
- Platform: Instagram (primary)
- Products: Bedding sets, pillows, comforters
- Customer Service: Voice calls + Social media support

**Architecture Flow:**
- **Frontend** → **vocaai-backend** (vendor management)
- **vocaai-backend** → **voca-ai-engine** (agent provisioning)
- **voca-ai-engine** → **AWS Connect + ElizaOS** (service provisioning)

### 🔄 Real-Time Message Flow

#### Instagram Customer Message:
```
Customer: "Hi! I'm looking for a new comforter set for my queen bed"
```

**Flow:**
1. **Instagram → ElizaOS Webhook:**
   ```json
   POST /api/v1/webhooks/elizaos
   {
     "platform": "instagram",
     "agent_id": "voca-agent-ccb-12345",
     "message": "Hi! I'm looking for a new comforter set for my queen bed",
     "user_id": "customer_123",
     "timestamp": "2024-01-01T10:30:00Z"
   }
   ```

2. **ElizaOS Agent Processing:**
   ```python
   # ElizaOS agent receives message
   response = await elizaos_manager.handle_message(
       agent_id="voca-agent-ccb-12345",
       channel="instagram",
       message={...}
   )
   ```

3. **Context-Aware Response:**
   ```json
   {
     "message": "Hi there! 👋 I'd love to help you find the perfect comforter set for your queen bed! We have several beautiful options. What style are you looking for - modern, traditional, or something specific? Also, what's your preferred color scheme?",
     "agent_id": "voca-agent-ccb-12345",
     "channel": "instagram",
     "context_updated": true
   }
   ```

#### Voice Call:
```
Customer calls: +1-555-BEDDING
```

**Flow:**
1. **AWS Connect → Lambda Function:**
   ```python
   # Lambda function receives call event
   def lambda_handler(event, context):
       agent_id = "voca-agent-ccb-12345"
       message = {
           "type": "voice_call",
           "customer_number": "+1-555-123-4567",
           "timestamp": "2024-01-01T10:30:00Z"
       }
       
       # Route to orchestrator
       response = await orchestrator.route_message("voice", message)
       return response
   ```

2. **Voice Response Generation:**
   ```json
   {
     "message": "Welcome to Cozy Comfort Bedding! How can I help you today? You can ask about our products, check order status, or speak with a human agent.",
     "agent_id": "voca-agent-ccb-12345",
     "channel": "voice",
     "tts_ready": true
   }
   ```

## Technical Implementation

### Project Structure
```
voca-ai-engine/
├── docker/                          # Docker files organized
│   ├── Dockerfile                   # Main FastAPI application
│   ├── Dockerfile.elizaos           # ElizaOS manager service
│   └── Dockerfile.webhook           # AWS Connect webhook handler
├── api/                             # API layer
│   ├── routes/                      # API route handlers
│   │   ├── agent_routes.py          # Agent management endpoints
│   │   ├── provisioning_routes.py   # Provisioning endpoints
│   │   └── webhook_routes.py        # Webhook handlers
│   ├── models/                      # Pydantic models
│   │   ├── agent.py                 # Agent data models
│   │   ├── channel.py               # Channel data models
│   │   └── provisioning.py          # Provisioning models
│   └── middleware/                  # API middleware
│       └── auth.py                  # Authentication middleware
├── core/                            # Core business logic
│   ├── orchestrator/                # Agent orchestration
│   │   └── agent_orchestrator.py    # Main orchestrator
│   ├── provisioner/                 # Provisioning services
│   │   ├── aws_connect.py           # AWS Connect provisioner
│   │   └── elizaos_manager.py       # ElizaOS manager
│   └── context_manager.py           # Context management
├── services/                        # External service integrations
│   ├── aws/                         # AWS services
│   └── elizaos/                     # ElizaOS services
├── config/                          # Configuration
│   └── settings.py                  # Application settings
├── main.py                          # FastAPI application entry point
├── docker-compose.yml               # Multi-service orchestration
├── requirements.txt                 # Python dependencies
├── requirements.webhook.txt         # Webhook service dependencies
├── package.json                     # Node.js dependencies
├── env.example                      # Environment variables template
└── .dockerignore                    # Docker build optimization
```

### Core Components

#### Agent Orchestrator
- **Purpose**: Central orchestration system for agent lifecycle management
- **Responsibilities**: 
  - Agent creation and provisioning
  - Message routing across channels
  - Context management
  - Agent status management

#### AWS Connect Provisioner
- **Purpose**: Automated Amazon Connect instance management
- **Features**:
  - Instance creation and configuration
  - Contact flow generation
  - Phone number assignment
  - Lambda function deployment

#### ElizaOS Manager
- **Purpose**: Social media agent creation and management
- **Features**:
  - Character configuration generation
  - Plugin setup for social platforms
  - Agent lifecycle management
  - Message processing

#### Context Manager
- **Purpose**: Cross-channel context sharing and persistence
- **Features**:
  - Conversation history storage
  - Context synchronization
  - Business logic persistence

## API Documentation

### Agent Provisioning Endpoints

#### Provision Agent (Internal - Called by vocaai-backend)
```http
POST /api/v1/agents/provision
Content-Type: application/json

{
  "vendor_id": "vendor_123",
  "agent_config": {
    "name": "Agent Name",
    "description": "Agent description",
    "business_type": "retail|microfinance|other",
    "channels": ["instagram", "whatsapp", "facebook", "twitter", "voice"],
    "character_config": {
      "business_name": "Business Name",
      "products": ["product1", "product2"],
      "tone": "friendly_helpful|professional_friendly"
    }
  }
}
```

### Agent Management Endpoints

#### Create Agent (Internal - Called by vocaai-backend)
```http
POST /api/v1/agents
Content-Type: application/json

{
  "name": "Agent Name",
  "description": "Agent description",
  "business_type": "retail|microfinance|other",
  "channels": ["instagram", "whatsapp", "facebook", "twitter", "voice"],
  "character_config": {
    "business_name": "Business Name",
    "products": ["product1", "product2"],
    "tone": "friendly_helpful|professional_friendly"
  }
}
```

#### List Agents
```http
GET /api/v1/agents?skip=0&limit=100&status=active
```

#### Get Agent Details
```http
GET /api/v1/agents/{agent_id}
```

#### Update Agent
```http
PUT /api/v1/agents/{agent_id}
Content-Type: application/json

{
  "name": "Updated Agent Name",
  "status": "active|paused|stopped"
}
```

#### Delete Agent
```http
DELETE /api/v1/agents/{agent_id}
```

### Agent Control Endpoints

#### Start Agent
```http
POST /api/v1/agents/{agent_id}/start
```

#### Stop Agent
```http
POST /api/v1/agents/{agent_id}/stop
```

#### Pause Agent
```http
POST /api/v1/agents/{agent_id}/pause
```

#### Resume Agent
```http
POST /api/v1/agents/{agent_id}/resume
```

### Webhook Endpoints

#### AWS Connect Webhook
```http
POST /api/v1/webhooks/connect
Content-Type: application/json

{
  "agent_id": "voca-agent-123",
  "message": "Customer message",
  "channel": "voice|sms"
}
```

#### ElizaOS Webhook (Social Media)
```http
POST /api/v1/webhooks/elizaos
Content-Type: application/json

{
  "platform": "instagram|whatsapp|facebook|twitter",
  "agent_id": "voca-agent-123",
  "message": "Customer message",
  "user_id": "customer_123"
}
```

## Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+
- Docker and Docker Compose
- AWS CLI configured
- ElizaOS CLI installed

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd voca-ai-engine
```

2. **Set up environment variables**
```bash
cp env.example .env
# Edit .env with your configuration
```

3. **Start the development environment**
```bash
docker-compose up -d
```

4. **Access the application**
- Main API: http://localhost:8008
- API Documentation: http://localhost:8008/docs
- Health Check: http://localhost:8008/health

### Environment Configuration

#### Required Environment Variables
```bash
# Database
DATABASE_URL=postgresql://voca_user:voca_password@localhost:5432/voca_ai_db

# AWS Configuration
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_DEFAULT_REGION=us-east-1

# ElizaOS Configuration
ELIZAOS_API_KEY=your_elizaos_api_key
ELIZAOS_WORKSPACE=/app/elizaos

# Security
JWT_SECRET_KEY=your_jwt_secret_key_here
WEBHOOK_SECRET=your_webhook_secret_here
```

## Development Guide

### Architecture Benefits

1. **Unified Agent Identity**: Same agent handles all channels with consistent personality
2. **Context Sharing**: Customer interactions are shared across all channels
3. **Scalable**: Each vendor gets their own isolated agent instance
4. **Flexible**: Easy to add/remove channels per vendor needs
5. **Real-time**: Instant provisioning and message routing

### Key Features

- **Multi-Channel Support**: WhatsApp, Instagram, Twitter, Facebook, AWS Connect (voice/SMS)
- **ElizaOS Integration**: Complete agent management with character templates
- **AWS Services**: Connect, Lambda, DynamoDB integration
- **Context Management**: Cross-channel conversation history
- **Security**: JWT authentication and proper middleware
- **Monitoring**: Health checks and structured logging
- **Scalability**: Microservices architecture with Docker

### Service Access

- **Main API**: http://localhost:8008
- **Database**: localhost:5432
- **ElizaOS Manager**: http://localhost:3001
- **Connect Webhook**: http://localhost:8001

### Development Workflow

1. **Create Agent**: Use the API to create a new agent
2. **Configure Channels**: Set up desired communication channels
3. **Test Integration**: Verify webhook endpoints and message flow
4. **Monitor Performance**: Check logs and health endpoints
5. **Scale as Needed**: Add more agents or channels

## Support

For support and questions:
- Create an issue in the GitHub repository
- Contact the development team
- Check the API documentation at http://localhost:8008/docs

---

**Note**: This is Phase 2 of the Voca AI project. Phase 1 focused on the frontend interface, while Phase 2 builds the core engine for agent management and provisioning.

