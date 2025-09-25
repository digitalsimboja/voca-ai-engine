import { Router, Request, Response } from 'express';
import { PoolManager } from '../../services/pool-manager.js';

/**
 * Create pool management routes
 * @param poolManager - Pool manager instance
 * @returns Express router with pool endpoints
 */
export function createPoolRoutes(poolManager: PoolManager): Router {
  const router = Router();

  /**
   * Get all pools
   */
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const pools = poolManager.getAllPools();
      
      res.json({
        success: true,
        data: {
          pools: pools.map(pool => ({
            poolId: pool.poolId,
            isInitialized: pool.isInitialized,
            vendorCount: pool.vendorCount,
            maxVendors: pool.maxVendors,
            messageCount: pool.messageCount,
            errorCount: pool.errorCount,
            responseTime: pool.responseTime,
            characterSwitches: pool.characterSwitches
          }))
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error getting pools:', error);
      
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Get specific pool information
   */
  router.get('/:poolId', async (req: Request, res: Response): Promise<void> => {
    try {
      const { poolId } = req.params;
      const pool = poolManager.getPool(poolId as string);
      
      if (!pool) {
        res.status(404).json({
          error: 'Not Found',
          message: `Pool ${poolId} not found`,
          timestamp: new Date().toISOString()
        });
        return;
      }

      const metrics = pool.getMetrics();
      
      res.json({
        success: true,
        data: {
          poolId: metrics.poolId,
          isInitialized: metrics.isInitialized,
          vendorCount: metrics.vendorCount,
          maxVendors: metrics.maxVendors,
          messageCount: metrics.messageCount,
          errorCount: metrics.errorCount,
          responseTime: metrics.responseTime,
          characterSwitches: metrics.characterSwitches,
          elizaosManager: metrics.elizaosManager
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error getting pool info:', error);
      
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Create a new pool
   */
  router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const { poolId, maxVendors } = req.body;

      if (!poolId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'poolId is required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const pool = await poolManager.createPool(poolId, maxVendors);
      const metrics = pool.getMetrics();
      
      res.status(201).json({
        success: true,
        message: 'Pool created successfully',
        data: {
          poolId: metrics.poolId,
          isInitialized: metrics.isInitialized,
          maxVendors: metrics.maxVendors,
          vendorCount: metrics.vendorCount
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error creating pool:', error);
      
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Get system metrics
   */
  router.get('/metrics/system', async (req: Request, res: Response): Promise<void> => {
    try {
      const systemMetrics = poolManager.getSystemMetrics();
      
      res.json({
        success: true,
        data: {
          totalPools: systemMetrics.totalPools,
          totalVendors: systemMetrics.totalVendors,
          totalMessages: systemMetrics.totalMessages,
          totalErrors: systemMetrics.totalErrors,
          averageResponseTime: systemMetrics.averageResponseTime,
          pools: systemMetrics.pools.map(pool => ({
            poolId: pool.poolId,
            isInitialized: pool.isInitialized,
            vendorCount: pool.vendorCount,
            maxVendors: pool.maxVendors,
            messageCount: pool.messageCount,
            errorCount: pool.errorCount,
            responseTime: pool.responseTime,
            characterSwitches: pool.characterSwitches
          }))
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error getting system metrics:', error);
      
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Get pool manager status
   */
  router.get('/status', async (req: Request, res: Response): Promise<void> => {
    try {
      const status = poolManager.getStatus();
      
      res.json({
        success: true,
        data: {
          isInitialized: status.isInitialized,
          maxPools: status.maxPools,
          maxVendorsPerPool: status.maxVendorsPerPool,
          activePools: status.activePools,
          systemMetrics: {
            totalPools: status.systemMetrics.totalPools,
            totalVendors: status.systemMetrics.totalVendors,
            totalMessages: status.systemMetrics.totalMessages,
            totalErrors: status.systemMetrics.totalErrors,
            averageResponseTime: status.systemMetrics.averageResponseTime
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error getting pool manager status:', error);
      
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  return router;
}
