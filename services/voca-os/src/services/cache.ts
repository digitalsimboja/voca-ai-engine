import {
  AgentRuntimeInfo,
  VocaCharacter,
  VendorDetails,
  RuntimeMetrics,
  PoolMetrics
} from "../types/index.js";

/**
 * In-memory cache for Voca OS service
 * Stores agent runtimes, character configurations, and metrics
 */
class Cache {
  private agentRuntimes: Map<string, AgentRuntimeInfo> = new Map();
  private characterConfigs: Map<string, VocaCharacter> = new Map();
  private vendorDetails: Map<string, VendorDetails> = new Map();
  private runtimeMetrics: Map<string, RuntimeMetrics> = new Map();
  private poolMetrics: Map<string, PoolMetrics> = new Map();
  private vendorPoolMapping: Map<string, string> = new Map();

  /**
   * Set agent runtime for a vendor
   */
  setAgentRuntime(vendorId: string, runtimeInfo: AgentRuntimeInfo): void {
    this.agentRuntimes.set(vendorId, runtimeInfo);
  }

  /**
   * Get agent runtime for a vendor
   */
  getAgentRuntime(vendorId: string): AgentRuntimeInfo | null {
    return this.agentRuntimes.get(vendorId) || null;
  }

  /**
   * Get all agent runtimes
   */
  getAllAgentRuntimes(): Map<string, AgentRuntimeInfo> {
    return new Map(this.agentRuntimes);
  }

  /**
   * Remove agent runtime for a vendor
   */
  removeAgentRuntime(vendorId: string): boolean {
    return this.agentRuntimes.delete(vendorId);
  }

  /**
   * Set character configuration for a vendor
   */
  setCharacterConfig(vendorId: string, config: VocaCharacter): void {
    this.characterConfigs.set(vendorId, config);
  }

  /**
   * Get character configuration for a vendor
   */
  getCharacterConfig(vendorId: string): VocaCharacter | null {
    return this.characterConfigs.get(vendorId) || null;
  }

  /**
   * Remove character configuration for a vendor
   */
  removeCharacterConfig(vendorId: string): boolean {
    return this.characterConfigs.delete(vendorId);
  }

  /**
   * Set vendor details
   */
  setVendorDetails(vendorId: string, details: VendorDetails): void {
    this.vendorDetails.set(vendorId, details);
  }

  /**
   * Get vendor details
   */
  getVendorDetails(vendorId: string): VendorDetails | null {
    return this.vendorDetails.get(vendorId) || null;
  }

  /**
   * Remove vendor details
   */
  removeVendorDetails(vendorId: string): boolean {
    return this.vendorDetails.delete(vendorId);
  }

  /**
   * Set runtime metrics
   */
  setRuntimeMetrics(key: string, metrics: RuntimeMetrics): void {
    this.runtimeMetrics.set(key, metrics);
  }

  /**
   * Get runtime metrics
   */
  getRuntimeMetrics(key: string): RuntimeMetrics {
    return this.runtimeMetrics.get(key) || {
      totalAgents: 0,
      messageCount: 0,
      averageResponseTime: 0,
      errorCount: 0,
    };
  }

  /**
   * Set pool metrics
   */
  setPoolMetrics(poolId: string, metrics: PoolMetrics): void {
    this.poolMetrics.set(poolId, metrics);
  }

  /**
   * Get pool metrics
   */
  getPoolMetrics(poolId: string): PoolMetrics {
    return this.poolMetrics.get(poolId) || {
      messageCount: 0,
      responseTime: 0,
      errorCount: 0,
      vendorCount: 0,
      characterSwitches: 0
    };
  }

  /**
   * Set vendor to pool mapping
   */
  setVendorPool(vendorId: string, poolId: string): void {
    this.vendorPoolMapping.set(vendorId, poolId);
  }

  /**
   * Get pool ID for a vendor
   */
  getVendorPool(vendorId: string): string | null {
    return this.vendorPoolMapping.get(vendorId) || null;
  }

  /**
   * Get all vendors in a pool
   */
  getVendorsForPool(poolId: string): string[] {
    const vendors: string[] = [];
    for (const [vendorId, mappedPoolId] of this.vendorPoolMapping) {
      if (mappedPoolId === poolId) {
        vendors.push(vendorId);
      }
    }
    return vendors;
  }

  /**
   * Get vendor count for a pool
   */
  getVendorCountForPool(poolId: string): number {
    return this.getVendorsForPool(poolId).length;
  }

  /**
   * Remove vendor from pool mapping
   */
  removeVendorPool(vendorId: string): boolean {
    return this.vendorPoolMapping.delete(vendorId);
  }

  /**
   * Remove all data for a vendor
   */
  removeVendor(vendorId: string): void {
    this.removeAgentRuntime(vendorId);
    this.removeCharacterConfig(vendorId);
    this.removeVendorDetails(vendorId);
    this.removeVendorPool(vendorId);
  }

  /**
   * Clear all cache data
   */
  clear(): void {
    this.agentRuntimes.clear();
    this.characterConfigs.clear();
    this.vendorDetails.clear();
    this.runtimeMetrics.clear();
    this.poolMetrics.clear();
    this.vendorPoolMapping.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    agentRuntimes: number;
    characterConfigs: number;
    vendorDetails: number;
    runtimeMetrics: number;
    poolMetrics: number;
    vendorPoolMappings: number;
  } {
    return {
      agentRuntimes: this.agentRuntimes.size,
      characterConfigs: this.characterConfigs.size,
      vendorDetails: this.vendorDetails.size,
      runtimeMetrics: this.runtimeMetrics.size,
      poolMetrics: this.poolMetrics.size,
      vendorPoolMappings: this.vendorPoolMapping.size,
    };
  }

  /**
   * Check if vendor exists in cache
   */
  hasVendor(vendorId: string): boolean {
    return this.agentRuntimes.has(vendorId) || 
           this.characterConfigs.has(vendorId) || 
           this.vendorDetails.has(vendorId);
  }

  /**
   * Get all vendor IDs
   */
  getAllVendorIds(): string[] {
    const vendorIds = new Set<string>();
    
    for (const vendorId of this.agentRuntimes.keys()) {
      vendorIds.add(vendorId);
    }
    for (const vendorId of this.characterConfigs.keys()) {
      vendorIds.add(vendorId);
    }
    for (const vendorId of this.vendorDetails.keys()) {
      vendorIds.add(vendorId);
    }
    
    return Array.from(vendorIds);
  }

  /**
   * Get all pool IDs
   */
  getAllPoolIds(): string[] {
    const poolIds = new Set<string>();
    for (const poolId of this.vendorPoolMapping.values()) {
      poolIds.add(poolId);
    }
    return Array.from(poolIds);
  }
}

// Export singleton instance
export const cache = new Cache();
