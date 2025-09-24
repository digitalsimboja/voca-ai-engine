import { Router, Request, Response } from 'express';
import { PoolManager } from '../../services/pool-manager.js';

/**
 * Create health check routes
 * @param poolManager - Pool manager instance
 * @returns Express router with health endpoints
 */
export function createHealthRoutes(poolManager: PoolManager): Router {
  const router = Router();

  /**
   * Basic health check endpoint
   */
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const status = poolManager.getStatus();
      
      res.json({
        status: 'healthy',
        service: 'Voca OS',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        poolManager: {
          isInitialized: status.isInitialized,
          activePools: status.activePools,
          maxPools: status.maxPools,
          maxVendorsPerPool: status.maxVendorsPerPool
        }
      });
    } catch (error: any) {
      res.status(500).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Detailed health check endpoint
   */
  router.get('/detailed', async (req: Request, res: Response): Promise<void> => {
    try {
      const status = poolManager.getStatus();
      const systemMetrics = status.systemMetrics;
      
      res.json({
        status: 'healthy',
        service: 'Voca OS',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          pid: process.pid
        },
        poolManager: {
          isInitialized: status.isInitialized,
          activePools: status.activePools,
          maxPools: status.maxPools,
          maxVendorsPerPool: status.maxVendorsPerPool
        },
        systemMetrics: {
          totalPools: systemMetrics.totalPools,
          totalVendors: systemMetrics.totalVendors,
          totalMessages: systemMetrics.totalMessages,
          totalErrors: systemMetrics.totalErrors,
          averageResponseTime: systemMetrics.averageResponseTime
        },
        pools: systemMetrics.pools.map(pool => ({
          poolId: pool.poolId,
          isInitialized: pool.isInitialized,
          vendorCount: pool.vendorCount,
          maxVendors: pool.maxVendors,
          messageCount: pool.messageCount,
          errorCount: pool.errorCount,
          responseTime: pool.responseTime
        }))
      });
    } catch (error: any) {
      res.status(500).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Readiness check endpoint
   */
  router.get('/ready', async (req: Request, res: Response): Promise<void> => {
    try {
      const status = poolManager.getStatus();
      
      if (status.isInitialized && status.activePools > 0) {
        res.json({
          status: 'ready',
          message: 'Service is ready to accept requests',
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(503).json({
          status: 'not_ready',
          message: 'Service is not ready to accept requests',
          poolManager: {
            isInitialized: status.isInitialized,
            activePools: status.activePools
          },
          timestamp: new Date().toISOString()
        });
      }
    } catch (error: any) {
      res.status(503).json({
        status: 'not_ready',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Liveness check endpoint
   */
  router.get('/live', (req: Request, res: Response): void => {
    res.json({
      status: 'alive',
      message: 'Service is alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  return router;
}
