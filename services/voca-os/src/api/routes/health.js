import express from 'express';
import { AgentPoolManager } from '../../services/pool-manager.js';

/**
 * Health routes for service monitoring and status
 */
function createHealthRoutes(poolManager) {
  const router = express.Router();

  /**
   * Health check endpoint
   * GET /health
   */
  router.get('/', (req, res) => {
    try {
      const metrics = poolManager.getAllMetrics();
      
      // Calculate overall health status
      const totalPools = metrics.totalPools;
      const initializedPools = metrics.pools.filter(pool => pool.isInitialized).length;
      const healthyPools = metrics.pools.filter(pool => 
        pool.isInitialized && pool.elizaosManager?.isInitialized
      ).length;
      
      const healthStatus = {
        status: totalPools > 0 && initializedPools > 0 ? 'healthy' : 'degraded',
        service: 'voca-os',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        architecture: 'multi-pool-dynamic-characters',
        pools: {
          total: totalPools,
          initialized: initializedPools,
          healthy: healthyPools,
          degraded: totalPools - healthyPools
        },
        ...metrics
      };
      
      // Set appropriate HTTP status code
      const httpStatus = healthStatus.status === 'healthy' ? 200 : 503;
      res.status(httpStatus).json(healthStatus);
    } catch (error) {
      console.error('Error getting health status:', error);
      res.status(500).json({
        status: 'error',
        service: 'voca-os',
        timestamp: new Date().toISOString(),
        error: 'Failed to get health status',
        details: error.message
      });
    }
  });

  /**
   * Detailed health check with pool information
   * GET /health/detailed
   */
  router.get('/detailed', (req, res) => {
    try {
      const metrics = poolManager.getAllMetrics();
      
      const detailedHealth = {
        status: 'healthy',
        service: 'voca-os',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        architecture: 'multi-pool-dynamic-characters',
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          nodeVersion: process.version,
          platform: process.platform
        },
        pools: metrics.pools.map(pool => ({
          poolId: pool.poolId,
          status: pool.isInitialized ? 'running' : 'stopped',
          agentPort: pool.agentPort,
          vendorCount: pool.vendorCount,
          maxVendors: pool.maxVendors,
          messageCount: pool.messageCount,
          errorCount: pool.errorCount,
          responseTime: pool.responseTime,
          characterSwitches: pool.characterSwitches,
          elizaosManager: {
            isInitialized: pool.elizaosManager?.isInitialized || false,
            totalAgents: pool.elizaosManager?.totalAgents || 0,
            availableVendors: pool.elizaosManager?.availableVendors || []
          }
        })),
        totals: {
          totalPools: metrics.totalPools,
          totalVendors: metrics.totalVendors,
          totalMessages: metrics.pools.reduce((sum, pool) => sum + pool.messageCount, 0),
          totalErrors: metrics.pools.reduce((sum, pool) => sum + pool.errorCount, 0),
          totalCharacterSwitches: metrics.pools.reduce((sum, pool) => sum + pool.characterSwitches, 0)
        }
      };
      
      res.json(detailedHealth);
    } catch (error) {
      console.error('Error getting detailed health status:', error);
      res.status(500).json({
        status: 'error',
        service: 'voca-os',
        timestamp: new Date().toISOString(),
        error: 'Failed to get detailed health status',
        details: error.message
      });
    }
  });

  /**
   * Service information endpoint
   * GET /health/info
   */
  router.get('/info', (req, res) => {
    res.json({
      service: 'voca-os',
      version: '2.0.0',
      description: 'Voca OS Service - Multi-Pool Architecture with Dynamic Character Loading',
      architecture: 'multi-pool-dynamic-characters',
      features: [
        'Multi-pool agent management',
        'Dynamic character loading',
        'Vendor-specific AI responses',
        'Scalable architecture',
        'Health monitoring',
        'Metrics collection'
      ],
      endpoints: {
        health: '/health',
        detailed: '/health/detailed',
        info: '/health/info',
        vendors: '/vendors',
        messages: '/messages',
        pools: '/pools'
      }
    });
  });

  return router;
}

export { createHealthRoutes };
