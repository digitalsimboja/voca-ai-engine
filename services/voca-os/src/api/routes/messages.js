import express from 'express';
import axios from 'axios';
import { AgentPoolManager } from '../../services/pool-manager.js';

/**
 * Message routes for processing vendor messages
 */
function createMessageRoutes(VOCA_AI_ENGINE_URL) {
  const poolManager = new AgentPoolManager();
  const router = express.Router();

  /**
   * Process message
   * POST /messages
   */
  router.post('/', async (req, res) => {
    try {
      const { vendor_id, message, platform, user_id } = req.body;
      
      // Validate required fields
      if (!vendor_id || !message || !platform || !user_id) {
        return res.status(400).json({
          error: 'Missing required fields',
          required: ['vendor_id', 'message', 'platform', 'user_id']
        });
      }
      
      console.log(`Processing message for vendor ${vendor_id} on ${platform}`);
      
      const response = await poolManager.routeMessage(vendor_id, message, platform, user_id);
      
      // Notify main engine about message processing
      try {
        await axios.post(`${VOCA_AI_ENGINE_URL}/messages/${vendor_id}/processed`, {
          service: 'voca-os',
          response
        });
      } catch (error) {
        console.error('Failed to notify main engine:', error.message);
      }
      
      res.json(response);
    } catch (error) {
      console.error('Error processing message:', error);
      res.status(500).json({ 
        error: 'Failed to process message', 
        details: error.message 
      });
    }
  });

  /**
   * Get message processing statistics
   * GET /messages/stats
   */
  router.get('/stats', (req, res) => {
    try {
      const metrics = poolManager.getAllMetrics();
      
      // Calculate message processing stats
      const totalMessages = metrics.pools.reduce((sum, pool) => sum + pool.messageCount, 0);
      const totalErrors = metrics.pools.reduce((sum, pool) => sum + pool.errorCount, 0);
      const avgResponseTime = metrics.pools.reduce((sum, pool) => sum + pool.responseTime, 0) / metrics.pools.length;
      
      res.json({
        totalMessages,
        totalErrors,
        averageResponseTime: avgResponseTime,
        totalPools: metrics.totalPools,
        totalVendors: metrics.totalVendors,
        pools: metrics.pools.map(pool => ({
          poolId: pool.poolId,
          messageCount: pool.messageCount,
          errorCount: pool.errorCount,
          responseTime: pool.responseTime,
          vendorCount: pool.vendorCount
        }))
      });
    } catch (error) {
      console.error('Error getting message stats:', error);
      res.status(500).json({ 
        error: 'Failed to get message statistics', 
        details: error.message 
      });
    }
  });

  return router;
}

export { createMessageRoutes };
