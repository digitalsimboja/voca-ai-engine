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

  constructor(maxPools: number = 10, maxVendorsPerPool: number = 5000) {
    this.maxPools = maxPools;
    this.maxVendorsPerPool = maxVendorsPerPool;
  }

  /**
   * Initialize the pool manager
   */
  async initialize(): Promise<boolean> {
    try {
      console.log('Initializing Pool Manager...');
      
      // Create default pool
      await this.createPool('pool-1');
      
      this.isInitialized = true;

      return true;
    } catch (error: any) {
      console.error('Error initializing Pool Manager:', error);
      return false;
    }
  }

  /**
   * Create a new agent pool
   * @param poolId - Unique identifier for the pool
   * @param maxVendors - Maximum vendors allowed in this pool
   * @returns Created pool instance
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
   * @param poolId - Pool identifier
   * @returns Pool instance or null if not found
   */
  getPool(poolId: string): AgentPool | null {
    return this.pools.get(poolId) || null;
  }

  /**
   * Find the best pool for a new vendor (load balancing)
   * @returns Pool ID with the least vendors
   */
  private findBestPool(): string {
    let bestPoolId = 'default';
    let minVendorCount = Infinity;

    for (const [poolId, pool] of this.pools) {
      const vendorCount = cache.getVendorCountForPool(poolId);
      if (vendorCount < minVendorCount && vendorCount < pool.getMaxVendors()) {
        minVendorCount = vendorCount;
        bestPoolId = poolId;
      }
    }

    return bestPoolId;
  }

  /**
   * Register a vendor in the best available pool
   * @param vendorId - Vendor identifier
   * @param agentConfig - Agent configuration
   * @returns Registration result
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

    // Find the best pool for this vendor
    const poolId = this.findBestPool();
    const pool = this.getPool(poolId);
    
    if (!pool) {
      throw new Error(`Pool ${poolId} not found`);
    }

    try {
      const result = await pool.registerVendor(vendorId, agentConfig);
      
      // Map vendor to pool
      cache.setVendorPool(vendorId, poolId);
      
      console.log(`Vendor ${vendorId} registered in pool ${poolId}`);
      return result;
    } catch (error: any) {
      // If pool is full, try to create a new pool
      if (error.message.includes('maximum capacity')) {
        console.log(`Pool ${poolId} is full, attempting to create new pool...`);
        
        const newPoolId = `pool-${Date.now()}`;
        try {
          const newPool = await this.createPool(newPoolId);
          const result = await newPool.registerVendor(vendorId, agentConfig);
          
          // Map vendor to new pool
          cache.setVendorPool(vendorId, newPoolId);
          
          console.log(`Vendor ${vendorId} registered in new pool ${newPoolId}`);
          return result;
        } catch (newPoolError: any) {
          console.error(`Failed to create new pool: ${newPoolError.message}`);
          throw new Error(`All pools are at maximum capacity. Cannot register vendor ${vendorId}`);
        }
      }
      throw error;
    }
  }

  /**
   * Process a message for a vendor
   * @param vendorId - Vendor identifier
   * @param message - Message content
   * @param platform - Platform (whatsapp, instagram, etc.)
   * @param userId - User identifier
   * @returns Response object
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
   * @param vendorId - Vendor identifier
   * @returns Removal result
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
    
    return result;
  }

  /**
   * Get all pools with their metrics
   * @returns Array of pool information
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
   * @returns System-wide metrics
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
