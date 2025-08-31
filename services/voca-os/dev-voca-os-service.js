const express = require('express');
const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;
const VOCA_AI_ENGINE_URL = process.env.VOCA_AI_ENGINE_URL || 'http://voca-ai-engine:8008';

// Middleware
app.use(express.json());

// Store the single ElizaOS agent process and active vendor characters
let elizaAgentProcess = null;
const activeVendorCharacters = new Map(); // vendor_id -> character_config
const vendorMessageQueue = new Map(); // vendor_id -> message_queue

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'voca-os',
    timestamp: new Date().toISOString(),
    active_vendors: activeVendorCharacters.size,
    agent_status: elizaAgentProcess ? 'running' : 'stopped'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Voca OS Service - Single Agent with Dynamic Character Ingestion',
    version: '1.0.0',
    architecture: 'single-agent-dynamic-characters',
    endpoints: {
      'GET /health': 'Health check',
      'POST /api/v1/vendors': 'Register vendor character',
      'POST /api/v1/messages': 'Process message',
      'DELETE /api/v1/vendors/:vendor_id': 'Remove vendor character',
      'GET /api/v1/vendors/:vendor_id/status': 'Get vendor status'
    }
  });
});

// Initialize the single ElizaOS agent
async function initializeElizaAgent() {
  try {
    console.log('Initializing single ElizaOS agent...');
    
    // Use the default character as base
    const defaultCharacterPath = path.join(__dirname, 'characters', 'default.character.json');
    
    // Start ElizaOS agent process
    elizaAgentProcess = spawn('pnpm', ['start', '--character', defaultCharacterPath], {
      cwd: path.join(__dirname, 'agent'),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'production' }
    });
    
    // Handle process events
    elizaAgentProcess.on('error', (error) => {
      console.error('ElizaOS agent process error:', error);
      elizaAgentProcess = null;
    });
    
    elizaAgentProcess.on('exit', (code) => {
      console.log(`ElizaOS agent process exited with code ${code}`);
      elizaAgentProcess = null;
    });
    
    // Wait for agent to start
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('Single ElizaOS agent initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing ElizaOS agent:', error);
    return false;
  }
}

// Register vendor character endpoint
app.post('/api/v1/vendors', async (req, res) => {
  try {
    const { vendor_id, agent_config } = req.body;
    
    console.log(`Registering vendor character for: ${vendor_id}`);
    
    // Create dynamic character configuration
    const characterConfig = createDynamicCharacter(vendor_id, agent_config);
    
    // Store the character configuration
    activeVendorCharacters.set(vendor_id, characterConfig);
    
    // Save character config to dynamic directory
    const characterPath = path.join(__dirname, 'characters', 'dynamic', `${vendor_id}.json`);
    fs.writeFileSync(characterPath, JSON.stringify(characterConfig, null, 2));
    
    // Initialize ElizaOS agent if not already running
    if (!elizaAgentProcess) {
      const success = await initializeElizaAgent();
      if (!success) {
        return res.status(500).json({ error: 'Failed to initialize ElizaOS agent' });
      }
    }
    
    // Notify main engine about vendor registration
    try {
      await axios.post(`${VOCA_AI_ENGINE_URL}/api/v1/agents/${vendor_id}/status`, {
        service: 'voca-os',
        status: 'registered',
        agent_info: {
          vendor_id,
          status: 'active',
          config: agent_config,
          character_path: characterPath
        }
      });
    } catch (error) {
      console.error('Failed to notify main engine:', error.message);
    }
    
    res.json({
      success: true,
      vendor: {
        vendor_id,
        status: 'registered',
        config: agent_config,
        registered_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error registering vendor:', error);
    res.status(500).json({ error: 'Failed to register vendor', details: error.message });
  }
});

// Process message endpoint
app.post('/api/v1/messages', async (req, res) => {
  try {
    const { vendor_id, message, platform, user_id } = req.body;
    
    console.log(`Processing message for vendor: ${vendor_id} on ${platform}`);
    
    // Check if vendor is registered
    if (!activeVendorCharacters.has(vendor_id)) {
      return res.status(404).json({ error: 'Vendor not registered' });
    }
    
    // Check if ElizaOS agent is running
    if (!elizaAgentProcess) {
      return res.status(503).json({ error: 'ElizaOS agent not running' });
    }
    
    // Get vendor character configuration
    const characterConfig = activeVendorCharacters.get(vendor_id);
    
    // TODO: Implement actual message processing with ElizaOS
    // This would involve:
    // 1. Loading the vendor's character configuration dynamically
    // 2. Sending the message to the ElizaOS agent with the character context
    // 3. Receiving and processing the response
    
    const response = {
      vendor_id,
      platform,
      user_id,
      message: message,
      response: `Thank you for your message. I'm ${characterConfig.name}, your AI assistant for ${vendor_id} on ${platform}. How can I help you today?`,
      timestamp: new Date().toISOString(),
      character: characterConfig.name
    };
    
    // Notify main engine about message processing
    try {
      await axios.post(`${VOCA_AI_ENGINE_URL}/api/v1/messages/${vendor_id}/processed`, {
        service: 'voca-os',
        response
      });
    } catch (error) {
      console.error('Failed to notify main engine:', error.message);
    }
    
    res.json(response);
  } catch (error) {
    console.error('Error processing message:', error);
    res.status(500).json({ error: 'Failed to process message', details: error.message });
  }
});

// Remove vendor character endpoint
app.delete('/api/v1/vendors/:vendor_id', async (req, res) => {
  try {
    const { vendor_id } = req.params;
    
    console.log(`Removing vendor character: ${vendor_id}`);
    
    // Remove from active vendors
    activeVendorCharacters.delete(vendor_id);
    
    // Remove character file
    const characterPath = path.join(__dirname, 'characters', 'dynamic', `${vendor_id}.json`);
    try {
      fs.unlinkSync(characterPath);
    } catch (error) {
      console.error('Error deleting character file:', error);
    }
    
    // Notify main engine about vendor removal
    try {
      await axios.post(`${VOCA_AI_ENGINE_URL}/api/v1/agents/${vendor_id}/status`, {
        service: 'voca-os',
        status: 'removed',
        removed_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to notify main engine:', error.message);
    }
    
    res.json({ 
      success: true, 
      message: `Vendor ${vendor_id} character removed successfully` 
    });
  } catch (error) {
    console.error('Error removing vendor:', error);
    res.status(500).json({ error: 'Failed to remove vendor', details: error.message });
  }
});

// Get vendor status endpoint
app.get('/api/v1/vendors/:vendor_id/status', (req, res) => {
  const { vendor_id } = req.params;
  
  const characterConfig = activeVendorCharacters.get(vendor_id);
  if (!characterConfig) {
    return res.status(404).json({ error: 'Vendor not found' });
  }
  
  res.json({
    vendor_id,
    status: 'active',
    character: characterConfig.name,
    registered_at: new Date().toISOString(),
    agent_status: elizaAgentProcess ? 'running' : 'stopped'
  });
});

// Helper function to create dynamic character configuration
function createDynamicCharacter(vendorId, agentConfig) {
  const { profile, customerService, aiCapabilities } = agentConfig;
  
  return {
    name: profile.name,
    description: profile.bio || profile.description,
    personality: `You are ${profile.name}, a ${profile.role} for ${vendorId}. You help customers with their inquiries and provide excellent service.`,
    instructions: `You are an AI assistant for ${profile.name}. Your role is to help customers with their inquiries, provide product information, and assist with orders. Be helpful, friendly, and professional.`,
    example_conversations: [
      {
        input: "Hello, I need help with my order",
        output: `Hello! I'm ${profile.name}, your AI assistant. I'd be happy to help you with your order. Could you please provide your order number or tell me more about what you need assistance with?`
      },
      {
        input: "What products do you have?",
        output: "I'd be happy to help you find the perfect products! Could you tell me what you're looking for or what category interests you?"
      }
    ],
    capabilities: {
      order_tracking: aiCapabilities?.orderTracking || false,
      customer_inquiries: aiCapabilities?.customerInquiries || true,
      product_recommendations: aiCapabilities?.productRecommendations || false,
      delivery_updates: aiCapabilities?.deliveryUpdates || false,
      social_media_engagement: aiCapabilities?.socialMediaEngagement || true
    },
    languages: customerService?.languages || ['English'],
    response_time: customerService?.responseTime || 5,
    channels: customerService?.channels || {},
    plugins: [
      "@elizaos/plugin-bootstrap"
    ],
    clients: [],
    providers: {
      openai: {
        api_key: "${OPENAI_API_KEY}",
        model: "gpt-4"
      }
    },
    // Vendor-specific metadata
    vendor_id: vendorId,
    business_type: agentConfig.business_type || 'retail',
    created_at: new Date().toISOString()
  };
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  
  // Stop the ElizaOS agent process
  if (elizaAgentProcess) {
    console.log('Stopping ElizaOS agent...');
    elizaAgentProcess.kill('SIGTERM');
  }
  
  process.exit(0);
});

// Initialize the service
async function startService() {
  console.log('Starting Voca OS Service...');
  
  // Initialize the single ElizaOS agent
  await initializeElizaAgent();
  
  // Start the Express server
  app.listen(PORT, () => {
    console.log(`Voca OS service running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Main engine URL: ${VOCA_AI_ENGINE_URL}`);
    console.log(`Architecture: Single Agent with Dynamic Character Ingestion`);
  });
}

// Start the service
startService().catch(error => {
  console.error('Failed to start service:', error);
  process.exit(1);
});
