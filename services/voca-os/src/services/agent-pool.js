import path from 'path';
import fs from 'fs';
import { EmbeddedElizaOSManager } from '../core/runtime-manager.js';

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
    this.elizaosManager = new EmbeddedElizaOSManager();
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
      
      // EmbeddedElizaOSManager is always initialized when created
      this.isInitialized = true;
      console.log(`Agent Pool ${this.poolId} initialized successfully with ElizaOS runtime`);
      return true;
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
    
    // Register vendor with EmbeddedElizaOSManager (handles character creation internally)
    const elizaosResult = await this.elizaosManager.registerVendor(vendorId, agentConfig);
    
    // Store vendor reference in pool
    this.activeVendors.set(vendorId, {
      vendorId,
      agentConfig,
      agentId: elizaosResult.agent_id,
      registeredAt: new Date().toISOString()
    });
    
    // Character config is now written to disk in runtime-manager.js
    // Just verify it exists in the characters map
    const characterConfig = this.elizaosManager.characters.get(vendorId);
    const characterPath = path.join(process.cwd(), 'characters', 'dynamic', `${vendorId}.json`);
    
    console.log(`🔍 Debug: Character config for ${vendorId}:`, {
      hasCharacter: !!characterConfig,
      characterName: characterConfig?.name,
      hasSystem: !!characterConfig?.system,
      hasConfiguration: !!characterConfig?.configuration,
      hasDatabase: !!characterConfig?.settings?.database,
      fileExists: fs.existsSync(characterPath)
    });
    
    this.metrics.vendorCount = this.activeVendors.size;
    
    return {
      poolId: this.poolId,
      vendorId,
      agent_id: elizaosResult.agent_id,
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
      
      // Process message through EmbeddedElizaOSManager
      const elizaosResponse = await this.elizaosManager.processMessage(vendorId, message, platform, userId);
      
      // Get character config for response formatting
      const characterConfig = this.elizaosManager.characters.get(vendorId);
      
      // Format response for API
      const response = {
        poolId: this.poolId,
        vendor_id: vendorId,
        platform,
        user_id: userId,
        message: message,
        response: elizaosResponse.response,
        timestamp: elizaosResponse.timestamp,
        character: characterConfig?.name || vendorId,
        mode: elizaosResponse.mode,
        processing_time: elizaosResponse.processing_time || (Date.now() - startTime),
        elizaos_status: this.elizaosManager.getStatus()
      };
      
      // Update metrics
      this.metrics.messageCount++;
      this.metrics.responseTime = (this.metrics.responseTime + response.processing_time) / 2;
      
      // Track character switches
      if (elizaosResponse.mode === 'embedded_elizaos') {
        this.metrics.characterSwitches++;
      }
      
      return response;
    } catch (error) {
      this.metrics.errorCount++;
      console.error(`Error processing message for vendor ${vendorId}:`, error);
      
      // Fallback to mock response on error
      const characterConfig = this.elizaosManager.characters.get(vendorId);
      const fallbackResponse = {
        poolId: this.poolId,
        vendor_id: vendorId,
        platform,
        user_id: userId,
        message: message,
        response: `I'm sorry, I'm having trouble processing your message right now. I'm ${characterConfig?.name || vendorId}, your AI assistant. Please try again in a moment.`,
        timestamp: new Date().toISOString(),
        character: characterConfig?.name || vendorId,
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
      elizaosManager: this.elizaosManager.getStatus(),
      ...this.metrics
    };
  }

  /**
   * Shutdown the agent pool
   */
  async shutdown() {
    console.log(`Shutting down Pool ${this.poolId}...`);
    
    // Shutdown EmbeddedElizaOSManager
    await this.elizaosManager.shutdown();
    
    this.isInitialized = false;
    this.activeVendors.clear();
  }
}

export { AgentPool };
