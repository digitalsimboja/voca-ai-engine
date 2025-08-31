# Voca OS Service

The Voca OS Service is a Node.js wrapper around ElizaOS that provides agent management capabilities for the Voca AI Engine. It implements a **single agent with dynamic character ingestion** architecture for efficient social media platform management.

## Architecture

```
Voca AI Engine
    ↓
Voca OS Service (Express.js)
    ↓
Single ElizaOS Agent Process
    ↓
Dynamic Character Loading (per vendor)
    ↓
Social Media Platforms (WhatsApp, Instagram, Facebook, etc.)
```

## Architecture Benefits

### **Single Agent Approach**
- **Resource Efficiency**: One ElizaOS process handles all vendors
- **Simplified Management**: Single process to monitor and maintain
- **Scalability**: Easy to scale horizontally if needed
- **Cost Effective**: Reduced memory and CPU usage

### **Dynamic Character Ingestion**
- **Real-time Updates**: Character configurations can be updated without restarting
- **Vendor Isolation**: Each vendor gets their own character configuration
- **Flexible Configuration**: Characters are generated dynamically based on vendor settings
- **Persistent Storage**: Character files are saved to disk for persistence

## Features

- **Single Agent Management**: One ElizaOS agent process handles all vendors
- **Dynamic Character Registration**: Vendors can register/remove their character configurations
- **Real-time Message Processing**: Route messages to appropriate vendor characters
- **Health Monitoring**: Track agent status and vendor registrations
- **Integration**: Communicate with the main Voca AI Engine

## API Endpoints

### Health Check
```
GET /health
```
Returns service health status, active vendor count, and agent status.

### Register Vendor Character
```
POST /api/v1/vendors
```
Registers a new vendor character with the single ElizaOS agent.

**Request Body:**
```json
{
  "vendor_id": "vendor-123",
  "agent_config": {
    "profile": {
      "name": "Vendor Name",
      "role": "sales_assistant",
      "bio": "AI assistant for Vendor Name"
    },
    "customerService": {
      "channels": {
        "whatsapp": true,
        "instagram_dm": true,
        "facebook_messenger": false
      },
      "languages": ["English", "Igbo", "Yoruba"],
      "responseTime": 5
    },
    "aiCapabilities": {
      "orderTracking": true,
      "customerInquiries": true,
      "productRecommendations": true
    }
  }
}
```

### Process Message
```
POST /api/v1/messages
```
Processes a message through the vendor's character configuration.

**Request Body:**
```json
{
  "vendor_id": "vendor-123",
  "message": "Hello, I need help with my order",
  "platform": "whatsapp",
  "user_id": "user-456"
}
```

### Remove Vendor Character
```
DELETE /api/v1/vendors/:vendor_id
```
Removes a vendor's character configuration.

### Get Vendor Status
```
GET /api/v1/vendors/:vendor_id/status
```
Returns the current status of a vendor's character registration.

## Dynamic Character Configuration

Each vendor gets a unique character configuration that includes:

- **Name and Description**: Based on vendor profile
- **Personality**: Generated from vendor settings and business type
- **Instructions**: Specific guidelines for the agent's behavior
- **Example Conversations**: Sample interactions for training
- **Capabilities**: Enabled features (order tracking, recommendations, etc.)
- **Languages**: Supported languages for communication
- **Channels**: Enabled social media platforms
- **Vendor Metadata**: Vendor ID, business type, creation timestamp

## File Structure

```
services/voca-os/
├── characters/
│   ├── default.character.json          # Base character template
│   └── dynamic/                        # Dynamic vendor characters
│       ├── vendor-123.json
│       ├── vendor-456.json
│       └── ...
├── voca-os-service.js                  # Main service file
├── package.json                        # Service dependencies
└── Dockerfile                          # Container configuration
```

## ElizaOS Integration

The service integrates with ElizaOS by:

1. **Single Process Management**: Running one ElizaOS agent process
2. **Dynamic Character Loading**: Loading vendor-specific character configurations
3. **Message Routing**: Directing messages to appropriate vendor contexts
4. **Configuration Management**: Managing character files and metadata

## Environment Variables

- `PORT`: Service port (default: 3001)
- `VOCA_AI_ENGINE_URL`: URL of the main Voca AI Engine
- `NODE_ENV`: Environment (development/production)
- `OPENAI_API_KEY`: OpenAI API key for the ElizaOS agent

## Development

### Prerequisites
- Node.js 18+
- pnpm

### Setup
1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Start the service:
   ```bash
   pnpm start
   ```

3. For development with auto-reload:
   ```bash
   pnpm dev
   ```

### Testing
```bash
pnpm test
```

## Docker

The service is containerized and can be run with Docker Compose as part of the Voca AI Engine stack.

### Build
```bash
docker build -f docker/Dockerfile.voca-os -t voca-os .
```

### Run
```bash
docker run -p 3001:3001 voca-os
```

## Monitoring

The service provides health checks and logging for monitoring:

- **Health Endpoint**: `/health` for service status
- **Vendor Status**: Track individual vendor character registrations
- **Agent Status**: Monitor the single ElizaOS agent process
- **Logging**: Structured logging for debugging and monitoring

## Security

- **Process Isolation**: Single ElizaOS process with vendor character isolation
- **Resource Limits**: Efficient resource usage with single agent
- **Graceful Shutdown**: Proper cleanup on service termination
- **Error Handling**: Comprehensive error handling and recovery

## Future Enhancements

- **Character Hot-Reloading**: Update character configurations without restart
- **Message Queuing**: Implement message queuing for better reliability
- **Advanced Monitoring**: Metrics collection and alerting
- **Plugin System**: Extensible architecture for additional capabilities
- **Multi-Agent Scaling**: Support for multiple ElizaOS agents if needed
