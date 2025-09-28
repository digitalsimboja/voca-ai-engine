import { AgentPool } from './agent-pool.js';
import { cache } from './cache.js';
import {
  AgentConfig,
  MessageResponse,
  VendorRegistrationResponse,
} from '../types/index.js';

/**
 * PoolManager class manages multiple agent pools
 * Handles pool creation, vendor distribution, and load balancing
 */
export class PoolManager {
  private pools: Map<string, AgentPool> = new Map();
  private maxPools: number;
  private maxVendorsPerPool: number;
  private isInitialized: boolean = false;
  private poolCreationLock: Map<string, Promise<AgentPool>> = new Map();

  constructor(maxPools: number = 10, maxVendorsPerPool: number = 5000) {
    this.maxPools = maxPools;
    this.maxVendorsPerPool = maxVendorsPerPool;
  }

  /**
   * Register a vendor with improved pool creation logic
   */
  async registerVendor(vendorId: string, agentConfig: AgentConfig): Promise<VendorRegistrationResponse> {
    // Check if vendor is already registered
    if (cache.hasVendor(vendorId)) {
      const existingPoolId = cache.getVendorPool(vendorId);
      if (existingPoolId) {
        const pool = this.getPool(existingPoolId);
        if (pool) {
          console.log(`Vendor ${vendorId} already registered in pool ${existingPoolId}`);
          return {
            poolId: existingPoolId,
            vendorId,
            agent_id: cache.getVendorDetails(vendorId)?.agentId || '',
            status: 'already_registered',
            config: agentConfig,
            character_path: '',
            registered_at: cache.getVendorDetails(vendorId)?.registeredAt || new Date().toISOString()
          };
        }
      }
    }

    // Try to find an available pool
    const availablePool = await this.findAvailablePool();
    
    if (availablePool) {
      try {
        const result = await availablePool.registerVendor(vendorId, agentConfig);
        cache.setVendorPool(vendorId, availablePool.getPoolId());
        console.log(`Vendor ${vendorId} registered in existing pool ${availablePool.getPoolId()}`);
        return result;
      } catch (error: any) {
        if (error.message.includes('maximum capacity')) {
          console.log(`Pool ${availablePool.getPoolId()} became full during registration, will create new pool`);
        } else {
          throw error;
        }
      }
    }

    // No available pool found, create a new one
    return await this.createNewPoolAndRegister(vendorId, agentConfig);
  }

  /**
   * Find an available pool with space
   */
  private async findAvailablePool(): Promise<AgentPool | null> {
    for (const [poolId, pool] of this.pools) {
      const vendorCount = cache.getVendorCountForPool(poolId);
      if (vendorCount < pool.getMaxVendors()) {
        return pool;
      }
    }
    return null;
  }

  /**
   * Create a new pool and register the vendor
   */
  private async createNewPoolAndRegister(vendorId: string, agentConfig: AgentConfig): Promise<VendorRegistrationResponse> {
    // Check if we can create more pools
    if (this.pools.size >= this.maxPools) {
      throw new Error(`Maximum number of pools (${this.maxPools}) reached. Cannot register vendor ${vendorId}`);
    }

    const newPoolId = `pool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Use a lock to prevent multiple pools being created simultaneously
    const lockKey = 'pool-creation';
    if (this.poolCreationLock.has(lockKey)) {
      // Wait for the existing pool creation to complete
      await this.poolCreationLock.get(lockKey);
      // Try to find an available pool again
      const availablePool = await this.findAvailablePool();
      if (availablePool) {
        const result = await availablePool.registerVendor(vendorId, agentConfig);
        cache.setVendorPool(vendorId, availablePool.getPoolId());
        return result;
      }
    }

    // Create new pool with lock
    const poolCreationPromise = this.createPool(newPoolId);
    this.poolCreationLock.set(lockKey, poolCreationPromise);

    try {
      const newPool = await poolCreationPromise;
      const result = await newPool.registerVendor(vendorId, agentConfig);
      cache.setVendorPool(vendorId, newPoolId);
      
      console.log(`Vendor ${vendorId} registered in newly created pool ${newPoolId}`);
      return result;
    } finally {
      // Clean up the lock
      this.poolCreationLock.delete(lockKey);
    }
  }

  /**
   * Create a new agent pool
   */
  async createPool(poolId: string, maxVendors?: number): Promise<AgentPool> {
    if (this.pools.size >= this.maxPools) {
      throw new Error(`Maximum number of pools (${this.maxPools}) reached`);
    }

    if (this.pools.has(poolId)) {
      throw new Error(`Pool ${poolId} already exists`);
    }

    const pool = new AgentPool(poolId, maxVendors || this.maxVendorsPerPool);
    await pool.initialize();
    
    this.pools.set(poolId, pool);
    console.log(`Created new pool: ${poolId}`);
    
    return pool;
  }

  /**
   * Get an existing pool by ID
   */
  getPool(poolId: string): AgentPool | null {
    return this.pools.get(poolId) || null;
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

    return await pool.processMessage(vendorId, message, platform, userId);
  }

  /**
   * Remove a vendor from its pool
   */
  async removeVendor(vendorId: string): Promise<{ success: boolean; message: string }> {
    const poolId = cache.getVendorPool(vendorId);
    
    if (!poolId) {
      return { success: false, message: `Vendor ${vendorId} not found in any pool` };
    }

    const pool = this.getPool(poolId);
    if (!pool) {
      return { success: false, message: `Pool ${poolId} not found` };
    }

    const result = await pool.removeVendor(vendorId);
    
    // Remove vendor from pool mapping
    cache.removeVendorPool(vendorId);
    
    // Check if pool is now empty and can be cleaned up
    await this.cleanupEmptyPools();
    
    return result;
  }

  /**
   * Clean up empty pools (except the first one)
   */
  private async cleanupEmptyPools(): Promise<void> {
    const poolsToRemove: string[] = [];
    
    for (const [poolId, pool] of this.pools) {
      // Don't remove the first pool (pool-1)
      if (poolId === 'pool-1') continue;
      
      const vendorCount = cache.getVendorCountForPool(poolId);
      if (vendorCount === 0) {
        poolsToRemove.push(poolId);
      }
    }

    // Remove empty pools
    for (const poolId of poolsToRemove) {
      const pool = this.pools.get(poolId);
      if (pool) {
        await pool.shutdown();
        this.pools.delete(poolId);
        console.log(`Cleaned up empty pool: ${poolId}`);
      }
    }
  }

  /**
   * Get all pools with their metrics
   */
  getAllPools(): Array<{
    poolId: string;
    isInitialized: boolean;
    vendorCount: number;
    maxVendors: number;
    elizaosManager: any;
    messageCount: number;
    responseTime: number;
    errorCount: number;
    characterSwitches: number;
  }> {
    const pools: Array<{
      poolId: string;
      isInitialized: boolean;
      vendorCount: number;
      maxVendors: number;
      elizaosManager: any;
      messageCount: number;
      responseTime: number;
      errorCount: number;
      characterSwitches: number;
    }> = [];

    for (const [poolId, pool] of this.pools) {
      pools.push(pool.getMetrics());
    }

    return pools;
  }

  /**
   * Get overall system metrics
   */
  getSystemMetrics(): {
    totalPools: number;
    totalVendors: number;
    totalMessages: number;
    totalErrors: number;
    averageResponseTime: number;
    pools: Array<{
      poolId: string;
      isInitialized: boolean;
      vendorCount: number;
      maxVendors: number;
      elizaosManager: any;
      messageCount: number;
      responseTime: number;
      errorCount: number;
      characterSwitches: number;
    }>;
  } {
    const pools = this.getAllPools();
    
    const totalVendors = pools.reduce((sum, pool) => sum + pool.vendorCount, 0);
    const totalMessages = pools.reduce((sum, pool) => sum + pool.messageCount, 0);
    const totalErrors = pools.reduce((sum, pool) => sum + pool.errorCount, 0);
    const averageResponseTime = pools.length > 0 
      ? pools.reduce((sum, pool) => sum + pool.responseTime, 0) / pools.length 
      : 0;

    return {
      totalPools: pools.length,
      totalVendors,
      totalMessages,
      totalErrors,
      averageResponseTime,
      pools
    };
  }

  /**
   * Initialize the pool manager
   */
  async initialize(): Promise<boolean> {
    try {
      console.log('Initializing Improved Pool Manager...');
      
      // Create default pool-1
      await this.createPool('pool-1');
      
      this.isInitialized = true;
      return true;
    } catch (error: any) {
      console.error('Error initializing Improved Pool Manager:', error);
      return false;
    }
  }

  /**
   * Shutdown all pools
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down all pools...');
    
    for (const [poolId, pool] of this.pools) {
      try {
        await pool.shutdown();
        console.log(`Pool ${poolId} shut down successfully`);
      } catch (error: any) {
        console.error(`Error shutting down pool ${poolId}:`, error);
      }
    }
    
    this.pools.clear();
    this.isInitialized = false;
    console.log('All pools shut down');
  }

  /**
   * Get pool manager status
   */
  getStatus(): {
    isInitialized: boolean;
    maxPools: number;
    maxVendorsPerPool: number;
    activePools: number;
    systemMetrics: {
      totalPools: number;
      totalVendors: number;
      totalMessages: number;
      totalErrors: number;
      averageResponseTime: number;
      pools: Array<{
        poolId: string;
        isInitialized: boolean;
        vendorCount: number;
        maxVendors: number;
        elizaosManager: any;
        messageCount: number;
        responseTime: number;
        errorCount: number;
        characterSwitches: number;
      }>;
    };
  } {
    return {
      isInitialized: this.isInitialized,
      maxPools: this.maxPools,
      maxVendorsPerPool: this.maxVendorsPerPool,
      activePools: this.pools.size,
      systemMetrics: this.getSystemMetrics()
    };
  }
}
