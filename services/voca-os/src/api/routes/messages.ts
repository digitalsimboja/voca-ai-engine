import { Router, Request, Response } from 'express';
import { PoolManager } from '../../services/pool-manager.js';
import { MessageRequest, MessageResponse } from '../../types/index.js';

/**
 * Create message processing routes
 * @param vocaAiEngineUrl - URL of the main Voca AI Engine
 * @param poolManager - Pool manager instance
 * @returns Express router with message endpoints
 */
export function createMessageRoutes(vocaAiEngineUrl: string, poolManager: PoolManager): Router {
  const router = Router();

  /**
   * Process a message for a vendor
   */
  router.post('/process', async (req: Request, res: Response): Promise<void> => {
    try {
      const { vendor_id, message, platform = 'whatsapp', user_id = 'user' }: MessageRequest = req.body;

      if (!vendor_id || !message) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'vendor_id and message are required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      console.log(`Processing message for vendor: ${vendor_id}, platform: ${platform}, user: ${user_id}`);
      console.log(`Message: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`);
      
      const result: MessageResponse = await poolManager.processMessage(vendor_id, message, platform, user_id);
      
      res.json({
        success: true,
        message: 'Message processed successfully',
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error processing message:', error);
      
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Get message processing statistics
   */
  router.get('/stats', async (req: Request, res: Response): Promise<void> => {
    try {
      const systemMetrics = poolManager.getSystemMetrics();
      
      res.json({
        success: true,
        data: {
          totalMessages: systemMetrics.totalMessages,
          totalErrors: systemMetrics.totalErrors,
          averageResponseTime: systemMetrics.averageResponseTime,
          totalVendors: systemMetrics.totalVendors,
          totalPools: systemMetrics.totalPools,
          pools: systemMetrics.pools.map(pool => ({
            poolId: pool.poolId,
            messageCount: pool.messageCount,
            errorCount: pool.errorCount,
            responseTime: pool.responseTime,
            vendorCount: pool.vendorCount
          }))
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error getting message stats:', error);
      
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Health check for message processing
   */
  router.get('/health', async (req: Request, res: Response): Promise<void> => {
    try {
      const status = poolManager.getStatus();
      
      if (status.isInitialized && status.activePools > 0) {
        res.json({
          status: 'healthy',
          message: 'Message processing is operational',
          pools: status.activePools,
          vendors: status.systemMetrics.totalVendors,
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(503).json({
          status: 'unhealthy',
          message: 'Message processing is not operational',
          poolManager: {
            isInitialized: status.isInitialized,
            activePools: status.activePools
          },
          timestamp: new Date().toISOString()
        });
      }
    } catch (error: any) {
      res.status(503).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  return router;
}
