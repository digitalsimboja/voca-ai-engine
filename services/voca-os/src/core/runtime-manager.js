import { 
  AgentRuntime, 
  EventType, 
  createMessageMemory, 
  stringToUuid,
  ChannelType
} from "@elizaos/core";
import bootstrapPlugin from '@elizaos/plugin-bootstrap';
import googleGenaiPlugin from '@elizaos/plugin-google-genai';
import sqlPlugin, { DatabaseMigrationService, createDatabaseAdapter } from '@elizaos/plugin-sql';
import { createDynamicCharacter } from "../utils/character-utils.js";
import { cache } from "../services/cache.js";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

// Constants
const DEFAULT_PLUGINS = ["@elizaos/plugin-sql", "@elizaos/plugin-bootstrap", "@elizaos/plugin-google-genai"];
const VECTOR_ERROR_PATTERNS = [
  'type "vector" does not exist',
  'extension "vector" is not available',
  'Failed to create table embeddings'
];

/**
 * Embedded ElizaOS Manager for Multi-Agent Support
 * Each vendor gets their own agent within the same process
 */
class EmbeddedElizaOSManager {
  constructor() {
    this.isInitialized = true;
    this.initializeMetrics();
  }

  /**
   * Initialize runtime metrics in cache
   */
  initializeMetrics() {
    cache.setRuntimeMetrics('global', {
      totalAgents: 0,
      messageCount: 0,
      averageResponseTime: 0,
      errorCount: 0,
    });
  }


  /**
   * Get database adapter configuration
   */
  getDatabaseConfig() {
    const postgresUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    
    if (postgresUrl) {
      return { postgresUrl };
    }
    
    const dataDir = path.join(process.cwd(), ".eliza", "databases");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return { dataDir };
  }

  /**
   * Create and initialize database adapter
   */
  async createDatabaseAdapter(agentId) {
    if (!createDatabaseAdapter) {
      throw new Error("createDatabaseAdapter not found in plugin-sql");
    }

    const adapterConfig = this.getDatabaseConfig();
    const adapter = createDatabaseAdapter(adapterConfig, agentId);

    if (!adapter) {
      throw new Error("Failed to create database adapter");
    }
    
    return adapter;
  }

  /**
   * Check if error is related to vector extension
   */
  isVectorError(error) {
    return VECTOR_ERROR_PATTERNS.some(pattern => 
      error.message && error.message.includes(pattern)
    );
  }

  /**
   * Register plugin schemas for migration
   */
  registerPluginSchemas(migrationService, plugins) {
    // Register core SQL schema with embeddings (PostgreSQL with pgvector support)
    if (sqlPlugin.schema) {
      migrationService.registerSchema('@elizaos/plugin-sql', sqlPlugin.schema);
    } else {
      console.warn('No schema found in sqlPlugin, skipping explicit registration');
    }
    
    // Register custom plugin schemas explicitly
    this.registerCustomPluginSchemas(migrationService, plugins);
    
    // Discover and register plugin schemas (fallback for standard plugins)
    migrationService.discoverAndRegisterPluginSchemas(plugins);
  }

  /**
   * Register custom plugin schemas explicitly
   */
  registerCustomPluginSchemas(migrationService, plugins) {
    plugins.forEach(plugin => {
      // Handle plugin instances (objects with schema property)
      if (typeof plugin === 'object' && plugin !== null) {
        const pluginName = plugin.name || plugin.constructor?.name || 'UnknownPlugin';
        
        if (plugin.schema) {
          console.log(`Registering custom plugin schema for: ${pluginName}`);
          migrationService.registerSchema(pluginName, plugin.schema);
        } else if (plugin.getSchema) {
          // Handle plugins with getSchema method
          const schema = plugin.getSchema();
          if (schema) {
            console.log(`Registering custom plugin schema via getSchema() for: ${pluginName}`);
            migrationService.registerSchema(pluginName, schema);
          }
        } else {
          console.log(`No schema found for custom plugin: ${pluginName}`);
        }
      }
      // String-based plugins are handled by discoverAndRegisterPluginSchemas
    });
  }

  /**
   * Run database migrations
   */
  async runMigrations(adapter, agentId, plugins = []) {
    try {
      console.log(`Running migrations for agent ${agentId}...`);
      
      const migrationService = new DatabaseMigrationService();
      await migrationService.initializeWithDatabase(adapter.db);
      
      this.registerPluginSchemas(migrationService, plugins);
      
      try {
        await migrationService.runAllPluginMigrations();
      } catch (migrationError) {
        if (this.isVectorError(migrationError)) {
          console.warn(`Vector extension not available, continuing without embeddings table for agent ${agentId}`);
        } else {
          console.error(`Migration error for agent ${agentId}:`, migrationError.message);
          throw migrationError;
        }
      }
    } catch (error) {
      console.error(`Error running migrations for agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Check if plugin is already included
   */
  isPluginIncluded(plugins, pluginName) {
    return plugins.find(p => 
      (typeof p === "string" && p === pluginName) ||
      (typeof p === "object" && (p.name === pluginName || p.constructor?.name === pluginName))
    );
  }

  /**
   * Ensure required plugins are included
   */
  ensureRequiredPlugins(plugins) {
    const requiredPlugins = [...DEFAULT_PLUGINS];
    
    // Add Google GenAI plugin if API key is available
    if (process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()) {
      requiredPlugins.push("@elizaos/plugin-google-genai");
    }
    
    // Add missing plugins
    for (const plugin of requiredPlugins) {
      if (!this.isPluginIncluded(plugins, plugin)) {
        plugins.push(plugin);
      }
    }
    
    return plugins;
  }

  /**
   * Update agent count in metrics
   */
  updateAgentCount(delta = 1) {
    const metrics = cache.getRuntimeMetrics('global');
    metrics.totalAgents += delta;
    cache.setRuntimeMetrics('global', metrics);
  }

  /**
   * Create a vendor-specific ElizaOS agent
   */
  async createAgent(vendorId, agentConfig) {
    try {
      const characterConfig = createDynamicCharacter(vendorId, agentConfig);
      const { configuration, ...runtimeCharacter } = characterConfig;

      const plugins = this.ensureRequiredPlugins(runtimeCharacter.plugins || []);
      const runtimeCharacterWithPlugins = { ...runtimeCharacter, plugins };

      console.log('Final plugins for agent:', plugins);
      console.log('Bootstrap plugin included:', plugins.includes('@elizaos/plugin-bootstrap'));

      const runtime = new AgentRuntime({ character: runtimeCharacterWithPlugins, plugins: [sqlPlugin, bootstrapPlugin, googleGenaiPlugin], });
      const adapter = await this.createDatabaseAdapter(runtime.agentId);
      
      runtime.adapter = adapter;
      await this.runMigrations(adapter, runtime.agentId, plugins);
      await runtime.initialize();

      // Store in cache and update metrics
      cache.setAgentRuntime(vendorId, { id: runtime.agentId, runtime });
      cache.setCharacterConfig(vendorId, characterConfig);
      this.updateAgentCount(1);

      return {
        agentRuntime: runtime,
        character: characterConfig,
        agentId: runtime.agentId,
      };
    } catch (error) {
      console.error(`Error creating ElizaOS agent for vendor ${vendorId}:`, error);
      throw error;
    }
  }

  /**
   * Setup connection for message processing
   */
  async setupConnection(runtime, vendorId, platform, userId) {
    const worldId = stringToUuid(`${vendorId}-world`);
    const roomId = stringToUuid(`${vendorId}-${platform}`);
    const entityUserId = stringToUuid(userId);
    
    try {
      await runtime.ensureConnection({
        entityId: entityUserId,
        roomId,
        worldId,
        name: `User-${userId}`,
        source: platform,
        channelId: `${vendorId}-${platform}-channel`,
        serverId: `${vendorId}-server`,
        type: ChannelType.DM,
      });
    } catch (error) {
      console.log('Connection already exists or failed to create, continuing with message processing:', error.message);
    }
    
    return { worldId, roomId, entityUserId };
  }

  /**
   * Create message memory for ElizaOS
   */
  createMessageMemory(userMessage, platform, entityUserId, roomId) {
    const messageMemory = createMessageMemory({
      id: uuidv4(),
      entityId: entityUserId,
      roomId,
      content: {
        text: userMessage,
        source: platform,
        channelType: ChannelType.DM,
      },
    });
    
    console.log('Created message memory:', {
      id: messageMemory.id,
      entityId: messageMemory.entityId,
      roomId: messageMemory.roomId,
      content: messageMemory.content
    });
    
    return messageMemory;
  }

  /**
   * Process ElizaOS callback and extract response
   */
  processElizaOSCallback(content) {

    let responseText = '';
    if (content?.text) {
      console.log('✅ Found text response:', content.text);
      responseText = content.text;
    } else if (content?.thought) {
      console.log('✅ Found thought response:', content.thought);
      responseText = content.thought;
    } else {
      console.log('⚠️ No text or thought found in content');
      console.log('Available properties:', content ? Object.keys(content) : 'none');
    }
    console.log('=== END ELIZAOS CALLBACK ===');
    
    return responseText;
  }

  /**
   * Update message processing metrics
   */
  updateMessageMetrics(processingTime, isError = false) {
    const metrics = cache.getRuntimeMetrics('global');
    
    if (isError) {
      metrics.errorCount++;
    } else {
      metrics.messageCount++;
      metrics.averageResponseTime =
        (metrics.averageResponseTime * (metrics.messageCount - 1) + processingTime) / metrics.messageCount;
    }
    
    cache.setRuntimeMetrics('global', metrics);
  }

  /**
   * Process message through the appropriate agent
   */
  async processMessage(vendorId, userMessage, platform = "whatsapp", userId = "user") {
    const startTime = Date.now();

    try {
      const {id, runtime} = cache.getAgentRuntime(vendorId);
      if (!id) {
        throw new Error(`No agent found for vendor: ${vendorId}. Please register the vendor first.`);
      }

      console.log('Processing message through ElizaOS runtime...');
      
      const { entityUserId, roomId } = await this.setupConnection(runtime, vendorId, platform, userId);
      const message = this.createMessageMemory(userMessage, platform, entityUserId, roomId);

      // Process message using ElizaOS event-based system (following standalone guide)
      let responseText = '';
      
      console.log('Processing message with ElizaOS runtime using emitEvent...');
      
      try {
        // First, try the event-based approach with bootstrap plugin
        console.log('About to emit MESSAGE_RECEIVED event...');
        
        await runtime.emitEvent(EventType.MESSAGE_RECEIVED, {
          runtime: runtime,
          message,
          callback: async (content) => {
            if (content?.text) {
              console.log(`${cache.getCharacterConfig(vendorId)?.name || 'Agent'}:`, content.text);
              responseText = content.text;
            } else if (content?.thought) {
              console.log(`${cache.getCharacterConfig(vendorId)?.name || 'Agent'} (thought):`, content.thought);
              responseText = content.thought;
            } else {
              console.log('No text or thought found in callback content');
              console.log('Available properties:', content ? Object.keys(content) : 'none');
            }
          },
        });
        
        console.log('Event emission completed. Response text:', responseText);
          
        // Final fallback if both approaches fail
        if (!responseText) {
          responseText = "I received your message but couldn't generate a response.";
        }
        
      } catch (processingError) {
        console.error('ElizaOS message processing failed:', processingError);
        responseText = "I received your message but encountered an error processing it.";
      }
      const processingTime = Date.now() - startTime;
      this.updateMessageMetrics(processingTime);

      return {
        success: true,
        reply: responseText || "I received your message.",
        vendorId,
        platform,
        userId,
        agentId: id,
        timestamp: new Date().toISOString(),
        processing_time: processingTime,
        mode: "embedded_elizaos",
        elizaos_response: {
          agentId: id,
          character: cache.getCharacterConfig(vendorId)?.name || "Unknown",
          plugins: cache.getCharacterConfig(vendorId)?.plugins || [],
          modelProvider: cache.getCharacterConfig(vendorId)?.settings?.modelProvider || "openai",
        },
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.updateMessageMetrics(processingTime, true);
      console.error(`Error processing message for vendor ${vendorId}:`, error);

      return {
        success: false,
        error: error.message,
        vendorId,
        platform,
        userId,
        timestamp: new Date().toISOString(),
        processing_time: processingTime,
        mode: "embedded_elizaos_error",
      };
    }
  }

  /**
   * Check if vendor already has an agent
   */
  getExistingVendorInfo(vendorId, agentConfig) {
    const existingAgent = cache.getAgentRuntime(vendorId);
    if (!existingAgent) return null;

    console.log(`Agent already exists for vendor ${vendorId}, returning existing agent`);
    const vendorDetails = cache.getVendorDetails(vendorId);
    
    return {
      vendor_id: vendorId,
      agent_id: existingAgent.id,
      status: "already_registered",
      config: vendorDetails?.agentConfig || agentConfig,
      registered_at: vendorDetails?.registeredAt || new Date().toISOString(),
      mode: "embedded",
    };
  }

  /**
   * Register a vendor with an embedded agent
   */
  async registerVendor(vendorId, agentConfig) {
    try {
      console.log(`Registering vendor ${vendorId} with embedded ElizaOS agent`);

      // Check if agent already exists
      const existingInfo = this.getExistingVendorInfo(vendorId, agentConfig);
      if (existingInfo) return existingInfo;

      // Create new agent
      const result = await this.createAgent(vendorId, agentConfig);

      return {
        vendor_id: vendorId,
        agent_id: result.agentId,
        status: "registered",
        config: agentConfig,
        registered_at: new Date().toISOString(),
        mode: "embedded",
      };
    } catch (error) {
      console.error(`Error registering vendor ${vendorId}:`, error);
      throw error;
    }
  }

  /**
   * Get agent status
   */
  getAgentStatus(vendorId) {
    const agent = cache.getAgentRuntime(vendorId);
    const character = cache.getCharacterConfig(vendorId);

    if (!agent) return null;

    return {
      vendorId,
      agentId: agent.id,
      character: character?.name || "Unknown",
      isActive: true,
      plugins: character?.plugins || [],
      settings: character?.settings || {},
      modelProvider: character?.settings?.modelProvider || "openai",
      database: character?.settings?.database || {},
      createdAt: new Date().toISOString(),
      mode: "embedded_elizaos",
    };
  }

  /**
   * Get all agents status
   */
  getAllAgentsStatus() {
    const agentRuntimes = cache.getAllAgentRuntimes();
    return Array.from(agentRuntimes.keys())
      .map(vendorId => this.getAgentStatus(vendorId))
      .filter(Boolean);
  }

  /**
   * Get system status and metrics
   */
  getStatus() {
    const metrics = cache.getRuntimeMetrics('global');
    const agentRuntimes = cache.getAllAgentRuntimes();
    
    return {
      isInitialized: this.isInitialized,
      mode: "embedded_elizaos",
      metrics: metrics,
      agents: this.getAllAgentsStatus(),
      totalAgents: agentRuntimes.size,
      availableVendors: Array.from(agentRuntimes.keys()),
    };
  }

  /**
   * Shutdown all agents
   */
  async shutdown() {
    console.log("Shutting down all embedded ElizaOS agents...");

    const agentRuntimes = cache.getAllAgentRuntimes();
    
    // Shutdown all agents
    for (const [vendorId, agent] of agentRuntimes) {
      try {
        await agent.runtime.shutdown();
        console.log(`Agent for vendor ${vendorId} shut down successfully`);
      } catch (error) {
        console.error(`Error shutting down agent for vendor ${vendorId}:`, error);
      }
    }

    // Clear all agent-related data from cache
    Array.from(agentRuntimes.keys()).forEach(vendorId => cache.removeVendor(vendorId));
    
    this.isInitialized = false;
    console.log("All embedded ElizaOS agents shut down");
  }
}

export { EmbeddedElizaOSManager };
