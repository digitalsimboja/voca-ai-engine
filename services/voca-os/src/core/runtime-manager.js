import { AgentRuntime } from "@elizaos/core";
import { createDatabaseAdapter, DatabaseMigrationService, plugin as sqlPlugin } from "@elizaos/plugin-sql";
import { createDynamicCharacter } from "../utils/character-utils.js";
import path from "path";
import fs from "fs";

/**
 * Embedded ElizaOS Manager for Multi-Agent Support
 * Each vendor gets their own agent within the same process
 */
class EmbeddedElizaOSManager {
  constructor() {
    this.agents = new Map(); // vendorId -> {ID,AgentRuntime}
    this.characters = new Map(); // vendorId -> Character
    this.isInitialized = true; // Always initialized when created
    this.metrics = {
      totalAgents: 0,
      messageCount: 0,
      averageResponseTime: 0,
      errorCount: 0,
    };
  }

  /**
   * Create a vendor-specific agent
   */
  async createVendorAgent(vendorId, agentConfig) {
    try {
      // Create dynamic character for this vendor
      const characterConfig = createDynamicCharacter(vendorId, agentConfig);
      const { runtime, agentId } = await this.createAgent(vendorId, characterConfig);

      // Store the mapping: vendorId -> {agentId, runtime}
      this.agents.set(vendorId, { id: agentId, agent: runtime });
      this.characters.set(vendorId, characterConfig);
      this.metrics.totalAgents++;

      return {
        agent: runtime,
        character: characterConfig,
        agentId: agentId,
      };
    } catch (error) {
      console.error(`Error creating agent for vendor ${vendorId}:`, error);
      throw error;
    }
  }

  /**
   * Find and initialize the database adapter using the SQL plugin
   */
  async findDatabaseAdapter(agentId) {
    if (!createDatabaseAdapter) {
      throw new Error(
        "Internal error: createDatabaseAdapter not found in plugin-sql"
      );
    }
    const postgresUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;

    let adapterConfig;
    if (postgresUrl) {
      adapterConfig = { postgresUrl };
    } else {
      const dataDir = path.join(process.cwd(), ".eliza", "databases");
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      adapterConfig = { dataDir };
    }

    const adapter = createDatabaseAdapter(
      adapterConfig,
      agentId
    );

    if (!adapter) {
      throw new Error("Internal error: Failed to create database adapter");
    }
    return adapter;
  }

  /**
   * Run database migrations using DatabaseMigrationService
   * @param {Object} adapter - Database adapter instance
   * @param {string} agentId - Agent identifier
   * @param {Array} plugins - Array of plugins to register schemas for
   */
  async runMigrations(adapter, agentId, plugins = []) {
    try {
      console.log(`Running migrations for agent ${agentId}...`);
      
      // Create DatabaseMigrationService instance
      const migrationService = new DatabaseMigrationService();
      
      // Initialize with database
      await migrationService.initializeWithDatabase(adapter.db);
      
      // Explicitly register the core schema from plugin-sql (excluding embeddings)
      if (sqlPlugin.schema) {
        // Create a custom schema without the embeddings table
        const customSchema = { ...sqlPlugin.schema };
        if (customSchema.embeddingTable) {
          delete customSchema.embeddingTable;
        }
        migrationService.registerSchema('@elizaos/plugin-sql', customSchema);
      } else {
        console.warn('No schema found in sqlPlugin, skipping explicit registration');
      }
      
      // Discover and register plugin schemas
      migrationService.discoverAndRegisterPluginSchemas(plugins);
      
      // Run all plugin migrations
      try {
        await migrationService.runAllPluginMigrations();
      } catch (migrationError) {
        // Handle migration errors gracefully
        if (migrationError.message && (
          migrationError.message.includes('type "vector" does not exist') ||
          migrationError.message.includes('extension "vector" is not available') ||
          migrationError.message.includes('Failed to create table embeddings')
        )) {
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
   * Create an ElizaOS agent with proper configuration
   */
  async createAgent(vendorId, characterConfig) {
    try {
      const { configuration, ...runtimeCharacter } = characterConfig;

      const plugins = runtimeCharacter.plugins || [];
      
      // Ensure SQL plugin is included
      if (
        !plugins.find(
          (p) =>
            (typeof p === "string" && p === "@elizaos/plugin-sql") ||
            (typeof p === "object" && p.name === "@elizaos/plugin-sql")
        )
      ) {
        plugins.push("@elizaos/plugin-sql");
      }
      
      // Ensure OpenAI plugin is included for embeddings (if API key is available)
      if (process.env.OPENAI_API_KEY?.trim() && 
          !plugins.find(
            (p) =>
              (typeof p === "string" && p === "@elizaos/plugin-openai") ||
              (typeof p === "object" && p.name === "@elizaos/plugin-openai")
          )
      ) {
        plugins.push("@elizaos/plugin-openai");
    
      }

      const runtimeCharacterWithPlugins = {
        ...runtimeCharacter,
        plugins,
      };

      const runtime = new AgentRuntime({
        character: runtimeCharacterWithPlugins,
      });

      console.log(`AgentRuntime created for vendor ${vendorId} with agentId ${runtime.agentId}`);

      const adapter = await this.findDatabaseAdapter(runtime.agentId);

      runtime.adapter = adapter;

      await this.runMigrations(adapter, runtime.agentId, plugins);
    
      await runtime.initialize();

      return { runtime, agentId: runtime.agentId };
    } catch (error) {
      console.error(`Error creating ElizaOS agent for vendor ${vendorId}:`, error);
      throw error;
    }
  }

  /**
   * Process message through the appropriate agent
   */
  async processMessage(
    vendorId,
    message,
    platform = "whatsapp",
    userId = "user"
  ) {
    const startTime = Date.now();

    try {
      const agent = this.agents.get(vendorId);

      if (!agent) {
        throw new Error(
          `No agent found for vendor: ${vendorId}. Please register the vendor first.`
        );
      }

      console.log(
        `Processing message for vendor ${vendorId} using embedded ElizaOS agent`
      );

      // Create message context for ElizaOS
      const messageContext = {
        id: `${vendorId}-${userId}-${Date.now()}`,
        userId: userId,
        agentId: agent.agentId,
        content: {
          text: message,
        },
        roomId: `${vendorId}-${platform}`,
        createdAt: new Date().toISOString(),
        platform: platform,
        vendorId: vendorId,
      };

      // Process through ElizaOS agent
      const response = await agent.processMessage(messageContext);

      const processingTime = Date.now() - startTime;

      // Update metrics
      this.metrics.messageCount++;
      this.metrics.averageResponseTime =
        (this.metrics.averageResponseTime * (this.metrics.messageCount - 1) +
          processingTime) /
        this.metrics.messageCount;

      return {
        success: true,
        response:
          response.content?.text ||
          response.message ||
          "I received your message.",
        vendorId: vendorId,
        platform: platform,
        userId: userId,
        agentId: agent.agentId,
        timestamp: new Date().toISOString(),
        processing_time: processingTime,
        mode: "embedded_elizaos",
        // ElizaOS-specific response data
        elizaos_response: {
          agentId: agent.agentId,
          character: agent.character?.name || "Unknown",
          plugins: agent.character?.plugins || [],
          modelProvider: agent.character?.settings?.modelProvider || "openai",
        },
      };
    } catch (error) {
      this.metrics.errorCount++;
      console.error(`Error processing message for vendor ${vendorId}:`, error);

      return {
        success: false,
        error: error.message,
        vendorId: vendorId,
        platform: platform,
        userId: userId,
        timestamp: new Date().toISOString(),
        processing_time: Date.now() - startTime,
        mode: "embedded_elizaos_error",
      };
    }
  }

  /**
   * Register a vendor with an embedded agent
   */
  async registerVendor(vendorId, agentConfig) {
    try {
      console.log(`Registering vendor ${vendorId} with embedded ElizaOS agent`);

      // Check if agent already exists for this vendor
      if (this.agents.has(vendorId)) {
        console.log(
          `Agent already exists for vendor ${vendorId}, returning existing agent`
        );
        const existingAgent = this.agents.get(vendorId);
        return {
          vendorId: vendorId,
          agent_id: existingAgent.agentId,
          status: "already_registered",
          config: agentConfig,
          registered_at: new Date().toISOString(),
          mode: "embedded_elizaos",
        };
      }

      // Create dedicated agent for this vendor
      const result = await this.createVendorAgent(vendorId, agentConfig);

      return {
        vendorId: vendorId,
        agent_id: result.agentId, // ElizaOS-generated agent ID
        status: "registered",
        config: agentConfig,
        registered_at: new Date().toISOString(),
        mode: "embedded_elizaos",
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
    const agent = this.agents.get(vendorId);
    const character = this.characters.get(vendorId);

    if (!agent) {
      return null;
    }

    return {
      vendorId,
      agentId: agent.agentId,
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
      mode: "embedded_elizaos",
      metrics: this.metrics,
      agents: this.getAllAgentsStatus(),
      totalAgents: this.agents.size,
      availableVendors: Array.from(this.agents.keys()),
    };
  }

  /**
   * Shutdown all agents
   */
  async shutdown() {
    console.log("Shutting down all embedded ElizaOS agents...");

    for (const [vendorId, agent] of this.agents) {
      try {
        await agent.shutdown();
        console.log(`Agent for vendor ${vendorId} shut down successfully`);
      } catch (error) {
        console.error(
          `Error shutting down agent for vendor ${vendorId}:`,
          error
        );
      }
    }

    this.agents.clear();
    this.characters.clear();
    this.isInitialized = false;

    console.log("All embedded ElizaOS agents shut down");
  }
}

export { EmbeddedElizaOSManager };
