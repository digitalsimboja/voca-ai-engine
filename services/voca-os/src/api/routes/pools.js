import express from 'express';
import { AgentPoolManager } from '../../services/pool-manager.js';

/**
 * Pool routes for managing agent pools
 */
function createPoolRoutes() {
  const router = express.Router();
  const poolManager = new AgentPoolManager();

  /**
   * Get all pool metrics
   * GET /pools
   */
  router.get('/', (req, res) => {
    try {
      const metrics = poolManager.getAllMetrics();
      res.json(metrics);
    } catch (error) {
      console.error('Error getting pool metrics:', error);
      res.status(500).json({ 
        error: 'Failed to get pool metrics', 
        details: error.message 
      });
    }
  });

  /**
   * Create new agent pool
   * POST /pools
   */
  router.post('/', async (req, res) => {
    try {
      const { pool_id } = req.body;
      
      console.log(`Creating new agent pool: ${pool_id || 'auto-generated'}`);
      
      const pool = await poolManager.createPool(pool_id);
      
      res.json({
        success: true,
        pool: {
          poolId: pool.poolId,
          maxVendors: pool.maxVendors,
          vendorCount: pool.activeVendors.size,
          isInitialized: pool.isInitialized
        }
      });
    } catch (error) {
      console.error('Error creating pool:', error);
      res.status(500).json({ 
        error: 'Failed to create pool', 
        details: error.message 
      });
    }
  });

  /**
   * Get specific pool details
   * GET /pools/:pool_id
   */
  router.get('/:pool_id', (req, res) => {
    try {
      const { pool_id } = req.params;
      
      const pool = poolManager.getPool(pool_id);
      if (!pool) {
        return res.status(404).json({ error: 'Pool not found' });
      }
      
      res.json({
        poolId: pool.poolId,
        maxVendors: pool.maxVendors,
        vendorCount: pool.activeVendors.size,
        isInitialized: pool.isInitialized,
        metrics: pool.getMetrics()
      });
    } catch (error) {
      console.error('Error getting pool details:', error);
      res.status(500).json({ 
        error: 'Failed to get pool details', 
        details: error.message 
      });
    }
  });

  /**
   * Get pool performance metrics
   * GET /pools/:pool_id/metrics
   */
  router.get('/:pool_id/metrics', (req, res) => {
    try {
      const { pool_id } = req.params;
      
      const pool = poolManager.getPool(pool_id);
      if (!pool) {
        return res.status(404).json({ error: 'Pool not found' });
      }
      
      res.json(pool.getMetrics());
    } catch (error) {
      console.error('Error getting pool metrics:', error);
      res.status(500).json({ 
        error: 'Failed to get pool metrics', 
        details: error.message 
      });
    }
  });

  /**
   * Get pool vendors
   * GET /pools/:pool_id/vendors
   */
  router.get('/:pool_id/vendors', (req, res) => {
    try {
      const { pool_id } = req.params;
      
      const pool = poolManager.getPool(pool_id);
      if (!pool) {
        return res.status(404).json({ error: 'Pool not found' });
      }
      
      const vendors = Array.from(pool.activeVendors.keys()).map(vendorId => {
        const vendorData = pool.activeVendors.get(vendorId);
        const characterConfig = pool.elizaosManager.characters.get(vendorId);
        return {
          vendor_id: vendorId,
          character: characterConfig?.name || vendorId,
          registered_at: vendorData.registeredAt
        };
      });
      
      res.json({
        poolId: pool_id,
        vendorCount: vendors.length,
        vendors
      });
    } catch (error) {
      console.error('Error getting pool vendors:', error);
      res.status(500).json({ 
        error: 'Failed to get pool vendors', 
        details: error.message 
      });
    }
  });

  return router;
}

export { createPoolRoutes };
