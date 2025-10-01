import { AgentPool } from './agent-pool.js';
import { cache } from './cache.js';
import {
  AgentConfig,
  MessageResponse,
  VendorRegistrationResponse,
} from '../types/index.js';

export interface PoolMetrics {
  poolId: string;
  isInitialized: boolean;
  vendorCount: number;
  maxVendors: number;
  elizaosManager: unknown;
  messageCount: number;
  responseTime: number;   // average response time per pool
  errorCount: number;
  characterSwitches: number;
}

export interface SystemMetrics {
  totalPools: number;
  totalVendors: number;
  totalMessages: number;
  totalErrors: number;
  averageResponseTime: number; // average across pools
  pools: PoolMetrics[];
}
export class PoolManager {
  private readonly pools: Map<string, AgentPool> = new Map();
  private readonly maxPools: number;
  private readonly maxVendorsPerPool: number;
  private isInitialized: boolean = false;

  private readonly poolCreationLock: Map<string, Promise<AgentPool>> = new Map();
  private readonly vendorRegistrationLock: Map<string, Promise<VendorRegistrationResponse>> = new Map();

  constructor(maxPools: number = 10, maxVendorsPerPool: number = 5000) {
    this.maxPools = maxPools;
    this.maxVendorsPerPool = maxVendorsPerPool;
  }

  async registerVendor(vendorId: string, agentConfig: AgentConfig): Promise<VendorRegistrationResponse> {
    if (this.vendorRegistrationLock.has(vendorId)) {
      return this.vendorRegistrationLock.get(vendorId)!;
    }

    const task = (async (): Promise<VendorRegistrationResponse> => {
      const mappedPoolId = cache.getVendorPool(vendorId);
      if (mappedPoolId) {
        const mappedPool = this.getPool(mappedPoolId);
        if (mappedPool) {
          try {
            const res = await mappedPool.registerVendor(vendorId, agentConfig);
            this.bindVendorToPool(vendorId, mappedPool.getPoolId());
            return res;
          } catch {
            return this.buildAlreadyRegisteredResponse(vendorId, mappedPool.getPoolId(), agentConfig);
          }
        }
        cache.removeVendorPool(vendorId);
      }

      const available = await this.findAvailablePool();
      if (available) {
        try {
          const result = await available.registerVendor(vendorId, agentConfig);
          this.bindVendorToPool(vendorId, available.getPoolId());
          return result;
        } catch (error) {
          const message = (error as Error)?.message ?? '';
          if (!message.includes('maximum capacity')) {
            throw error;
          }
        }
      }

      const newPool = await this.getOrCreateNewPool();
      const result = await newPool.registerVendor(vendorId, agentConfig);
      this.bindVendorToPool(vendorId, newPool.getPoolId());
      return result;
    })();

    this.vendorRegistrationLock.set(vendorId, task);
    try {
      return await task;
    } finally {
      this.vendorRegistrationLock.delete(vendorId);
    }
  }

  /**
   * Process a message for a vendor
   */
  async processMessage(vendorId: string, message: string, platform: string, userId: string): Promise<MessageResponse> {
    const poolId = cache.getVendorPool(vendorId);
    if (!poolId) {
      throw new Error(`Vendor ${vendorId} not found in any pool`);
    }

    const pool = this.getPool(poolId);
    if (!pool) {
      throw new Error(`Pool ${poolId} not found`);
    }

    return pool.processMessage(vendorId, message, platform, userId);
  }

  async removeVendor(vendorId: string): Promise<{ success: boolean; message: string }> {
    const poolId = cache.getVendorPool(vendorId);
    if (!poolId) {
      return { success: false, message: `Vendor ${vendorId} not found in any pool` };
    }

    const pool = this.getPool(poolId);
    if (!pool) {
      cache.removeVendorPool(vendorId);
      await this.cleanupEmptyPools();
      return { success: false, message: `Pool ${poolId} not found; mapping cleared` };
    }

    const result = await pool.removeVendor(vendorId);
    cache.removeVendorPool(vendorId);
    await this.cleanupEmptyPools();
    return result;
  }


  async createPool(poolId: string, maxVendors?: number): Promise<AgentPool> {
    if (!this.canCreateMorePools()) {
      throw new Error(`Maximum number of pools (${this.maxPools}) reached`);
    }
    if (this.pools.has(poolId)) {
      throw new Error(`Pool ${poolId} already exists`);
    }

    const pool = new AgentPool(poolId, maxVendors ?? this.maxVendorsPerPool);
    await pool.initialize();

    this.pools.set(poolId, pool);
    console.log(`Created new pool: ${poolId}`);
    return pool;
  }

  getPool(poolId: string): AgentPool | null {
    return this.pools.get(poolId) ?? null;
    }

  async initialize(): Promise<boolean> {
    try {
      console.log('Initializing Pool Manager (refactored)...');

      if (!this.pools.has('pool-1')) {
        await this.createPool('pool-1');
      }

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('Error initializing Pool Manager:', error);
      return false;
    }
  }

  async shutdown(): Promise<void> {
    console.log('Shutting down all pools...');
    for (const [, pool] of this.pools) {
      try {
        await pool.shutdown();
      } catch (error) {
        console.error(`Error shutting down pool ${pool.getPoolId?.() ?? 'unknown'}:`, error);
      }
    }
    this.pools.clear();
    this.isInitialized = false;
    console.log('All pools shut down');
  }

 
  getAllPools(): PoolMetrics[] {
    const out: PoolMetrics[] = [];
    for (const [, pool] of this.pools) {
      out.push(pool.getMetrics());
    }
    return out;
  }

 
  getSystemMetrics(): SystemMetrics {
    const pools = this.getAllPools();
    return this.calculateSystemMetrics(pools);
  }
  
  getStatus(): {
    isInitialized: boolean;
    maxPools: number;
    maxVendorsPerPool: number;
    activePools: number;
    systemMetrics: SystemMetrics;
  } {
    return {
      isInitialized: this.isInitialized,
      maxPools: this.maxPools,
      maxVendorsPerPool: this.maxVendorsPerPool,
      activePools: this.pools.size,
      systemMetrics: this.getSystemMetrics(),
    };
  }


  private bindVendorToPool(vendorId: string, poolId: string): void {
    cache.setVendorPool(vendorId, poolId);
  }

  private async findAvailablePool(): Promise<AgentPool | null> {
    for (const [poolId, pool] of this.pools) {
      const vendorCount = cache.getVendorCountForPool(poolId);
      if (vendorCount < pool.getMaxVendors()) {
        return pool;
      }
    }
    return null;
  }

  private canCreateMorePools(): boolean {
    return this.pools.size < this.maxPools;
  }

  private buildAlreadyRegisteredResponse(
    vendorId: string,
    poolId: string,
    agentConfig: AgentConfig
  ): VendorRegistrationResponse {
    const details = cache.getVendorDetails(vendorId);
    return {
      poolId,
      vendorId,
      agent_id: details?.agentId ?? '',
      status: 'already_registered',
      config: agentConfig,
      character_path: '',
      registered_at: details?.registeredAt ?? new Date().toISOString(),
    };
  }

  private calculateSystemMetrics(pools: PoolMetrics[]): SystemMetrics {
    const totalPools = pools.length;
    const totalVendors = pools.reduce((sum, p) => sum + p.vendorCount, 0);
    const totalMessages = pools.reduce((sum, p) => sum + p.messageCount, 0);
    const totalErrors = pools.reduce((sum, p) => sum + p.errorCount, 0);
    const averageResponseTime =
      totalPools > 0
        ? pools.reduce((sum, p) => sum + p.responseTime, 0) / totalPools
        : 0;

    return {
      totalPools,
      totalVendors,
      totalMessages,
      totalErrors,
      averageResponseTime,
      pools,
    };
  }


  private async getOrCreateNewPool(): Promise<AgentPool> {
    if (!this.canCreateMorePools()) {
      throw new Error(`Maximum number of pools (${this.maxPools}) reached. Cannot create new pool.`);
    }

    const lockKey = 'pool-creation';
    if (this.poolCreationLock.has(lockKey)) {
      // Wait for in-flight creation, then try to reuse any available pool
      await this.poolCreationLock.get(lockKey)!;
      const available = await this.findAvailablePool();
      if (available) return available;
      // If still none and capacity remains, fall through to create another
    }

    const newPoolId = this.generatePoolId();
    const creation = this.createPool(newPoolId);
    this.poolCreationLock.set(lockKey, creation);

    try {
      const created = await creation;
      return created;
    } finally {
      this.poolCreationLock.delete(lockKey);
    }
  }

  /** Remove empty pools except the canonical 'pool-1' */
  private async cleanupEmptyPools(): Promise<void> {
    const toRemove: string[] = [];

    for (const [poolId, pool] of this.pools) {
      if (poolId === 'pool-1') continue; // keep default pool
      const vendorCount = cache.getVendorCountForPool(poolId);
      if (vendorCount === 0) {
        toRemove.push(poolId);
      }
    }

    for (const poolId of toRemove) {
      const pool = this.pools.get(poolId);
      if (!pool) continue;
      await pool.shutdown();
      this.pools.delete(poolId);
      console.log(`Cleaned up empty pool: ${poolId}`);
    }
  }

  /** Pool ID generator */
  private generatePoolId(): string {
    // e.g., pool-1632902400-abc123xyz
    return `pool-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
}
