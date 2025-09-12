import path from 'path';
import fs from 'fs';
import { createDynamicCharacter } from '../utils/character-utils.js';
import { VocaClient } from './voca-client.js';

/**
 * AgentPool class manages a single pool of vendors using ElizaOS runtime
 * Each pool can handle up to maxVendors vendors
 */
class AgentPool {
  constructor(poolId, maxVendors = 5000) {
    this.poolId = poolId;
    this.maxVendors = maxVendors;
    this.activeVendors = new Map();
    this.isInitialized = false;
    this.vocaClient = new VocaClient();
    this.characterCache = new Map();
    this.metrics = {
      messageCount: 0,
      responseTime: 0,
      errorCount: 0,
      vendorCount: 0,
      characterSwitches: 0
    };
  }

  /**
   * Initialize the agent pool by connecting to ElizaOS runtime
   */
  async initialize() {
    try {
      console.log(`Initializing Agent Pool ${this.poolId}...`);
      
      // Initialize VocaClient connection to ElizaOS runtime
      const success = await this.vocaClient.connect();
      
      if (success) {
        this.isInitialized = true;
        console.log(`Agent Pool ${this.poolId} initialized successfully with ElizaOS runtime`);
        return true;
      } else {
        console.error(`Failed to initialize Pool ${this.poolId} with ElizaOS runtime`);
        return false;
      }
    } catch (error) {
      console.error(`Error initializing Pool ${this.poolId}:`, error);
      return false;
    }
  }

  /**
   * Register a vendor in this pool
   * @param {string} vendorId - The vendor identifier
   * @param {Object} agentConfig - The agent configuration
   * @returns {Object} Registration result
   */
  async registerVendor(vendorId, agentConfig) {
    if (this.activeVendors.size >= this.maxVendors) {
      throw new Error(`Pool ${this.poolId} is at maximum capacity (${this.maxVendors} vendors)`);
    }

    console.log(`Registering vendor ${vendorId} in Pool ${this.poolId}`);
    
    // Create dynamic character configuration using the utility function
    const characterConfig = createDynamicCharacter(vendorId, agentConfig);
    
    // Store the character configuration
    this.activeVendors.set(vendorId, characterConfig);
    
    // Cache character in VocaClient
    this.characterCache.set(vendorId, characterConfig);
    const vocaClientResult = await this.vocaClient.loadCharacter(vendorId, agentConfig);
    
    // Save character config to dynamic directory
    const dynamicDir = path.join(process.cwd(), 'characters', 'dynamic');
    if (!fs.existsSync(dynamicDir)) {
      fs.mkdirSync(dynamicDir, { recursive: true });
    }
    
    const characterPath = path.join(dynamicDir, `${vendorId}.json`);
    fs.writeFileSync(characterPath, JSON.stringify(characterConfig, null, 2));
    
    this.metrics.vendorCount = this.activeVendors.size;
    
    return {
      poolId: this.poolId,
      vendorId,
      agent_id: vocaClientResult?.agent_id || null,  // ElizaOS-generated agent ID
      status: 'registered',
      config: agentConfig,
      character_path: characterPath,
      registered_at: new Date().toISOString()
    };
  }

  /**
   * Process a message for a vendor in this pool
   * @param {string} vendorId - The vendor identifier
   * @param {string} message - The message content
   * @param {string} platform - The platform (whatsapp, instagram, etc.)
   * @param {string} userId - The user identifier
   * @returns {Object} Response object
   */
  async processMessage(vendorId, message, platform, userId) {
    if (!this.activeVendors.has(vendorId)) {
      throw new Error(`Vendor ${vendorId} not registered in Pool ${this.poolId}`);
    }

    const startTime = Date.now();
    
    try {
      console.log(`Processing message for vendor ${vendorId} in Pool ${this.poolId} on ${platform}`);
      
      // Get vendor character configuration
      const characterConfig = this.activeVendors.get(vendorId);
      
      // Create message context for ElizaClient
      const messageContext = {
        character: vendorId, // Use vendorId as character name
        message: message,
        platform: platform,
        userId: userId,
        vendorId: vendorId,
        characterConfig: characterConfig
      };
      
      // Process message through VocaClient (handles character switching automatically)
      const vocaResponse = await this.vocaClient.processMessage(messageContext);
      
      // Format response for API
      const response = {
        poolId: this.poolId,
        vendor_id: vendorId,
        platform,
        user_id: userId,
        message: message,
        response: vocaResponse.response,
        timestamp: vocaResponse.timestamp,
        character: characterConfig.name,
        mode: vocaResponse.mode,
        processing_time: Date.now() - startTime,
        voca_status: this.vocaClient.getStatus()
      };
      
      // Update metrics
      this.metrics.messageCount++;
      this.metrics.responseTime = (this.metrics.responseTime + response.processing_time) / 2;
      
      // Track character switches
      if (vocaResponse.mode === 'voca_response') {
        this.metrics.characterSwitches++;
      }
      
      return response;
    } catch (error) {
      this.metrics.errorCount++;
      console.error(`Error processing message for vendor ${vendorId}:`, error);
      
      // Fallback to mock response on error
      const characterConfig = this.activeVendors.get(vendorId);
      const fallbackResponse = {
        poolId: this.poolId,
        vendor_id: vendorId,
        platform,
        user_id: userId,
        message: message,
        response: `I'm sorry, I'm having trouble processing your message right now. I'm ${characterConfig.name}, your AI assistant. Please try again in a moment.`,
        timestamp: new Date().toISOString(),
        character: characterConfig.name,
        mode: 'error_fallback',
        processing_time: Date.now() - startTime,
        error: error.message
      };
      
      return fallbackResponse;
    }
  }

  /**
   * Get pool metrics
   * @returns {Object} Pool metrics
   */
  getMetrics() {
    return {
      poolId: this.poolId,
      isInitialized: this.isInitialized,
      vendorCount: this.activeVendors.size,
      maxVendors: this.maxVendors,
      vocaClient: this.vocaClient.getStatus(),
      ...this.metrics
    };
  }

  /**
   * Shutdown the agent pool
   */
  async shutdown() {
    console.log(`Shutting down Pool ${this.poolId}...`);
    
    // Disconnect VocaClient
    await this.vocaClient.disconnect();
    
    this.isInitialized = false;
    this.activeVendors.clear();
    this.characterCache.clear();
  }
}

export { AgentPool };
