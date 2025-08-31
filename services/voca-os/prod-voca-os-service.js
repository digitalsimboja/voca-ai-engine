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

// Scalable Architecture Components
class AgentPool {
  constructor(poolId, maxVendors = 5000) {
    this.poolId = poolId;
    this.maxVendors = maxVendors;
    this.activeVendors = new Map();
    this.elizaAgentProcess = null;
    this.isInitialized = false;
    this.metrics = {
      messageCount: 0,
      responseTime: 0,
      errorCount: 0,
      vendorCount: 0
    };
  }

  async initialize() {
    try {
      console.log(`Initializing Agent Pool ${this.poolId}...`);
      
      // Start ElizaOS agent process for this pool
      const defaultCharacterPath = path.join(__dirname, 'characters', 'default.character.json');
      
      this.elizaAgentProcess = spawn('pnpm', ['start', '--character', defaultCharacterPath], {
        cwd: path.join(__dirname, 'agent'),
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'production', POOL_ID: this.poolId }
      });
      
      // Handle process events
      this.elizaAgentProcess.on('error', (error) => {
        console.error(`Pool ${this.poolId} ElizaOS agent process error:`, error);
        this.elizaAgentProcess = null;
        this.isInitialized = false;
      });
      
      this.elizaAgentProcess.on('exit', (code) => {
        console.log(`Pool ${this.poolId} ElizaOS agent process exited with code ${code}`);
        this.elizaAgentProcess = null;
        this.isInitialized = false;
      });
      
      // Wait for agent to start
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      this.isInitialized = true;
      console.log(`Agent Pool ${this.poolId} initialized successfully`);
      return true;
    } catch (error) {
      console.error(`Error initializing Pool ${this.poolId}:`, error);
      return false;
    }
  }

  async registerVendor(vendorId, agentConfig) {
    if (this.activeVendors.size >= this.maxVendors) {
      throw new Error(`Pool ${this.poolId} is at maximum capacity (${this.maxVendors} vendors)`);
    }

    console.log(`Registering vendor ${vendorId} in Pool ${this.poolId}`);
    
    // Create dynamic character configuration
    const characterConfig = this.createDynamicCharacter(vendorId, agentConfig);
    
    // Store the character configuration
    this.activeVendors.set(vendorId, characterConfig);
    
    // Save character config to dynamic directory
    const characterPath = path.join(__dirname, 'characters', 'dynamic', `${vendorId}.json`);
    fs.writeFileSync(characterPath, JSON.stringify(characterConfig, null, 2));
    
    this.metrics.vendorCount = this.activeVendors.size;
    
    return {
      poolId: this.poolId,
      vendorId,
      status: 'registered',
      config: agentConfig,
      registered_at: new Date().toISOString()
    };
  }

  async processMessage(vendorId, message, platform, userId) {
    if (!this.activeVendors.has(vendorId)) {
      throw new Error(`Vendor ${vendorId} not registered in Pool ${this.poolId}`);
    }

    if (!this.isInitialized || !this.elizaAgentProcess) {
      throw new Error(`Pool ${this.poolId} ElizaOS agent not running`);
    }

    const startTime = Date.now();
    
    try {
      console.log(`Processing message for vendor ${vendorId} in Pool ${this.poolId} on ${platform}`);
      
      // Get vendor character configuration
      const characterConfig = this.activeVendors.get(vendorId);
      
      // TODO: Implement actual message processing with ElizaOS
      // This would involve:
      // 1. Loading the vendor's character configuration dynamically
      // 2. Sending the message to the ElizaOS agent with the character context
      // 3. Receiving and processing the response
      
      const response = {
        poolId: this.poolId,
        vendor_id: vendorId,
        platform,
        user_id: userId,
        message: message,
        response: `Thank you for your message. I'm ${characterConfig.name}, your AI assistant for ${vendorId} on ${platform}. How can I help you today?`,
        timestamp: new Date().toISOString(),
        character: characterConfig.name,
        processing_time: Date.now() - startTime
      };
      
      // Update metrics
      this.metrics.messageCount++;
      this.metrics.responseTime = (this.metrics.responseTime + response.processing_time) / 2;
      
      return response;
    } catch (error) {
      this.metrics.errorCount++;
      throw error;
    }
  }

  createDynamicCharacter(vendorId, agentConfig) {
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
      pool_id: this.poolId,
      business_type: agentConfig.business_type || 'retail',
      created_at: new Date().toISOString()
    };
  }

  getMetrics() {
    return {
      poolId: this.poolId,
      isInitialized: this.isInitialized,
      vendorCount: this.activeVendors.size,
      maxVendors: this.maxVendors,
      ...this.metrics
    };
  }

  async shutdown() {
    console.log(`Shutting down Pool ${this.poolId}...`);
    
    if (this.elizaAgentProcess) {
      this.elizaAgentProcess.kill('SIGTERM');
    }
    
    this.isInitialized = false;
    this.activeVendors.clear();
  }
}

class AgentPoolManager {
  constructor() {
    this.pools = new Map();
    this.vendorPoolMap = new Map();
    this.nextPoolId = 1;
    this.maxVendorsPerPool = parseInt(process.env.MAX_VENDORS_PER_POOL) || 5000;
  }

  async createPool(poolId = null) {
    const actualPoolId = poolId || `pool-${this.nextPoolId++}`;
    const pool = new AgentPool(actualPoolId, this.maxVendorsPerPool);
    
    const success = await pool.initialize();
    if (success) {
      this.pools.set(actualPoolId, pool);
      console.log(`Created Agent Pool ${actualPoolId}`);
    }
    
    return pool;
  }

  async findAvailablePool() {
    // Find a pool with available capacity
    for (const [poolId, pool] of this.pools) {
      if (pool.activeVendors.size < pool.maxVendors) {
        return pool;
      }
    }
    
    // If no pool available, create a new one
    console.log('No available pools, creating new pool...');
    return await this.createPool();
  }

  async assignVendor(vendorId, vendorConfig) {
    const pool = await this.findAvailablePool();
    const result = await pool.registerVendor(vendorId, vendorConfig);
    this.vendorPoolMap.set(vendorId, pool.poolId);
    return result;
  }

  async routeMessage(vendorId, message, platform, userId) {
    const poolId = this.vendorPoolMap.get(vendorId);
    if (!poolId) {
      throw new Error(`Vendor ${vendorId} not assigned to any pool`);
    }
    
    const pool = this.pools.get(poolId);
    if (!pool) {
      throw new Error(`Pool ${poolId} not found`);
    }
    
    return await pool.processMessage(vendorId, message, platform, userId);
  }

  async removeVendor(vendorId) {
    const poolId = this.vendorPoolMap.get(vendorId);
    if (!poolId) {
      throw new Error(`Vendor ${vendorId} not found`);
    }
    
    const pool = this.pools.get(poolId);
    if (!pool) {
      throw new Error(`Pool ${poolId} not found`);
    }
    
    // Remove from pool
    pool.activeVendors.delete(vendorId);
    pool.metrics.vendorCount = pool.activeVendors.size;
    
    // Remove from mapping
    this.vendorPoolMap.delete(vendorId);
    
    // Remove character file
    const characterPath = path.join(__dirname, 'characters', 'dynamic', `${vendorId}.json`);
    try {
      fs.unlinkSync(characterPath);
    } catch (error) {
      console.error('Error deleting character file:', error);
    }
    
    return { success: true, message: `Vendor ${vendorId} removed from Pool ${poolId}` };
  }

  getVendorStatus(vendorId) {
    const poolId = this.vendorPoolMap.get(vendorId);
    if (!poolId) {
      return null;
    }
    
    const pool = this.pools.get(poolId);
    if (!pool) {
      return null;
    }
    
    const characterConfig = pool.activeVendors.get(vendorId);
    if (!characterConfig) {
      return null;
    }
    
    return {
      vendor_id: vendorId,
      pool_id: poolId,
      status: 'active',
      character: characterConfig.name,
      registered_at: characterConfig.created_at,
      agent_status: pool.isInitialized ? 'running' : 'stopped'
    };
  }

  getAllMetrics() {
    const metrics = {
      totalPools: this.pools.size,
      totalVendors: this.vendorPoolMap.size,
      pools: []
    };
    
    for (const [poolId, pool] of this.pools) {
      metrics.pools.push(pool.getMetrics());
    }
    
    return metrics;
  }
}

// Initialize the pool manager
const poolManager = new AgentPoolManager();

// Health check endpoint
app.get('/health', (req, res) => {
  const metrics = poolManager.getAllMetrics();
  res.json({ 
    status: 'healthy', 
    service: 'voca-os-scalable',
    timestamp: new Date().toISOString(),
    ...metrics
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Voca OS Service - Scalable Multi-Pool Architecture',
    version: '2.0.0',
    architecture: 'multi-pool-scalable',
    endpoints: {
      'GET /health': 'Health check with pool metrics',
      'POST /api/v1/vendors': 'Register vendor character',
      'POST /api/v1/messages': 'Process message',
      'DELETE /api/v1/vendors/:vendor_id': 'Remove vendor character',
      'GET /api/v1/vendors/:vendor_id/status': 'Get vendor status',
      'GET /api/v1/pools': 'Get all pool metrics',
      'POST /api/v1/pools': 'Create new agent pool'
    }
  });
});

// Register vendor character endpoint
app.post('/api/v1/vendors', async (req, res) => {
  try {
    const { vendor_id, agent_config } = req.body;
    
    console.log(`Registering vendor character for: ${vendor_id}`);
    
    const result = await poolManager.assignVendor(vendor_id, agent_config);
    
    // Notify main engine about vendor registration
    try {
      await axios.post(`${VOCA_AI_ENGINE_URL}/api/v1/agents/${vendor_id}/status`, {
        service: 'voca-os-scalable',
        status: 'registered',
        agent_info: {
          vendor_id,
          pool_id: result.poolId,
          status: 'active',
          config: agent_config
        }
      });
    } catch (error) {
      console.error('Failed to notify main engine:', error.message);
    }
    
    res.json({
      success: true,
      vendor: result
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
    
    const response = await poolManager.routeMessage(vendor_id, message, platform, user_id);
    
    // Notify main engine about message processing
    try {
      await axios.post(`${VOCA_AI_ENGINE_URL}/api/v1/messages/${vendor_id}/processed`, {
        service: 'voca-os-scalable',
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
    
    const result = await poolManager.removeVendor(vendor_id);
    
    // Notify main engine about vendor removal
    try {
      await axios.post(`${VOCA_AI_ENGINE_URL}/api/v1/agents/${vendor_id}/status`, {
        service: 'voca-os-scalable',
        status: 'removed',
        removed_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to notify main engine:', error.message);
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error removing vendor:', error);
    res.status(500).json({ error: 'Failed to remove vendor', details: error.message });
  }
});

// Get vendor status endpoint
app.get('/api/v1/vendors/:vendor_id/status', (req, res) => {
  const { vendor_id } = req.params;
  
  const status = poolManager.getVendorStatus(vendor_id);
  if (!status) {
    return res.status(404).json({ error: 'Vendor not found' });
  }
  
  res.json(status);
});

// Get all pool metrics endpoint
app.get('/api/v1/pools', (req, res) => {
  const metrics = poolManager.getAllMetrics();
  res.json(metrics);
});

// Create new agent pool endpoint
app.post('/api/v1/pools', async (req, res) => {
  try {
    const { pool_id } = req.body;
    const pool = await poolManager.createPool(pool_id);
    
    res.json({
      success: true,
      pool: {
        poolId: pool.poolId,
        maxVendors: pool.maxVendors,
        vendorCount: pool.activeVendors.size,
        isInitialized: pool.isInitialized
      }
    });
  } catch (error) {
    console.error('Error creating pool:', error);
    res.status(500).json({ error: 'Failed to create pool', details: error.message });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  
  // Shutdown all pools
  for (const [poolId, pool] of poolManager.pools) {
    await pool.shutdown();
  }
  
  process.exit(0);
});

// Initialize the service
async function startService() {
  console.log('Starting Scalable Voca OS Service...');
  
  // Create initial pool
  await poolManager.createPool('pool-1');
  
  // Start the Express server
  app.listen(PORT, () => {
    console.log(`Scalable Voca OS service running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Main engine URL: ${VOCA_AI_ENGINE_URL}`);
    console.log(`Architecture: Multi-Pool Scalable`);
    console.log(`Max vendors per pool: ${poolManager.maxVendorsPerPool}`);
  });
}

// Start the service
startService().catch(error => {
  console.error('Failed to start service:', error);
  process.exit(1);
});
