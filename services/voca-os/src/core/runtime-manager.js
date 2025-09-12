import { EmbeddedElizaOSManager } from './embedded-elizaos-manager.js';

/**
 * RuntimeManager - Wrapper for Embedded ElizaOS Manager
 * Uses embedded ElizaOS approach (Option 2 - Monolith)
 * Each vendor gets their own agent within the same process
 */
class RuntimeManager {
  constructor() {
    this.elizaosManager = new EmbeddedElizaOSManager();
    this.isInitialized = false;
  }

  /**
   * Initialize the embedded ElizaOS system
   */
  async initialize() {
    try {
      console.log('Initializing Runtime Manager with Embedded ElizaOS...');
      
      const success = await this.elizaosManager.initialize();
      this.isInitialized = success;
      
      if (success) {
        console.log('Runtime Manager initialized successfully with Embedded ElizaOS');
      } else {
        console.error('Failed to initialize Runtime Manager with Embedded ElizaOS');
      }
      
      return success;
    } catch (error) {
      console.error('Error initializing Runtime Manager:', error);
      return false;
    }
  }

  /**
   * Create a dedicated runtime for a specific vendor
   * @param {string} vendorId - The vendor identifier
   * @param {Object} agentConfig - The agent configuration
   */
  async createVendorRuntime(vendorId, agentConfig) {
    try {
      console.log(`Creating dedicated embedded ElizaOS agent for vendor: ${vendorId}`);
      
      const result = await this.elizaosManager.createVendorAgent(vendorId, agentConfig);
      
      console.log(`Dedicated embedded ElizaOS agent created for vendor ${vendorId}: ${result.agentId}`);
      return result.agent;
    } catch (error) {
      console.error(`Error creating embedded agent for vendor ${vendorId}:`, error);
      throw error;
    }
  }

  /**
   * Get or create a runtime for a vendor
   * @param {string} vendorId - The vendor identifier
   * @param {Object} agentConfig - The agent configuration (optional)
   */
  async getRuntimeForVendor(vendorId, agentConfig = null) {
    // Check if vendor already has an agent
    const existingAgent = this.elizaosManager.agents.get(vendorId);
    if (existingAgent) {
      return existingAgent;
    }

    // If agentConfig provided, create dedicated agent
    if (agentConfig) {
      return await this.createVendorRuntime(vendorId, agentConfig);
    }

    // Otherwise, use default agent
    return this.elizaosManager.agents.get('default');
  }

  /**
   * Process a message for a vendor using the appropriate agent
   * @param {string} vendorId - The vendor identifier
   * @param {string} message - The message content
   * @param {string} platform - The platform (whatsapp, instagram, etc.)
   * @param {string} userId - The user identifier
   * @param {Object} agentConfig - The agent configuration (optional)
   */
  async processMessage(vendorId, message, platform, userId, agentConfig = null) {
    try {
      console.log(`Processing message for vendor ${vendorId} on ${platform}`);
      
      // Get or create agent for this vendor
      const agent = await this.getRuntimeForVendor(vendorId, agentConfig);
      
      if (!agent) {
        throw new Error(`No agent available for vendor ${vendorId}`);
      }

      // Process message through embedded ElizaOS
      const response = await this.elizaosManager.processMessage(vendorId, message, platform, userId);
      
      return response;
    } catch (error) {
      console.error(`Error processing message for vendor ${vendorId}:`, error);
      throw error;
    }
  }

  /**
   * Register a vendor with an embedded agent
   * @param {string} vendorId - The vendor identifier
   * @param {Object} agentConfig - The agent configuration
   */
  async registerVendor(vendorId, agentConfig) {
    try {
      console.log(`Registering vendor ${vendorId} with embedded ElizaOS agent`);
      
      const result = await this.elizaosManager.registerVendor(vendorId, agentConfig);
      
      return result;
    } catch (error) {
      console.error(`Error registering vendor ${vendorId}:`, error);
      throw error;
    }
  }

  /**
   * Unregister a vendor and clean up its agent
   * @param {string} vendorId - The vendor identifier
   */
  async unregisterVendor(vendorId) {
    try {
      console.log(`Unregistering vendor ${vendorId} from embedded ElizaOS`);
      
      const agent = this.elizaosManager.agents.get(vendorId);
      if (agent) {
        await agent.shutdown();
        this.elizaosManager.agents.delete(vendorId);
        this.elizaosManager.characters.delete(vendorId);
        this.elizaosManager.metrics.totalAgents--;
        
        console.log(`Vendor ${vendorId} unregistered successfully`);
        return true;
      } else {
        console.log(`No agent found for vendor ${vendorId}`);
        return false;
      }
    } catch (error) {
      console.error(`Error unregistering vendor ${vendorId}:`, error);
      throw error;
    }
  }

  /**
   * Shutdown all agents
   */
  async shutdown() {
    try {
      console.log('Shutting down Runtime Manager with Embedded ElizaOS...');
      
      await this.elizaosManager.shutdown();
      this.isInitialized = false;
      
      console.log('Runtime Manager shutdown complete');
    } catch (error) {
      console.error('Error shutting down Runtime Manager:', error);
      throw error;
    }
  }

  /**
   * Get runtime status and metrics
   */
  getStatus() {
    return this.elizaosManager.getStatus();
  }

  /**
   * Get status of a specific agent
   */
  getAgentStatus(vendorId) {
    return this.elizaosManager.getAgentStatus(vendorId);
  }

  /**
   * Get all agents status
   */
  getAllAgentsStatus() {
    return this.elizaosManager.getAllAgentsStatus();
  }

  /**
   * Log fetch requests (for debugging)
   */
  logFetch = async (url, options) => {
    console.log(`[RuntimeManager] Fetching ${url}`);
    return fetch(url, options);
  };
}

export { RuntimeManager };