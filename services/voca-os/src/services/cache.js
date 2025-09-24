/**
 * Centralized cache for all agent pool state persistence
 * Single source of truth for all vendor, pool, and agent configurations
 */

class InMemoryCache {
  constructor() {
    // Core pool management
    this.pools = new Map(); // poolId -> pool instance
    this.vendorPoolMap = new Map(); // vendorId -> poolId
    
    // Agent and vendor details
    this.vendorDetails = new Map(); // vendorId -> {vendorId, agentConfig, agentId, registeredAt, poolId}
    this.agentRuntimes = new Map(); // vendorId -> {id, runtime}
    this.characterConfigs = new Map(); // vendorId -> character config
    
    // Metrics and status
    this.poolMetrics = new Map(); // poolId -> metrics
    this.runtimeMetrics = new Map(); // vendorId -> metrics
    
    // General cache for other data
    this.cache = new Map();
  }

  // ===== POOL MANAGEMENT =====
  
  /**
   * Store a pool in the cache
   * @param {string} poolId - Pool identifier
   * @param {Object} pool - Pool instance
   */
  setPool(poolId, pool) {
    this.pools.set(poolId, pool);
    console.log(`Cached pool ${poolId}`);
  }

  /**
   * Get a pool from the cache
   * @param {string} poolId - Pool identifier
   * @returns {Object|null} Pool instance or null if not found
   */
  getPool(poolId) {
    return this.pools.get(poolId) || null;
  }

  /**
   * Get all pools from the cache
   * @returns {Map} Map of all pools
   */
  getAllPools() {
    return this.pools;
  }

  // ===== VENDOR MANAGEMENT =====
  
  /**
   * Store vendor to pool mapping
   * @param {string} vendorId - Vendor identifier
   * @param {string} poolId - Pool identifier
   */
  setVendorPoolMapping(vendorId, poolId) {
    this.vendorPoolMap.set(vendorId, poolId);
    console.log(`Cached vendor ${vendorId} -> pool ${poolId}`);
  }

  /**
   * Get pool ID for a vendor
   * @param {string} vendorId - Vendor identifier
   * @returns {string|null} Pool ID or null if not found
   */
  getVendorPoolId(vendorId) {
    return this.vendorPoolMap.get(vendorId) || null;
  }

  /**
   * Store complete vendor details
   * @param {string} vendorId - Vendor identifier
   * @param {Object} vendorData - Complete vendor data
   */
  setVendorDetails(vendorId, vendorData) {
    this.vendorDetails.set(vendorId, {
      ...vendorData,
      poolId: this.vendorPoolMap.get(vendorId)
    });
    console.log(`Cached vendor details for ${vendorId}`);
  }

  /**
   * Get vendor details
   * @param {string} vendorId - Vendor identifier
   * @returns {Object|null} Vendor details or null if not found
   */
  getVendorDetails(vendorId) {
    return this.vendorDetails.get(vendorId) || null;
  }

  /**
   * Get all vendor details
   * @returns {Map} Map of all vendor details
   */
  getAllVendorDetails() {
    return this.vendorDetails;
  }

  /**
   * Remove vendor from cache
   * @param {string} vendorId - Vendor identifier
   */
  removeVendor(vendorId) {
    this.vendorPoolMap.delete(vendorId);
    this.vendorDetails.delete(vendorId);
    this.agentRuntimes.delete(vendorId);
    this.characterConfigs.delete(vendorId);
    this.runtimeMetrics.delete(vendorId);
    console.log(`Removed vendor ${vendorId} from cache`);
  }

  /**
   * Get all vendor pool mappings
   * @returns {Map} Map of vendor to pool mappings
   */
  getAllVendorMappings() {
    return this.vendorPoolMap;
  }

  // ===== AGENT RUNTIME MANAGEMENT =====
  
  /**
   * Store agent runtime
   * @param {string} vendorId - Vendor identifier
   * @param {Object} agentData - Agent runtime data
   */
  setAgentRuntime(vendorId, agentData) {
    this.agentRuntimes.set(vendorId, agentData);
    console.log(`Cached agent runtime for ${vendorId}`);
  }

  /**
   * Get agent runtime
   * @param {string} vendorId - Vendor identifier
   * @returns {Object|null} Agent runtime or null if not found
   */
  getAgentRuntime(vendorId) {
    return this.agentRuntimes.get(vendorId) || null;
  }

  /**
   * Get all agent runtimes
   * @returns {Map} Map of all agent runtimes
   */
  getAllAgentRuntimes() {
    return this.agentRuntimes;
  }

  // ===== CHARACTER CONFIG MANAGEMENT =====
  
  /**
   * Store character configuration
   * @param {string} vendorId - Vendor identifier
   * @param {Object} characterConfig - Character configuration
   */
  setCharacterConfig(vendorId, characterConfig) {
    this.characterConfigs.set(vendorId, characterConfig);
    console.log(`Cached character config for ${vendorId}`);
  }

  /**
   * Get character configuration
   * @param {string} vendorId - Vendor identifier
   * @returns {Object|null} Character configuration or null if not found
   */
  getCharacterConfig(vendorId) {
    return this.characterConfigs.get(vendorId) || null;
  }

  /**
   * Get all character configurations
   * @returns {Map} Map of all character configurations
   */
  getAllCharacterConfigs() {
    return this.characterConfigs;
  }

  // ===== METRICS MANAGEMENT =====
  
  /**
   * Store pool metrics
   * @param {string} poolId - Pool identifier
   * @param {Object} metrics - Pool metrics
   */
  setPoolMetrics(poolId, metrics) {
    this.poolMetrics.set(poolId, metrics);
  }

  /**
   * Get pool metrics
   * @param {string} poolId - Pool identifier
   * @returns {Object|null} Pool metrics or null if not found
   */
  getPoolMetrics(poolId) {
    return this.poolMetrics.get(poolId) || null;
  }

  /**
   * Store runtime metrics
   * @param {string} vendorId - Vendor identifier
   * @param {Object} metrics - Runtime metrics
   */
  setRuntimeMetrics(vendorId, metrics) {
    this.runtimeMetrics.set(vendorId, metrics);
  }

  /**
   * Get runtime metrics
   * @param {string} vendorId - Vendor identifier
   * @returns {Object|null} Runtime metrics or null if not found
   */
  getRuntimeMetrics(vendorId) {
    return this.runtimeMetrics.get(vendorId) || null;
  }

  // ===== UTILITY METHODS =====
  
  /**
   * Clear all cache data
   */
  clear() {
    this.cache.clear();
    this.pools.clear();
    this.vendorPoolMap.clear();
    this.vendorDetails.clear();
    this.agentRuntimes.clear();
    this.characterConfigs.clear();
    this.poolMetrics.clear();
    this.runtimeMetrics.clear();
    console.log('Cache cleared');
  }

  /**
   * Get comprehensive cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    return {
      totalPools: this.pools.size,
      totalVendors: this.vendorPoolMap.size,
      totalAgentRuntimes: this.agentRuntimes.size,
      totalCharacterConfigs: this.characterConfigs.size,
      pools: Array.from(this.pools.keys()),
      vendors: Array.from(this.vendorPoolMap.keys()),
      agentRuntimes: Array.from(this.agentRuntimes.keys()),
      characterConfigs: Array.from(this.characterConfigs.keys())
    };
  }

  /**
   * Get vendor count for a specific pool
   * @param {string} poolId - Pool identifier
   * @returns {number} Number of vendors in the pool
   */
  getVendorCountForPool(poolId) {
    let count = 0;
    for (const [vendorId, vendorPoolId] of this.vendorPoolMap) {
      if (vendorPoolId === poolId) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get all vendors for a specific pool
   * @param {string} poolId - Pool identifier
   * @returns {Array} Array of vendor IDs in the pool
   */
  getVendorsForPool(poolId) {
    const vendors = [];
    for (const [vendorId, vendorPoolId] of this.vendorPoolMap) {
      if (vendorPoolId === poolId) {
        vendors.push(vendorId);
      }
    }
    return vendors;
  }
}

// Create a singleton instance
const cache = new InMemoryCache();

export { cache, InMemoryCache };
