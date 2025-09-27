import path from 'path';
import { EmbeddedElizaOSManager } from '../core/runtime-manager.js';
import { cache } from './cache.js';
import {
  AgentConfig,
  MessageResponse,
  VendorRegistrationResponse,
} from '../types/index.js';

/**
 * AgentPool class manages a single pool of vendors using ElizaOS runtime
 * Each pool can handle up to maxVendors vendors
 */
export class AgentPool {
  private poolId: string;
  private maxVendors: number;
  private isInitialized: boolean = false;
  private elizaosManager: EmbeddedElizaOSManager;
  
  constructor(poolId: string, maxVendors: number = 5000) {
    this.poolId = poolId;
    this.maxVendors = maxVendors;
    this.elizaosManager = new EmbeddedElizaOSManager();
    
    // Initialize metrics in cache
    cache.setPoolMetrics(poolId, {
      messageCount: 0,
      responseTime: 0,
      errorCount: 0,
      vendorCount: 0,
      characterSwitches: 0
    });
  }

  /**
   * Initialize the agent pool by connecting to ElizaOS runtime
   */
  async initialize(): Promise<boolean> {
    try {
      console.log(`Initializing Agent Pool ${this.poolId}...`);
      
      // EmbeddedElizaOSManager is always initialized when created
      this.isInitialized = true;
      console.log(`Agent Pool ${this.poolId} initialized successfully with ElizaOS runtime`);
      return true;
    } catch (error: any) {
      console.error(`Error initializing Pool ${this.poolId}:`, error);
      return false;
    }
  }

  /**
   * Register a vendor in this pool
   * @param vendorId - The vendor identifier
   * @param agentConfig - The agent configuration
   * @returns Registration result
   */
  async registerVendor(vendorId: string, agentConfig: AgentConfig): Promise<VendorRegistrationResponse> {
    const currentVendorCount = cache.getVendorCountForPool(this.poolId);
    if (currentVendorCount >= this.maxVendors) {
      throw new Error(`Pool ${this.poolId} is at maximum capacity (${this.maxVendors} vendors)`);
    }
    
    const elizaosResult = await this.elizaosManager.registerVendor(vendorId, agentConfig);
    const { vendor_id, config, agent_id, registered_at } = elizaosResult;
    
    // Store vendor details in cache
    const vendorData = {
      vendorId,
      agentConfig: config,
      agentId: agent_id,
      registeredAt: registered_at
    };
    cache.setVendorDetails(vendorId, vendorData);
    
    const characterPath = path.join(process.cwd(), 'characters', 'dynamic', `${vendorId}.json`);

    // Update vendor count in pool metrics
    const metrics = cache.getPoolMetrics(this.poolId);
    metrics.vendorCount = cache.getVendorCountForPool(this.poolId);
    cache.setPoolMetrics(this.poolId, metrics);
    
    return {
      poolId: this.poolId,
      vendorId,
      agent_id: elizaosResult.agent_id,
      status: 'registered',
      config: agentConfig,
      character_path: characterPath,
      registered_at: new Date().toISOString()
    };
  }

  /**
   * Process a message for a vendor in this pool
   * @param vendorId - The vendor identifier
   * @param message - The message content
   * @param platform - The platform (whatsapp, instagram, etc.)
   * @param userId - The user identifier
   * @returns Response object
   */
  async processMessage(vendorId: string, message: string, platform: string, userId: string): Promise<MessageResponse> {
    const vendorDetails = cache.getVendorDetails(vendorId);
    if (!vendorDetails) {
      throw new Error(`Vendor ${vendorId} not registered in Pool ${this.poolId}`);
    }

    try {
      console.log(`Processing message for vendor ${vendorId} in Pool ${this.poolId} on ${platform}`);
      
      // Process message through EmbeddedElizaOSManager
      const elizaosResponse = await this.elizaosManager.processMessage(vendorId, message, platform, userId);
      const characterConfig = cache.getCharacterConfig(vendorId);
      
      // Format response for API
      const response: MessageResponse = {
        poolId: this.poolId,
        vendor_id: vendorId,
        platform,
        user_id: userId,
        message: message,
        response: elizaosResponse.reply || "No response generated",
        timestamp: elizaosResponse.timestamp,
        character: characterConfig?.name || vendorId,
        mode: elizaosResponse.mode,
        elizaos_status: this.elizaosManager.getStatus(),
        processing_time: elizaosResponse.processing_time
      };
      
      // Update metrics in cache
      const metrics = cache.getPoolMetrics(this.poolId);
      metrics.messageCount++;
      if (response.processing_time) {
        metrics.responseTime = (metrics.responseTime + response.processing_time) / 2;
      }
      
      // Track character switches
      if (elizaosResponse.mode === 'embedded_elizaos') {
        metrics.characterSwitches++;
      }
      cache.setPoolMetrics(this.poolId, metrics);
      
      return response;
    } catch (error: any) {
      // Update error count in cache
      const metrics = cache.getPoolMetrics(this.poolId);
      metrics.errorCount++;
      cache.setPoolMetrics(this.poolId, metrics);
      console.error(`Error processing message for vendor ${vendorId}:`, error);
      
      // Fallback to mock response on error
      const characterConfig = cache.getCharacterConfig(vendorId);
      const fallbackResponse: MessageResponse = {
        poolId: this.poolId,
        vendor_id: vendorId,
        platform,
        user_id: userId,
        message: message,
        response: `I'm sorry, I'm having trouble processing your message right now. I'm ${characterConfig?.name || vendorId}, your AI assistant. Please try again in a moment.`,
        timestamp: new Date().toISOString(),
        character: characterConfig?.name || vendorId,
        mode: 'error_fallback',
        error: error.message
      };
      
      return fallbackResponse;
    }
  }

  /**
   * Get pool metrics
   * @returns Pool metrics
   */
  getMetrics(): {
    poolId: string;
    isInitialized: boolean;
    vendorCount: number;
    maxVendors: number;
    elizaosManager: any;
    messageCount: number;
    responseTime: number;
    errorCount: number;
    characterSwitches: number;
  } {
    const metrics = cache.getPoolMetrics(this.poolId);
    return {
      poolId: this.poolId,
      isInitialized: this.isInitialized,
      maxVendors: this.maxVendors,
      elizaosManager: this.elizaosManager.getStatus(),
      ...metrics,
      vendorCount: cache.getVendorCountForPool(this.poolId)
    };
  }

  /**
   * Remove a vendor from this pool
   * @param vendorId - The vendor identifier
   * @returns Removal result
   */
  async removeVendor(vendorId: string): Promise<{ success: boolean; message: string }> {
    // Remove from cache
    cache.removeVendor(vendorId);
    
    // Update vendor count in pool metrics
    const metrics = cache.getPoolMetrics(this.poolId);
    metrics.vendorCount = cache.getVendorCountForPool(this.poolId);
    cache.setPoolMetrics(this.poolId, metrics);
    
    return { success: true, message: `Vendor ${vendorId} removed from Pool ${this.poolId}` };
  }

  /**
   * Shutdown the agent pool
   */
  async shutdown(): Promise<void> {
    console.log(`Shutting down Pool ${this.poolId}...`);
    
    // Shutdown EmbeddedElizaOSManager
    await this.elizaosManager.shutdown();
    
    this.isInitialized = false;
    
    // Remove all vendors from this pool from cache
    const vendorsInPool = cache.getVendorsForPool(this.poolId);
    for (const vendorId of vendorsInPool) {
      cache.removeVendor(vendorId);
    }
  }

  /**
   * Get pool ID
   */
  getPoolId(): string {
    return this.poolId;
  }

  /**
   * Get maximum vendors allowed
   */
  getMaxVendors(): number {
    return this.maxVendors;
  }

  /**
   * Check if pool is initialized
   */
  getIsInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Get ElizaOS manager instance
   */
  getElizaOSManager(): EmbeddedElizaOSManager {
    return this.elizaosManager;
  }
}
