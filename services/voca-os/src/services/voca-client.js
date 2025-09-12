import { RuntimeManager } from '../core/runtime-manager.js';

/**
 * VocaClient - Direct integration with ElizaOS runtime for multi-vendor support
 * Handles character loading, message processing, and agent management
 */
class VocaClient {
  constructor() {
    this.runtimeManager = new RuntimeManager();
    this.isInitialized = false;
    this.currentCharacter = null;
    this.characterCache = new Map();
    this.messageQueue = [];
  }

  /**
   * Initialize the VocaClient with ElizaOS runtime
   */
  async connect() {
    try {
      // Initialize the runtime manager
      const success = await this.runtimeManager.initialize();
      this.isInitialized = success;
      
      if (success) {
        console.log('VocaClient connected to ElizaOS runtime');
      } else {
        console.log('Failed to initialize ElizaOS runtime, will use mock responses');
      }
      
      return success;
    } catch (error) {
      console.error('Error connecting VocaClient to ElizaOS runtime:', error);
      this.isInitialized = false;
      return false;
    }
  }

  /**
   * Register a vendor with the runtime manager
   * @param {string} vendorId - The vendor identifier
   * @param {Object} agentConfig - The agent configuration
   */
  async loadCharacter(vendorId, agentConfig) {
    if (!this.isInitialized) {
      console.log(`VocaClient not initialized, caching vendor ${vendorId}`);
      this.characterCache.set(vendorId, agentConfig);
      return false;
    }

    try {
      // Register vendor with runtime manager
      const result = await this.runtimeManager.registerVendor(vendorId, agentConfig);
      
      this.currentCharacter = vendorId;
      this.characterCache.set(vendorId, agentConfig);
      
      console.log(`Registered vendor ${vendorId} with ElizaOS runtime`);
      return result;  // Return the result with agent_id
    } catch (error) {
      console.error(`Failed to register vendor ${vendorId}:`, error.message);
      
      // Fallback: cache character for later use
      this.characterCache.set(vendorId, agentConfig);
      return { success: false, error: error.message };
    }
  }

  /**
   * Process a message with the appropriate vendor runtime
   * @param {Object} messageContext - Message context including character, message, etc.
   */
  async processMessage(messageContext) {
    const { character, message, platform, userId, vendorId } = messageContext;

    if (!this.isInitialized) {
      return this.getMockResponse(messageContext);
    }

    try {
      // Use vendorId as the primary identifier
      const targetVendor = vendorId || character;
      
      // Get agent config from cache if available
      const agentConfig = this.characterCache.get(targetVendor);
      
      // Process message through runtime manager
      const response = await this.runtimeManager.processMessage(
        targetVendor,
        message,
        platform,
        userId,
        agentConfig
      );

      return {
        success: response.success,
        response: response.response,
        character: character,
        platform: platform,
        userId: userId,
        vendorId: vendorId,
        timestamp: response.timestamp,
        mode: response.mode || 'elizaos_runtime'
      };
    } catch (error) {
      console.error(`Failed to process message with ElizaOS runtime:`, error.message);
      return this.getMockResponse(messageContext);
    }
  }

  /**
   * Get mock response when Voca AI is not available
   * @param {Object} messageContext - Message context
   */
  getMockResponse(messageContext) {
    const { character, message, platform, userId, vendorId } = messageContext;
    const characterConfig = this.characterCache.get(character);

    let response = '';
    
    if (characterConfig && characterConfig.messageExamples) {
      // Try to match against example conversations
      const lowerMessage = message.toLowerCase();
      const messageExamples = characterConfig.messageExamples || [];
      
      for (const example of messageExamples) {
        if (example.length >= 2 && example[0].content && example[1].content) {
          const exampleInput = example[0].content.text.toLowerCase();
          if (lowerMessage.includes(exampleInput.split(' ').slice(0, 3).join(' '))) {
            response = example[1].content.text;
            break;
          }
        }
      }
    }
    
    // Fallback to generic response
    if (!response) {
      const bio = characterConfig?.bio?.[0] || `I am ${character}`;
      response = `Hello! ${bio}. How can I help you today?`;
    }

    return {
      success: true,
      response: response,
      character: character,
      platform: platform,
      userId: userId,
      vendorId: vendorId,
      timestamp: new Date().toISOString(),
      mode: 'mock_response'
    };
  }

  /**
   * Get character status
   */
  getCharacterStatus(characterName) {
    return {
      isLoaded: this.currentCharacter === characterName,
      isCached: this.characterCache.has(characterName),
      isConnected: this.isConnected
    };
  }

  /**
   * Preload popular characters for better performance
   */
  async preloadCharacters(characterConfigs) {
    console.log(`Preloading ${characterConfigs.length} characters...`);
    
    for (const [characterName, characterConfig] of characterConfigs) {
      this.characterCache.set(characterName, characterConfig);
      
      if (this.isConnected) {
        try {
          await this.loadCharacter(characterName, characterConfig);
          // Small delay to prevent overwhelming the agent
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Failed to preload character ${characterName}:`, error.message);
        }
      }
    }
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      currentCharacter: this.currentCharacter,
      cachedCharacters: Array.from(this.characterCache.keys()),
      runtimeMetrics: this.runtimeManager.getAllMetrics()
    };
  }

  /**
   * Disconnect from ElizaOS runtime
   */
  async disconnect() {
    if (this.isInitialized) {
      await this.runtimeManager.shutdown();
    }
    this.isInitialized = false;
    this.currentCharacter = null;
    console.log('Disconnected from ElizaOS runtime');
  }
}

export { VocaClient };
