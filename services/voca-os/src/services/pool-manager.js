import path from 'path';
import fs from 'fs';
import { AgentPool } from './agent-pool.js';
import { cache } from './cache.js';

/**
 * AgentPoolManager class manages multiple agent pools
 * Handles vendor assignment, load balancing, and pool lifecycle
 */
class AgentPoolManager {
  constructor() {
    this.nextPoolId = 1;
    this.maxVendorsPerPool = parseInt(process.env.MAX_VENDORS_PER_POOL) || 5000;
    
    // Initialize nextPoolId based on existing pools in cache
    const existingPools = cache.getAllPools();
    for (const poolId of existingPools.keys()) {
      const poolNum = parseInt(poolId.replace('pool-', ''));
      if (poolNum >= this.nextPoolId) {
        this.nextPoolId = poolNum + 1;
      }
    }
  }

  /**
   * Create a new agent pool
   * @param {string} poolId - Optional pool ID, will generate one if not provided
   * @returns {AgentPool} The created pool
   */
  async createPool(poolId = null) {
    const actualPoolId = poolId || `pool-${this.nextPoolId++}`;
    const pool = new AgentPool(actualPoolId, this.maxVendorsPerPool);
    
    const success = await pool.initialize();
    if (success) {
      cache.setPool(actualPoolId, pool);
      console.log(`Created Agent Pool ${actualPoolId}`);
    }
    
    return pool;
  }

  /**
   * Find an available pool with capacity
   * @returns {AgentPool} Available pool or null if none found
   */
  async findAvailablePool() {
    // Find a pool with available capacity using cache
    const pools = cache.getAllPools();
    for (const [poolId, pool] of pools) {
      const vendorCount = cache.getVendorCountForPool(poolId);
      if (vendorCount < pool.maxVendors) {
        return pool;
      }
    }
    
    // If no pool available, create a new one
    console.log('No available pools, creating new pool...');
    return await this.createPool();
  }

  /**
   * Assign a vendor to an available pool
   * @param {string} vendorId - The vendor identifier
   * @param {Object} vendorConfig - The vendor configuration
   * @returns {Object} Assignment result
   */
  async assignVendor(vendorId, vendorConfig) {
    const pool = await this.findAvailablePool();
    const result = await pool.registerVendor(vendorId, vendorConfig);
    cache.setVendorPoolMapping(vendorId, pool.poolId);
    return result;
  }

  /**
   * Route a message to the appropriate pool
   * @param {string} vendorId - The vendor identifier
   * @param {string} message - The message content
   * @param {string} platform - The platform
   * @param {string} userId - The user identifier
   * @returns {Object} Response from the pool
   */
  async routeMessage(vendorId, message, platform, userId) {
    const poolId = cache.getVendorPoolId(vendorId);
   
    if (!poolId) {
      throw new Error(`Vendor ${vendorId} not assigned to any pool`);
    }
    
    const pool = cache.getPool(poolId);
    
    if (!pool) {
      throw new Error(`Pool ${poolId} not found`);
    }
    
    return await pool.processMessage(vendorId, message, platform, userId);
  }

  /**
   * Remove a vendor from its assigned pool
   * @param {string} vendorId - The vendor identifier
   * @returns {Object} Removal result
   */
  async removeVendor(vendorId) {
    const poolId = cache.getVendorPoolId(vendorId);
    if (!poolId) {
      throw new Error(`Vendor ${vendorId} not found`);
    }
    
    const pool = cache.getPool(poolId);
    if (!pool) {
      throw new Error(`Pool ${poolId} not found`);
    }
    
    // Remove from pool (this will also remove from cache via pool's removeVendor method)
    await pool.removeVendor(vendorId);
    
    // Remove character file
    const characterPath = path.join(__dirname, '..', 'characters', 'dynamic', `${vendorId}.json`);
    try {
      fs.unlinkSync(characterPath);
    } catch (error) {
      console.error('Error deleting character file:', error);
    }
    
    return { success: true, message: `Vendor ${vendorId} removed from Pool ${poolId}` };
  }

  /**
   * Get vendor status information
   * @param {string} vendorId - The vendor identifier
   * @returns {Object|null} Vendor status or null if not found
   */
  getVendorStatus(vendorId) {
    const poolId = cache.getVendorPoolId(vendorId);
    if (!poolId) {
      return null;
    }
    
    const pool = cache.getPool(poolId);
    if (!pool) {
      return null;
    }
    
    const vendorDetails = cache.getVendorDetails(vendorId);
    if (!vendorDetails) {
      return null;
    }
    
    return {
      vendor_id: vendorId,
      pool_id: poolId,
      status: 'active',
      character: vendorDetails.agentConfig?.name || vendorId,
      registered_at: vendorDetails.registeredAt,
      agent_status: pool.isInitialized ? 'running' : 'stopped'
    };
  }

  /**
   * Get metrics for all pools
   * @returns {Object} Combined metrics from all pools
   */
  getAllMetrics() {
    const pools = cache.getAllPools();
    const metrics = {
      totalPools: pools.size,
      totalVendors: cache.getAllVendorMappings().size,
      pools: []
    };
    
    for (const [poolId, pool] of pools) {
      metrics.pools.push(pool.getMetrics());
    }
    
    return metrics;
  }

  /**
   * Get a specific pool by ID
   * @param {string} poolId - The pool identifier
   * @returns {AgentPool|null} The pool or null if not found
   */
  getPool(poolId) {
    return cache.getPool(poolId);
  }

  /**
   * Get all pools
   * @returns {Map} Map of all pools
   */
  getAllPools() {
    return cache.getAllPools();
  }

  /**
   * Shutdown all pools
   */
  async shutdownAll() {
    console.log('Shutting down all agent pools...');
    
    const pools = cache.getAllPools();
    for (const [poolId, pool] of pools) {
      await pool.shutdown();
    }
    
    cache.clear();
  }
}

export { AgentPoolManager };
