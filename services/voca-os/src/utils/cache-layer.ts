// cache.ts
import { createClient, RedisClientType } from "redis";
import { IAgentRuntime, type UUID } from "@elizaos/core";
import {
  AgentRuntimeInfo,
  VocaCharacter,
  VendorDetails,
  RuntimeMetrics,
  PoolMetrics,
} from "../types/index.js";

/**
 * Cache interface - contract for all implementations
 */
export interface ICache {
  setAgentRuntime(vendorId: string, runtimeInfo: AgentRuntimeInfo, ttlSeconds?: number): Promise<void>;
  getAgentRuntime(vendorId: string): Promise<{ id: UUID; runtime: IAgentRuntime } | null>;
  removeAgentRuntime(vendorId: string): Promise<boolean>;

  setCharacterConfig(vendorId: string, config: VocaCharacter, ttlSeconds?: number): Promise<void>;
  getCharacterConfig(vendorId: string): Promise<VocaCharacter | null>;
  removeCharacterConfig(vendorId: string): Promise<boolean>;

  setVendorDetails(vendorId: string, details: VendorDetails, ttlSeconds?: number): Promise<void>;
  getVendorDetails(vendorId: string): Promise<VendorDetails | null>;
  removeVendorDetails(vendorId: string): Promise<boolean>;

  setRuntimeMetrics(key: string, metrics: RuntimeMetrics, ttlSeconds?: number): Promise<void>;
  getRuntimeMetrics(key: string): Promise<RuntimeMetrics>;

  setPoolMetrics(poolId: string, metrics: PoolMetrics, ttlSeconds?: number): Promise<void>;
  getPoolMetrics(poolId: string): Promise<PoolMetrics>;

  setVendorPool(vendorId: string, poolId: string, ttlSeconds?: number): Promise<void>;
  getVendorPool(vendorId: string): Promise<string | null>;
  getVendorsForPool(poolId: string): Promise<string[]>;
  removeVendorPool(vendorId: string): Promise<boolean>;

  removeVendor(vendorId: string): Promise<void>;
  clear(): Promise<void>;
  getStats(): Promise<Record<string, number>>;
}

/**
 * In-memory cache (dev/local use)
 */
export class InMemoryCache implements ICache {
  private agentRuntimes = new Map<string, AgentRuntimeInfo>();
  private characterConfigs = new Map<string, VocaCharacter>();
  private vendorDetails = new Map<string, VendorDetails>();
  private runtimeMetrics = new Map<string, RuntimeMetrics>();
  private poolMetrics = new Map<string, PoolMetrics>();
  private vendorPoolMapping = new Map<string, string>();

  async setAgentRuntime(vendorId: string, runtimeInfo: AgentRuntimeInfo) {
    this.agentRuntimes.set(vendorId, runtimeInfo);
  }
  async getAgentRuntime(vendorId: string) {
    return (this.agentRuntimes.get(vendorId) as { id: UUID; runtime: IAgentRuntime }) || null;
  }
  async removeAgentRuntime(vendorId: string) {
    return this.agentRuntimes.delete(vendorId);
  }

  async setCharacterConfig(vendorId: string, config: VocaCharacter) {
    this.characterConfigs.set(vendorId, config);
  }
  async getCharacterConfig(vendorId: string) {
    return this.characterConfigs.get(vendorId) || null;
  }
  async removeCharacterConfig(vendorId: string) {
    return this.characterConfigs.delete(vendorId);
  }

  async setVendorDetails(vendorId: string, details: VendorDetails) {
    this.vendorDetails.set(vendorId, details);
  }
  async getVendorDetails(vendorId: string) {
    return this.vendorDetails.get(vendorId) || null;
  }
  async removeVendorDetails(vendorId: string) {
    return this.vendorDetails.delete(vendorId);
  }

  async setRuntimeMetrics(key: string, metrics: RuntimeMetrics) {
    this.runtimeMetrics.set(key, metrics);
  }
  async getRuntimeMetrics(key: string) {
    return (
      this.runtimeMetrics.get(key) || {
        totalAgents: 0,
        messageCount: 0,
        averageResponseTime: 0,
        errorCount: 0,
      }
    );
  }

  async setPoolMetrics(poolId: string, metrics: PoolMetrics) {
    this.poolMetrics.set(poolId, metrics);
  }
  async getPoolMetrics(poolId: string) {
    return (
      this.poolMetrics.get(poolId) || {
        messageCount: 0,
        responseTime: 0,
        errorCount: 0,
        vendorCount: 0,
        characterSwitches: 0,
      }
    );
  }

  async setVendorPool(vendorId: string, poolId: string) {
    this.vendorPoolMapping.set(vendorId, poolId);
  }
  async getVendorPool(vendorId: string) {
    return this.vendorPoolMapping.get(vendorId) || null;
  }
  async getVendorsForPool(poolId: string) {
    const vendors: string[] = [];
    for (const [vendorId, mappedPoolId] of this.vendorPoolMapping) {
      if (mappedPoolId === poolId) vendors.push(vendorId);
    }
    return vendors;
  }
  async removeVendorPool(vendorId: string) {
    return this.vendorPoolMapping.delete(vendorId);
  }

  async removeVendor(vendorId: string) {
    this.agentRuntimes.delete(vendorId);
    this.characterConfigs.delete(vendorId);
    this.vendorDetails.delete(vendorId);
    this.vendorPoolMapping.delete(vendorId);
  }

  async clear() {
    this.agentRuntimes.clear();
    this.characterConfigs.clear();
    this.vendorDetails.clear();
    this.runtimeMetrics.clear();
    this.poolMetrics.clear();
    this.vendorPoolMapping.clear();
  }

  async getStats() {
    return {
      agentRuntimes: this.agentRuntimes.size,
      characterConfigs: this.characterConfigs.size,
      vendorDetails: this.vendorDetails.size,
      runtimeMetrics: this.runtimeMetrics.size,
      poolMetrics: this.poolMetrics.size,
      vendorPoolMappings: this.vendorPoolMapping.size,
    };
  }
}

/**
 * Redis-backed cache (production use)
 */
export class RedisCache implements ICache {
  private client: RedisClientType;

  constructor(redisUrl: string) {
    this.client = createClient({ url: redisUrl });
    this.client.connect();
  }

  private async setJson(key: string, value: unknown, ttlSeconds?: number) {
    const payload = JSON.stringify(value);
    if (ttlSeconds) {
      await this.client.set(key, payload, { EX: ttlSeconds });
    } else {
      await this.client.set(key, payload);
    }
  }

  private async getJson<T>(key: string): Promise<T | null> {
    const data = await this.client.get(key);
    return data ? (JSON.parse(data) as T) : null;
  }

  async setAgentRuntime(vendorId: string, runtimeInfo: AgentRuntimeInfo, ttlSeconds?: number) {
    await this.setJson(`agent:${vendorId}`, runtimeInfo, ttlSeconds);
  }
  async getAgentRuntime(vendorId: string) {
    return this.getJson<{ id: UUID; runtime: IAgentRuntime }>(`agent:${vendorId}`);
  }
  async removeAgentRuntime(vendorId: string) {
    return (await this.client.del(`agent:${vendorId}`)) > 0;
  }

  async setCharacterConfig(vendorId: string, config: VocaCharacter, ttlSeconds?: number) {
    await this.setJson(`char:${vendorId}`, config, ttlSeconds);
  }
  async getCharacterConfig(vendorId: string) {
    return this.getJson<VocaCharacter>(`char:${vendorId}`);
  }
  async removeCharacterConfig(vendorId: string) {
    return (await this.client.del(`char:${vendorId}`)) > 0;
  }

  async setVendorDetails(vendorId: string, details: VendorDetails, ttlSeconds?: number) {
    await this.setJson(`vendor:${vendorId}`, details, ttlSeconds);
  }
  async getVendorDetails(vendorId: string) {
    return this.getJson<VendorDetails>(`vendor:${vendorId}`);
  }
  async removeVendorDetails(vendorId: string) {
    return (await this.client.del(`vendor:${vendorId}`)) > 0;
  }

  async setRuntimeMetrics(key: string, metrics: RuntimeMetrics, ttlSeconds?: number) {
    await this.setJson(`metrics:runtime:${key}`, metrics, ttlSeconds);
  }
  async getRuntimeMetrics(key: string) {
    return (
      (await this.getJson<RuntimeMetrics>(`metrics:runtime:${key}`)) || {
        totalAgents: 0,
        messageCount: 0,
        averageResponseTime: 0,
        errorCount: 0,
      }
    );
  }

  async setPoolMetrics(poolId: string, metrics: PoolMetrics, ttlSeconds?: number) {
    await this.setJson(`metrics:pool:${poolId}`, metrics, ttlSeconds);
  }
  async getPoolMetrics(poolId: string) {
    return (
      (await this.getJson<PoolMetrics>(`metrics:pool:${poolId}`)) || {
        messageCount: 0,
        responseTime: 0,
        errorCount: 0,
        vendorCount: 0,
        characterSwitches: 0,
      }
    );
  }

  async setVendorPool(vendorId: string, poolId: string, ttlSeconds?: number) {
    await this.setJson(`poolmap:${vendorId}`, poolId, ttlSeconds);
  }
  async getVendorPool(vendorId: string) {
    return this.getJson<string>(`poolmap:${vendorId}`);
  }
  async getVendorsForPool(poolId: string) {
    // NOTE: For efficiency, you might maintain a Redis Set instead of scanning
    const keys = await this.client.keys("poolmap:*");
    const vendors: string[] = [];
    for (const key of keys) {
      const vendorId = key.split(":")[1];
      const storedPool = await this.client.get(key);
      if (storedPool === poolId) vendors.push(vendorId);
    }
    return vendors;
  }
  async removeVendorPool(vendorId: string) {
    return (await this.client.del(`poolmap:${vendorId}`)) > 0;
  }

  async removeVendor(vendorId: string) {
    await this.client.del(
      `agent:${vendorId}`,
      `char:${vendorId}`,
      `vendor:${vendorId}`,
      `poolmap:${vendorId}`
    );
  }

  async clear() {
    await this.client.flushDb();
  }

  async getStats() {
    const size = await this.client.dbSize();
    return { totalKeys: size };
  }
}

/**
 * Export the cache instance (env-based)
 */
let cache: ICache;
if (process.env.REDIS_URL) {
  cache = new RedisCache(process.env.REDIS_URL);
  console.log("✅ Using Redis cache");
} else {
  cache = new InMemoryCache();
  console.log("⚡ Using in-memory cache");
}

export { cache };
