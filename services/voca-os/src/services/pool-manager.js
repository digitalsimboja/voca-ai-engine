import path from 'path';
import fs from 'fs';
import { AgentPool } from './agent-pool.js';

/**
 * AgentPoolManager class manages multiple agent pools
 * Handles vendor assignment, load balancing, and pool lifecycle
 */
class AgentPoolManager {
  constructor() {
    this.pools = new Map();
    this.vendorPoolMap = new Map();
    this.nextPoolId = 1;
    this.maxVendorsPerPool = parseInt(process.env.MAX_VENDORS_PER_POOL) || 5000;
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
      this.pools.set(actualPoolId, pool);
      console.log(`Created Agent Pool ${actualPoolId}`);
    }
    
    return pool;
  }

  /**
   * Find an available pool with capacity
   * @returns {AgentPool} Available pool or null if none found
   */
  async findAvailablePool() {
    // Find a pool with available capacity
    for (const [poolId, pool] of this.pools) {
      if (pool.activeVendors.size < pool.maxVendors) {
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
    this.vendorPoolMap.set(vendorId, pool.poolId);
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
    const poolId = this.vendorPoolMap.get(vendorId);
    if (!poolId) {
      throw new Error(`Vendor ${vendorId} not assigned to any pool`);
    }
    
    const pool = this.pools.get(poolId);
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
    const poolId = this.vendorPoolMap.get(vendorId);
    if (!poolId) {
      throw new Error(`Vendor ${vendorId} not found`);
    }
    
    const pool = this.pools.get(poolId);
    if (!pool) {
      throw new Error(`Pool ${poolId} not found`);
    }
    
    // Remove from pool
    pool.activeVendors.delete(vendorId);
    pool.metrics.vendorCount = pool.activeVendors.size;
    
    // Remove from mapping
    this.vendorPoolMap.delete(vendorId);
    
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
    const poolId = this.vendorPoolMap.get(vendorId);
    if (!poolId) {
      return null;
    }
    
    const pool = this.pools.get(poolId);
    if (!pool) {
      return null;
    }
    
    const characterConfig = pool.activeVendors.get(vendorId);
    if (!characterConfig) {
      return null;
    }
    
    return {
      vendor_id: vendorId,
      pool_id: poolId,
      status: 'active',
      character: characterConfig.name,
      registered_at: characterConfig.created_at,
      agent_status: pool.isInitialized ? 'running' : 'stopped'
    };
  }

  /**
   * Get metrics for all pools
   * @returns {Object} Combined metrics from all pools
   */
  getAllMetrics() {
    const metrics = {
      totalPools: this.pools.size,
      totalVendors: this.vendorPoolMap.size,
      pools: []
    };
    
    for (const [poolId, pool] of this.pools) {
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
    return this.pools.get(poolId) || null;
  }

  /**
   * Get all pools
   * @returns {Map} Map of all pools
   */
  getAllPools() {
    return this.pools;
  }

  /**
   * Shutdown all pools
   */
  async shutdownAll() {
    console.log('Shutting down all agent pools...');
    
    for (const [poolId, pool] of this.pools) {
      await pool.shutdown();
    }
    
    this.pools.clear();
    this.vendorPoolMap.clear();
  }
}

export { AgentPoolManager };
