import express from 'express';
import { AgentPoolManager } from '../../services/pool-manager.js';

/**
 * Vendor routes for managing vendor characters and status
 */
function createVendorRoutes(VOCA_AI_ENGINE_URL) {

  const poolManager = new AgentPoolManager();
  const router = express.Router();

  /**
   * Register vendor character
   * POST /vendors (root endpoint)
   */
  router.post('/', async (req, res) => {
    try {
      const { vendor_id, agent_config } = req.body;

      console.log('Agent config received:', JSON.stringify(agent_config, null, 2));
      
      const result = await poolManager.assignVendor(vendor_id, agent_config);

      console.log('Vendor registered:', JSON.stringify(result, null, 2));

      res.json({
        success: true,
        vendor: result
      });
    } catch (error) {
      console.error('Error registering vendor:', error);
      res.status(500).json({ 
        error: 'Failed to register vendor', 
        details: error.message 
      });
    }
  });

  /**
   * Remove vendor character
   * DELETE /vendors/:vendor_id
   */
  router.delete('/:vendor_id', async (req, res) => {
    try {
      const { vendor_id } = req.params;
      
      console.log(`Removing vendor character: ${vendor_id}`);
      
      const result = await poolManager.removeVendor(vendor_id);
      
      // Notify main engine about vendor removal
      try {
        await fetch(`${VOCA_AI_ENGINE_URL}/agents/${vendor_id}/status`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            service: 'voca-os',
            status: 'removed',
            removed_at: new Date().toISOString()
          })
        });
      } catch (error) {
        console.error('Failed to notify main engine:', error.message);
      }
      
      res.json(result);
    } catch (error) {
      console.error('Error removing vendor:', error);
      res.status(500).json({ 
        error: 'Failed to remove vendor', 
        details: error.message 
      });
    }
  });

  /**
   * Get vendor status
   * GET /vendors/:vendor_id/status
   */
  router.get('/:vendor_id/status', (req, res) => {
    const { vendor_id } = req.params;
    
    const status = poolManager.getVendorStatus(vendor_id);
    if (!status) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    
    res.json(status);
  });

  return router;
}

export { createVendorRoutes };
