/**
 * Embedded ElizaOS Manager
 * Implements ElizaOS as an embedded service within voca-os (Option 2 - Monolith)
 * 
 * This approach:
 * - Embeds ElizaOS runtime directly in voca-os
 * - Creates multiple agents for different vendors
 * - Uses shared resources and memory
 * - Single container deployment
 */

import { AgentRuntime, ModelType } from '@elizaos/core';
import bootstrapPlugin from '@elizaos/plugin-bootstrap';
import sqlPlugin from '@elizaos/plugin-sql';
import openaiPlugin from '@elizaos/plugin-openai';
import { createDynamicCharacter } from './character-utils.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Embedded ElizaOS Manager for Multi-Agent Support
 * Each vendor gets their own agent within the same process
 */
class EmbeddedElizaOSManager {
  constructor() {
    this.agents = new Map(); // vendorId -> AgentRuntime
    this.characters = new Map(); // vendorId -> Character
    this.isInitialized = false;
    this.metrics = {
      totalAgents: 0,
      messageCount: 0,
      averageResponseTime: 0,
      errorCount: 0
    };
  }

  /**
   * Initialize the embedded ElizaOS system
   */
  async initialize() {
    try {
      console.log('🚀 Initializing Embedded ElizaOS Manager...');
      
      // Create default agent
      await this.createDefaultAgent();
      
      this.isInitialized = true;
      console.log('✅ Embedded ElizaOS Manager initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Error initializing Embedded ElizaOS Manager:', error);
      return false;
    }
  }

  /**
   * Create default agent for general use
   */
  async createDefaultAgent() {
    try {
      const defaultCharacterPath = path.join(__dirname, '..', 'characters', 'default.character.json');
      const defaultCharacter = JSON.parse(fs.readFileSync(defaultCharacterPath, 'utf8'));
      
      console.log('🤖 Creating default embedded ElizaOS agent...');
      
      const agent = await this.createAgent('default', defaultCharacter);
      
      this.agents.set('default', agent);
      this.characters.set('default', defaultCharacter);
      this.metrics.totalAgents++;
      
      console.log('✅ Default embedded ElizaOS agent created');
      return agent;
    } catch (error) {
      console.error('❌ Error creating default agent:', error);
      throw error;
    }
  }

  /**
   * Create a vendor-specific agent
   */
  async createVendorAgent(vendorId, agentConfig) {
    try {
      console.log(`🤖 Creating embedded ElizaOS agent for vendor: ${vendorId}`);
      
      // Create dynamic character for this vendor
      const characterConfig = createDynamicCharacter(vendorId, agentConfig);
      
      const agent = await this.createAgent(vendorId, characterConfig);
      
      this.agents.set(vendorId, agent);
      this.characters.set(vendorId, characterConfig);
      this.metrics.totalAgents++;
      
      console.log(`✅ Embedded ElizaOS agent created for vendor ${vendorId}`);
      return {
        agent,
        character: characterConfig,
        agentId: agent.agentId
      };
    } catch (error) {
      console.error(`❌ Error creating agent for vendor ${vendorId}:`, error);
      throw error;
    }
  }

  /**
   * Create an ElizaOS agent with proper configuration
   */
  async createAgent(agentId, characterConfig) {
    // Enhanced character configuration for embedded ElizaOS
    const elizaosCharacter = {
      ...characterConfig,
      // Proper plugin configuration
      plugins: [
        '@elizaos/plugin-sql',
        '@elizaos/plugin-bootstrap',
        '@elizaos/plugin-openai'
      ],
      // Agent-specific settings
      settings: {
        secrets: {
          OPENAI_API_KEY: process.env.OPENAI_API_KEY
        },
        // Database configuration - use file-based SQLite for proper schema creation
        database: {
          type: 'sqlite',
          filename: `./.eliza/${agentId}.db` // File-based database per agent
        },
        // Model configuration
        modelProvider: 'openai',
        modelType: ModelType.LARGE,
        temperature: 0.7,
        maxTokens: 150
      }
    };

    // Create ElizaOS AgentRuntime
    const runtime = new AgentRuntime({
      character: elizaosCharacter,
      plugins: [
        sqlPlugin,        // Database plugin
        bootstrapPlugin,  // Core functionality
        openaiPlugin      // AI model provider
      ],
      providers: [],
      databaseAdapter: null // Handled by SQL plugin
    });

    // Initialize the agent
    await runtime.initialize();
    
    return runtime;
  }

  /**
   * Process message through the appropriate agent
   */
  async processMessage(vendorId, message, platform = 'whatsapp', userId = 'user') {
    const startTime = Date.now();
    
    try {
      const agent = this.agents.get(vendorId) || this.agents.get('default');
      
      if (!agent) {
        throw new Error(`No agent found for vendor: ${vendorId}`);
      }

      console.log(`💬 Processing message for vendor ${vendorId} using embedded ElizaOS agent`);

      // Create message context for ElizaOS
      const messageContext = {
        id: `${vendorId}-${userId}-${Date.now()}`,
        userId: userId,
        agentId: agent.agentId,
        content: {
          text: message
        },
        roomId: `${vendorId}-${platform}`,
        createdAt: new Date().toISOString(),
        platform: platform,
        vendorId: vendorId
      };

      // Process through ElizaOS agent
      const response = await agent.processMessage(messageContext);
      
      const processingTime = Date.now() - startTime;
      
      // Update metrics
      this.metrics.messageCount++;
      this.metrics.averageResponseTime = 
        (this.metrics.averageResponseTime * (this.metrics.messageCount - 1) + processingTime) / 
        this.metrics.messageCount;
      
      return {
        success: true,
        response: response.content?.text || response.message || 'I received your message.',
        vendorId: vendorId,
        platform: platform,
        userId: userId,
        agentId: agent.agentId,
        timestamp: new Date().toISOString(),
        processing_time: processingTime,
        mode: 'embedded_elizaos',
        // ElizaOS-specific response data
        elizaos_response: {
          agentId: agent.agentId,
          character: agent.character?.name || 'Unknown',
          plugins: agent.character?.plugins || [],
          modelProvider: agent.character?.settings?.modelProvider || 'openai'
        }
      };
    } catch (error) {
      this.metrics.errorCount++;
      console.error(`❌ Error processing message for vendor ${vendorId}:`, error);
      
      return {
        success: false,
        error: error.message,
        vendorId: vendorId,
        platform: platform,
        userId: userId,
        timestamp: new Date().toISOString(),
        processing_time: Date.now() - startTime,
        mode: 'embedded_elizaos_error'
      };
    }
  }

  /**
   * Register a vendor with an embedded agent
   */
  async registerVendor(vendorId, agentConfig) {
    try {
      console.log(`📝 Registering vendor ${vendorId} with embedded ElizaOS agent`);
      
      // Create dedicated agent for this vendor
      const result = await this.createVendorAgent(vendorId, agentConfig);
      
      return {
        vendorId: vendorId,
        agent_id: result.agentId, // ElizaOS-generated agent ID
        status: 'registered',
        config: agentConfig,
        registered_at: new Date().toISOString(),
        mode: 'embedded_elizaos'
      };
    } catch (error) {
      console.error(`❌ Error registering vendor ${vendorId}:`, error);
      throw error;
    }
  }

  /**
   * Get agent status
   */
  getAgentStatus(vendorId) {
    const agent = this.agents.get(vendorId);
    const character = this.characters.get(vendorId);
    
    if (!agent) {
      return null;
    }

    return {
      vendorId,
      agentId: agent.agentId,
      character: character?.name || 'Unknown',
      isActive: true,
      plugins: character?.plugins || [],
      settings: character?.settings || {},
      modelProvider: character?.settings?.modelProvider || 'openai',
      database: character?.settings?.database || {},
      createdAt: new Date().toISOString(),
      mode: 'embedded_elizaos'
    };
  }

  /**
   * Get all agents status
   */
  getAllAgentsStatus() {
    const agents = [];
    
    for (const [vendorId, agent] of this.agents) {
      const agentStatus = this.getAgentStatus(vendorId);
      if (agentStatus) {
        agents.push(agentStatus);
      }
    }
    
    return agents;
  }

  /**
   * Get system status and metrics
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      mode: 'embedded_elizaos',
      metrics: this.metrics,
      agents: this.getAllAgentsStatus(),
      totalAgents: this.agents.size,
      availableVendors: Array.from(this.agents.keys())
    };
  }

  /**
   * Shutdown all agents
   */
  async shutdown() {
    console.log('🛑 Shutting down all embedded ElizaOS agents...');
    
    for (const [vendorId, agent] of this.agents) {
      try {
        await agent.shutdown();
        console.log(`✅ Agent for vendor ${vendorId} shut down successfully`);
      } catch (error) {
        console.error(`❌ Error shutting down agent for vendor ${vendorId}:`, error);
      }
    }
    
    this.agents.clear();
    this.characters.clear();
    this.isInitialized = false;
    
    console.log('✅ All embedded ElizaOS agents shut down');
  }
}

export { EmbeddedElizaOSManager };
