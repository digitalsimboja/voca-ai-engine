import { PoolManager } from '../services/pool-manager.js';
import { cache } from '../services/cache.js';

export interface MemoryLimits {
  maxHeapSize: number; // MB
  warningThreshold: number; // percentage (0-1)
  criticalThreshold: number; // percentage (0-1)
  maxVendorsPerPool: number;
  maxTotalVendors: number;
}

export interface MemoryStats {
  heapUsed: number; // MB
  heapTotal: number; // MB
  heapPercentage: number;
  external: number; // MB
  rss: number; // MB
  totalVendors: number;
  totalPools: number;
  averageVendorsPerPool: number;
}

export class MemoryManager {
  private poolManager: PoolManager;
  private limits: MemoryLimits;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring: boolean = false;

  constructor(poolManager: PoolManager, limits: Partial<MemoryLimits> = {}) {
    this.poolManager = poolManager;
    this.limits = {
      maxHeapSize: 1024, // 1GB default
      warningThreshold: 0.7, // 70%
      criticalThreshold: 0.85, // 85%
      maxVendorsPerPool: 1000, // Reduced from 5000
      maxTotalVendors: 5000,
      ...limits
    };
  }

  /**
   * Start memory monitoring
   */
  startMonitoring(intervalMs: number = 30000): void {
    if (this.isMonitoring) {
      console.log('Memory monitoring already active');
      return;
    }

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, intervalMs);

    console.log(`Memory monitoring started (interval: ${intervalMs}ms)`);
  }

  /**
   * Stop memory monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    console.log('Memory monitoring stopped');
  }

  /**
   * Get current memory statistics
   */
  getMemoryStats(): MemoryStats {
    const memoryUsage = process.memoryUsage();
    const systemMetrics = this.poolManager.getSystemMetrics();

    return {
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      heapPercentage: memoryUsage.heapUsed / memoryUsage.heapTotal,
      external: Math.round(memoryUsage.external / 1024 / 1024),
      rss: Math.round(memoryUsage.rss / 1024 / 1024),
      totalVendors: systemMetrics.totalVendors,
      totalPools: systemMetrics.totalPools,
      averageVendorsPerPool: systemMetrics.totalPools > 0 
        ? systemMetrics.totalVendors / systemMetrics.totalPools 
        : 0
    };
  }

  /**
   * Check memory usage and take action if needed
   */
  private checkMemoryUsage(): void {
    const stats = this.getMemoryStats();
    const heapPercentage = stats.heapPercentage;

    console.log(`Memory check: ${stats.heapUsed}MB/${stats.heapTotal}MB (${(heapPercentage * 100).toFixed(1)}%)`);

    if (heapPercentage >= this.limits.criticalThreshold) {
      console.warn('CRITICAL: Memory usage is very high, taking emergency action');
      this.handleCriticalMemoryUsage();
    } else if (heapPercentage >= this.limits.warningThreshold) {
      console.warn('WARNING: Memory usage is high, taking preventive action');
      this.handleHighMemoryUsage();
    }

    // Check vendor limits
    if (stats.totalVendors >= this.limits.maxTotalVendors) {
      console.warn('WARNING: Maximum vendor limit reached');
      this.handleVendorLimitReached();
    }
  }

  /**
   * Handle critical memory usage
   */
  private handleCriticalMemoryUsage(): void {
    console.log('Taking emergency memory management actions...');

    // 1. Force garbage collection
    this.forceGarbageCollection();

    // 2. Clear unused cache entries
    this.clearUnusedCacheEntries();

    // 3. Consider removing least active vendors
    this.removeLeastActiveVendors(0.1); // Remove 10% of least active

    // 4. Log memory stats
    const stats = this.getMemoryStats();
    console.log('Post-emergency memory stats:', stats);
  }

  /**
   * Handle high memory usage
   */
  private handleHighMemoryUsage(): void {
    console.log('Taking preventive memory management actions...');

    // 1. Force garbage collection
    this.forceGarbageCollection();

    // 2. Clear some cache entries
    this.clearUnusedCacheEntries();

    // 3. Log recommendations
    this.logMemoryRecommendations();
  }

  /**
   * Handle vendor limit reached
   */
  private handleVendorLimitReached(): void {
    console.log('Vendor limit reached, considering scaling options...');
    
    // This would typically trigger horizontal scaling
    // For now, just log the situation
    const stats = this.getMemoryStats();
    console.log('Current vendor distribution:', {
      totalVendors: stats.totalVendors,
      totalPools: stats.totalPools,
      averagePerPool: stats.averageVendorsPerPool
    });
  }

  /**
   * Force garbage collection
   */
  private forceGarbageCollection(): void {
    if (global.gc) {
      const beforeGC = this.getMemoryStats();
      global.gc();
      const afterGC = this.getMemoryStats();
      
      console.log(`Garbage collection: ${beforeGC.heapUsed}MB → ${afterGC.heapUsed}MB (freed ${beforeGC.heapUsed - afterGC.heapUsed}MB)`);
    } else {
      console.log('Garbage collection not available (run with --expose-gc)');
    }
  }

  /**
   * Clear unused cache entries
   */
  private clearUnusedCacheEntries(): void {
    // This would implement cache cleanup logic
    // For now, just log the action
    console.log('Clearing unused cache entries...');
  }

  /**
   * Remove least active vendors
   */
  private removeLeastActiveVendors(percentage: number): void {
    console.log(`Removing ${(percentage * 100).toFixed(1)}% of least active vendors...`);
    
    // This would implement vendor removal logic based on activity
    // For now, just log the action
    const systemMetrics = this.poolManager.getSystemMetrics();
    const vendorsToRemove = Math.floor(systemMetrics.totalVendors * percentage);
    console.log(`Would remove ${vendorsToRemove} least active vendors`);
  }

  /**
   * Log memory recommendations
   */
  private logMemoryRecommendations(): void {
    const stats = this.getMemoryStats();
    const recommendations: string[] = [];

    if (stats.heapPercentage > 0.8) {
      recommendations.push('Consider reducing maxVendorsPerPool');
    }

    if (stats.averageVendorsPerPool > this.limits.maxVendorsPerPool * 0.8) {
      recommendations.push('Consider creating more pools for better distribution');
    }

    if (stats.totalVendors > this.limits.maxTotalVendors * 0.9) {
      recommendations.push('Consider horizontal scaling');
    }

    if (recommendations.length > 0) {
      console.log('Memory recommendations:', recommendations);
    }
  }

  /**
   * Check if new vendor can be added
   */
  canAddVendor(): { allowed: boolean; reason?: string } {
    const stats = this.getMemoryStats();

    if (stats.totalVendors >= this.limits.maxTotalVendors) {
      return { allowed: false, reason: 'Maximum total vendors reached' };
    }

    if (stats.heapPercentage >= this.limits.criticalThreshold) {
      return { allowed: false, reason: 'Critical memory usage' };
    }

    return { allowed: true };
  }

  /**
   * Get memory limits
   */
  getLimits(): MemoryLimits {
    return { ...this.limits };
  }

  /**
   * Update memory limits
   */
  updateLimits(newLimits: Partial<MemoryLimits>): void {
    this.limits = { ...this.limits, ...newLimits };
    console.log('Memory limits updated:', this.limits);
  }

  /**
   * Get memory health status
   */
  getMemoryHealth(): {
    status: 'healthy' | 'warning' | 'critical';
    stats: MemoryStats;
    recommendations: string[];
  } {
    const stats = this.getMemoryStats();
    const recommendations: string[] = [];

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    if (stats.heapPercentage >= this.limits.criticalThreshold) {
      status = 'critical';
      recommendations.push('Immediate action required: memory usage is critical');
    } else if (stats.heapPercentage >= this.limits.warningThreshold) {
      status = 'warning';
      recommendations.push('Monitor memory usage closely');
    }

    if (stats.totalVendors >= this.limits.maxTotalVendors * 0.9) {
      recommendations.push('Consider scaling before reaching vendor limit');
    }

    return { status, stats, recommendations };
  }
}
