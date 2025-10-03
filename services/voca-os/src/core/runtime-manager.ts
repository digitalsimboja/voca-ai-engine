import {
  AgentRuntime,
  EventType,
  createMessageMemory,
  stringToUuid,
  ChannelType,
  IAgentRuntime,
  MessageMemory,
  type UUID,
} from "@elizaos/core";
import bootstrapPlugin from "@elizaos/plugin-bootstrap";
import sqlPlugin from "@elizaos/plugin-sql";
import openaiPlugin from "@elizaos/plugin-openai";
import orderPlugin from "../../plugins/plugin-order.js";
import { createDynamicCharacter } from "../utils/character-utils.js";
import { cache } from "../services/cache.js";
import { v4 as uuidv4 } from "uuid";
import {
  AgentConfig,
  VocaCharacter,
  RuntimeMetrics,
  MessageResponse,
} from "../types/index.js";
import { createDatabaseAdapter, runMigrations } from "./run-migration.js";

/**
 * Embedded ElizaOS Manager for Multi-Agent Support
 * Each vendor gets their own agent within the same process
 */
export class EmbeddedElizaOSManager {
  private isInitialized: boolean = true;

  constructor() {
    this.initializeMetrics();
  }

  /**
   * Initialize runtime metrics in cache
   */
  private initializeMetrics(): void {
    cache.setRuntimeMetrics("global", {
      totalAgents: 0,
      messageCount: 0,
      averageResponseTime: 0,
      errorCount: 0,
    });
  }

  /**
   * Check if plugin is already included
   */
  private isPluginIncluded(plugins: any[], pluginName: string): boolean {
    return (
      plugins.find(
        (p) =>
          (typeof p === "string" && p === pluginName) ||
          (typeof p === "object" &&
            (p.name === pluginName || p.constructor?.name === pluginName))
      ) !== undefined
    );
  }

  /**
   * Update agent count in metrics
   */
  private updateAgentCount(delta: number = 1): void {
    const metrics = cache.getRuntimeMetrics("global");
    metrics.totalAgents += delta;
    cache.setRuntimeMetrics("global", metrics);
  }

  async createAgent(
    vendorId: string,
    agentConfig: AgentConfig
  ): Promise<{
    agentRuntime: AgentRuntime;
    character: VocaCharacter;
    agentId: string;
  }> {
    try {
      const characterConfig = createDynamicCharacter(vendorId, agentConfig);
      const { configuration, ...runtimeCharacter } = characterConfig;

      const runtime = new AgentRuntime({
        character: runtimeCharacter,
        plugins: [sqlPlugin, bootstrapPlugin, openaiPlugin, orderPlugin],
        settings: {
          POSTGRES_URL: process.env["POSTGRES_URL"],
          OPENAI_API_KEY: process.env["OPENAI_API_KEY"],
          // GOOGLE_GENERATIVE_AI_API_KEY:
          //   process.env["GOOGLE_GENERATIVE_AI_API_KEY"],
        },
      });
      // Create database adapter and run migrations before runtime initialization
      const adapter = await createDatabaseAdapter(runtime.agentId);
      await runMigrations(adapter, runtime.agentId, [
        sqlPlugin,
        bootstrapPlugin,
        openaiPlugin,
        orderPlugin,
      ]);

      // Set the adapter on the runtime
      runtime.adapter = adapter;

      // Initialize runtime - this will now work because tables already exist
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
    } catch (error: any) {
      console.error(
        `Error creating ElizaOS agent for vendor ${vendorId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Setup connection for message processing
   */
  async setupConnection(
    runtime: IAgentRuntime,
    vendorId: string,
    platform: string,
    userId: string
  ): Promise<{
    worldId: string;
    roomId: string;
    entityUserId: string;
  }> {
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
    } catch (error: any) {
      console.log(
        "Connection already exists or failed to create, continuing with message processing:",
        error.message
      );
    }

    return { worldId, roomId, entityUserId };
  }

  /**
   * Create message memory for ElizaOS
   */
  private createMessageMemory(
    userMessage: string,
    platform: string,
    entityUserId: string,
    roomId: string,
    vendorId: string
  ): MessageMemory {
    const messageMemory = createMessageMemory({
      id: uuidv4() as UUID,
      entityId: entityUserId as UUID,
      roomId: roomId as UUID,
      content: {
        text: userMessage,
        vendor_id: vendorId,
        source: platform,
        channelType: ChannelType.DM,
      },
    });

    return messageMemory;
  }

  /**
   * Update message processing metrics
   */
  private updateMessageMetrics(
    processingTime: number,
    isError: boolean = false
  ): void {
    const metrics = cache.getRuntimeMetrics("global");

    if (isError) {
      metrics.errorCount++;
    } else {
      metrics.messageCount++;
      metrics.averageResponseTime =
        (metrics.averageResponseTime * (metrics.messageCount - 1) +
          processingTime) /
        metrics.messageCount;
    }

    cache.setRuntimeMetrics("global", metrics);
  }

  /**
   * Process message through the appropriate agent
   */
  async processMessage(
    vendorId: string,
    userMessage: string,
    platform: string = "whatsapp",
    userId: string = "user"
  ): Promise<MessageResponse> {
    const startTime = Date.now();

    try {
      const agentRuntime = cache.getAgentRuntime(vendorId) as {
        id: string;
        runtime: IAgentRuntime;
      };
      if (!agentRuntime?.id) {
        throw new Error(
          `No agent found for vendor: ${vendorId}. Please register the vendor first.`
        );
      }

      const { entityUserId, roomId } = await this.setupConnection(
        agentRuntime.runtime,
        vendorId,
        platform,
        userId
      );
      const message = this.createMessageMemory(
        userMessage,
        platform,
        entityUserId,
        roomId,
        vendorId
      );

      let responseText = "";

      try {
        await agentRuntime.runtime.emitEvent(EventType.MESSAGE_RECEIVED, {
          runtime: agentRuntime.runtime,
          message,
          callback: async (content: any) => {
            if (content?.text) {
              responseText = content.text;
            } else if (content?.thought) {
              responseText = content.thought;
            } else {
              console.log("No text or thought found in callback content");
              console.log(content);
            }
          },
        });

        // Final fallback if empty
        if (!responseText) {
          responseText =
            "I received your message but couldn't generate a response.";
        }
      } catch (processingError: any) {
        console.error("ElizaOS message processing failed:", processingError);
        responseText =
          "I received your message but encountered an error processing it.";
      }

      const processingTime = Date.now() - startTime;
      this.updateMessageMetrics(processingTime);

      return {
        vendor_id: vendorId,
        platform,
        user_id: userId,
        message: userMessage,
        response: responseText || "I received your message.",
        timestamp: new Date().toISOString(),
        mode: "embedded_elizaos",
      };
    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      this.updateMessageMetrics(processingTime, true);
      console.error(`Error processing message for vendor ${vendorId}:`, error);

      return {
        vendor_id: vendorId,
        platform,
        user_id: userId,
        message: userMessage,
        response:
          "I'm sorry, I'm having trouble processing your message right now.",
        timestamp: new Date().toISOString(),
        mode: "embedded_elizaos_error",
        error: error.message,
      };
    }
  }

  /**
   * Check if vendor already has an agent
   */
  private getExistingVendorInfo(
    vendorId: string,
    agentConfig: AgentConfig
  ): {
    vendor_id: string;
    agent_id: string;
    status: string;
    config: AgentConfig;
    registered_at: string;
    mode: string;
  } | null {
    const existingAgent = cache.getAgentRuntime(vendorId);
    if (!existingAgent) return null;

    console.log(
      `Agent already exists for vendor ${vendorId}, returning existing agent`
    );
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
  async registerVendor(
    vendorId: string,
    agentConfig: AgentConfig
  ): Promise<{
    vendor_id: string;
    agent_id: string;
    status: string;
    config: AgentConfig;
    registered_at: string;
    mode: string;
  }> {
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
    } catch (error: any) {
      console.error(`Error registering vendor ${vendorId}:`, error);
      throw error;
    }
  }

  /**
   * Get agent status
   */
  getAgentStatus(vendorId: string): {
    vendorId: string;
    agentId: string;
    character: string;
    isActive: boolean;
    plugins: string[];
    settings: any;
    modelProvider: string;
    database: any;
    createdAt: string;
    mode: string;
  } | null {
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
      modelProvider:
        (character?.settings?.["modelProvider"] as string) || "openai",
      database: character?.settings?.["database"] || {},
      createdAt: new Date().toISOString(),
      mode: "embedded_elizaos",
    };
  }

  /**
   * Get all agents status
   */
  getAllAgentsStatus(): Array<{
    vendorId: string;
    agentId: string;
    character: string;
    isActive: boolean;
    plugins: string[];
    settings: any;
    modelProvider: string;
    database: any;
    createdAt: string;
    mode: string;
  }> {
    const agentRuntimes = cache.getAllAgentRuntimes();
    return Array.from(agentRuntimes.keys())
      .map((vendorId) => this.getAgentStatus(vendorId))
      .filter(Boolean) as Array<{
      vendorId: string;
      agentId: string;
      character: string;
      isActive: boolean;
      plugins: string[];
      settings: any;
      modelProvider: string;
      database: any;
      createdAt: string;
      mode: string;
    }>;
  }

  /**
   * Get system status and metrics
   */
  getStatus(): {
    isInitialized: boolean;
    mode: string;
    metrics: RuntimeMetrics;
    agents: Array<{
      vendorId: string;
      agentId: string;
      character: string;
      isActive: boolean;
      plugins: string[];
      settings: any;
      modelProvider: string;
      database: any;
      createdAt: string;
      mode: string;
    }>;
    totalAgents: number;
    availableVendors: string[];
  } {
    const metrics = cache.getRuntimeMetrics("global");
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
  async shutdown(): Promise<void> {
    console.log("Shutting down all embedded ElizaOS agents...");

    const agentRuntimes = cache.getAllAgentRuntimes();

    // Shutdown all agents
    for (const [vendorId, agent] of agentRuntimes) {
      try {
        // attempt common shutdown method names depending on runtime version
        if (typeof agent.runtime.close === "function") {
          await agent.runtime.close();
        } else if (typeof agent.runtime.stop === "function") {
          await agent.runtime.stop();
        } else if (typeof agent.runtime.close === "function") {
          await agent.runtime.close();
        }
        console.log(`Agent for vendor ${vendorId} shut down successfully`);
      } catch (error: any) {
        console.error(
          `Error shutting down agent for vendor ${vendorId}:`,
          error
        );
      }
    }

    // Clear all agent-related data from cache
    Array.from(agentRuntimes.keys()).forEach((vendorId) =>
      cache.removeVendor(vendorId)
    );

    this.isInitialized = false;
    console.log("All embedded ElizaOS agents shut down");
  }
}
