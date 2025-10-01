import path from "path";
import { EmbeddedElizaOSManager } from "../core/runtime-manager.js";
import { cache } from "./cache.js";
import {
  AgentConfig,
  MessageResponse,
  VendorRegistrationResponse,
} from "../types/index.js";

interface PoolMetricsData {
  messageCount: number;
  responseTime: number;
  errorCount: number;
  vendorCount: number;
  characterSwitches: number;
}

export class AgentPool {
  private readonly poolId: string;
  private readonly maxVendors: number;
  private isInitialized: boolean = false;
  private readonly elizaosManager: EmbeddedElizaOSManager;

  constructor(poolId: string, maxVendors: number = 5000) {
    this.poolId = poolId;
    this.maxVendors = maxVendors;
    this.elizaosManager = new EmbeddedElizaOSManager();

    cache.setPoolMetrics(poolId, {
      messageCount: 0,
      responseTime: 0,
      errorCount: 0,
      vendorCount: 0,
      characterSwitches: 0,
    });
  }

  async initialize(): Promise<boolean> {
    try {
      this.isInitialized = true;
      return true;
    } catch {
      return false;
    }
  }

  async registerVendor(vendorId: string, agentConfig: AgentConfig): Promise<VendorRegistrationResponse> {
    this.ensureCapacity();

    const elizaosResult = await this.elizaosManager.registerVendor(vendorId, agentConfig);
    const { vendor_id, config, agent_id, registered_at } = elizaosResult;

    console.log(vendor_id)
    
    cache.setVendorDetails(vendorId, {
      vendorId,
      agentConfig: config,
      agentId: agent_id,
      registeredAt: registered_at,
    });

    this.updateVendorCount();

    return {
      poolId: this.poolId,
      vendorId,
      agent_id,
      status: "registered",
      config: agentConfig,
      character_path: this.resolveCharacterPath(vendorId),
      registered_at: new Date().toISOString(),
    };
  }

  async processMessage(vendorId: string, message: string, platform: string, userId: string): Promise<MessageResponse> {
    if (!cache.getVendorDetails(vendorId)) {
      throw new Error(`Vendor ${vendorId} not registered in Pool ${this.poolId}`);
    }

    try {
      const res = await this.elizaosManager.processMessage(vendorId, message, platform, userId);
      this.incrementMetric("messageCount");
      return {
        vendor_id: vendorId,
        platform,
        user_id: userId,
        message,
        response: res.response || "No response generated",
        timestamp: res.timestamp,
        mode: res.mode,
      };
    } catch (error: any) {
      this.incrementMetric("errorCount");
      const fallback = cache.getCharacterConfig(vendorId);
      return {
        vendor_id: vendorId,
        platform,
        user_id: userId,
        message,
        response: `I'm sorry, I'm having trouble processing your message right now. I'm ${
          fallback?.name || vendorId
        }, your AI assistant. Please try again in a moment.`,
        timestamp: new Date().toISOString(),
        mode: "error_fallback",
        error: error.message,
      };
    }
  }

  getMetrics() {
    const metrics = cache.getPoolMetrics(this.poolId);
    return {
      poolId: this.poolId,
      isInitialized: this.isInitialized,
      maxVendors: this.maxVendors,
      elizaosManager: this.elizaosManager.getStatus(),
      ...metrics,
      vendorCount: cache.getVendorCountForPool(this.poolId),
    };
  }

  async removeVendor(vendorId: string): Promise<{ success: boolean; message: string }> {
    cache.removeVendor(vendorId);
    this.updateVendorCount();
    return { success: true, message: `Vendor ${vendorId} removed from Pool ${this.poolId}` };
  }

  async shutdown(): Promise<void> {
    await this.elizaosManager.shutdown();
    this.isInitialized = false;
    for (const vendorId of cache.getVendorsForPool(this.poolId)) {
      cache.removeVendor(vendorId);
    }
  }

  getPoolId(): string {
    return this.poolId;
  }

  getMaxVendors(): number {
    return this.maxVendors;
  }

  getIsInitialized(): boolean {
    return this.isInitialized;
  }

  getElizaOSManager(): EmbeddedElizaOSManager {
    return this.elizaosManager;
  }

  private ensureCapacity(): void {
    if (cache.getVendorCountForPool(this.poolId) >= this.maxVendors) {
      throw new Error(`Pool ${this.poolId} is at maximum capacity (${this.maxVendors} vendors)`);
    }
  }

  private updateVendorCount(): void {
    const metrics = cache.getPoolMetrics(this.poolId);
    metrics.vendorCount = cache.getVendorCountForPool(this.poolId);
    cache.setPoolMetrics(this.poolId, metrics);
  }

  private resolveCharacterPath(vendorId: string): string {
    return path.join(process.cwd(), "characters", "dynamic", `${vendorId}.json`);
  }

  private incrementMetric(key: keyof PoolMetricsData): void {
    const metrics = cache.getPoolMetrics(this.poolId);
    metrics[key]++;
    cache.setPoolMetrics(this.poolId, metrics);
  }
}
