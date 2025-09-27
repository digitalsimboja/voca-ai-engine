import { PoolManager } from '../services/pool-manager.js';
import { cache } from '../services/cache.js';

export interface HealthMetrics {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  pools: {
    total: number;
    active: number;
    healthy: number;
  };
  vendors: {
    total: number;
    active: number;
  };
  performance: {
    averageResponseTime: number;
    totalMessages: number;
    errorRate: number;
  };
  errors: string[];
}

export class HealthMonitor {
  private poolManager: PoolManager;
  private startTime: number;
  private memoryThreshold: number = 0.8; // 80% memory usage threshold
  private responseTimeThreshold: number = 5000; // 5 seconds
  private errorRateThreshold: number = 0.05; // 5% error rate

  constructor(poolManager: PoolManager) {
    this.poolManager = poolManager;
    this.startTime = Date.now();
  }

  /**
   * Get comprehensive health metrics
   */
  getHealthMetrics(): HealthMetrics {
    const memoryUsage = process.memoryUsage();
    const systemMetrics = this.poolManager.getSystemMetrics();
    const poolStatus = this.poolManager.getStatus();

    // Calculate error rate
    const totalRequests = systemMetrics.totalMessages + systemMetrics.totalErrors;
    const errorRate = totalRequests > 0 ? systemMetrics.totalErrors / totalRequests : 0;

    // Determine overall status
    const status = this.determineHealthStatus(memoryUsage, systemMetrics, errorRate);

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      memory: {
        used: memoryUsage.heapUsed,
        total: memoryUsage.heapTotal,
        percentage: memoryUsage.heapUsed / memoryUsage.heapTotal
      },
      cpu: {
        usage: process.cpuUsage().user / 1000000, // Convert to seconds
        loadAverage: require('os').loadavg()
      },
      pools: {
        total: poolStatus.activePools,
        active: poolStatus.activePools,
        healthy: poolStatus.activePools // Simplified for now
      },
      vendors: {
        total: systemMetrics.totalVendors,
        active: systemMetrics.totalVendors
      },
      performance: {
        averageResponseTime: systemMetrics.averageResponseTime,
        totalMessages: systemMetrics.totalMessages,
        errorRate
      },
      errors: this.getRecentErrors()
    };
  }

  /**
   * Determine overall health status
   */
  private determineHealthStatus(
    memoryUsage: NodeJS.MemoryUsage,
    systemMetrics: any,
    errorRate: number
  ): 'healthy' | 'degraded' | 'unhealthy' {
    const memoryPercentage = memoryUsage.heapUsed / memoryUsage.heapTotal;
    const errors: string[] = [];

    // Check memory usage
    if (memoryPercentage > this.memoryThreshold) {
      errors.push(`High memory usage: ${(memoryPercentage * 100).toFixed(1)}%`);
    }

    // Check response time
    if (systemMetrics.averageResponseTime > this.responseTimeThreshold) {
      errors.push(`High response time: ${systemMetrics.averageResponseTime}ms`);
    }

    // Check error rate
    if (errorRate > this.errorRateThreshold) {
      errors.push(`High error rate: ${(errorRate * 100).toFixed(1)}%`);
    }

    // Check if pools are initialized
    if (systemMetrics.totalPools === 0) {
      errors.push('No active pools');
    }

    if (errors.length === 0) {
      return 'healthy';
    } else if (errors.length <= 2) {
      return 'degraded';
    } else {
      return 'unhealthy';
    }
  }

  /**
   * Get recent errors from cache
   */
  private getRecentErrors(): string[] {
    // This would integrate with your error logging system
    // For now, return empty array
    return [];
  }

  /**
   * Check if system is ready to handle requests
   */
  isReady(): boolean {
    const metrics = this.getHealthMetrics();
    return metrics.status !== 'unhealthy' && metrics.pools.active > 0;
  }

  /**
   * Get memory usage in MB
   */
  getMemoryUsageMB(): { used: number; total: number; percentage: number } {
    const memoryUsage = process.memoryUsage();
    return {
      used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      percentage: memoryUsage.heapUsed / memoryUsage.heapTotal
    };
  }

  /**
   * Force garbage collection if available
   */
  forceGarbageCollection(): void {
    if (global.gc) {
      global.gc();
      console.log('Garbage collection forced');
    } else {
      console.log('Garbage collection not available (run with --expose-gc)');
    }
  }

  /**
   * Get system resource recommendations
   */
  getResourceRecommendations(): string[] {
    const metrics = this.getHealthMetrics();
    const recommendations: string[] = [];

    if (metrics.memory.percentage > 0.7) {
      recommendations.push('Consider increasing memory allocation or reducing concurrent vendors');
    }

    if (metrics.performance.averageResponseTime > 2000) {
      recommendations.push('Consider optimizing message processing or scaling horizontally');
    }

    if (metrics.performance.errorRate > 0.02) {
      recommendations.push('Investigate and fix error sources');
    }

    if (metrics.pools.total >= 8) {
      recommendations.push('Consider scaling to multiple instances');
    }

    return recommendations;
  }
}
