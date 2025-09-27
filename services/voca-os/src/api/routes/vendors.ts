import { Router, Request, Response } from 'express';
import { PoolManager } from '../../services/pool-manager.js';
import { AgentConfig, VendorRegistrationRequest, VendorRegistrationResponse } from '../../types/index.js';

/**
 * Create vendor management routes
 * @param vocaAiEngineUrl - URL of the main Voca AI Engine
 * @param poolManager - Pool manager instance
 * @returns Express router with vendor endpoints
 */
export function createVendorRoutes(vocaAiEngineUrl: string, poolManager: PoolManager): Router {
  const router = Router();

  /**
   * Register a new vendor
   */
  router.post('/register', async (req: Request, res: Response): Promise<void> => {
    try {
      const { vendor_id, agent_config }: VendorRegistrationRequest = req.body;

      if (!vendor_id || !agent_config) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'vendor_id and agent_config are required',
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      const result: VendorRegistrationResponse = await poolManager.registerVendor(vendor_id, agent_config);
      
      res.status(201).json({
        success: true,
        message: 'Vendor registered successfully',
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error registering vendor:', error);
      
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Get vendor information
   */
  router.get('/:vendorId', async (req: Request, res: Response): Promise<void> => {
    try {
      const { vendorId } = req.params;
      
      // Get vendor details from cache
      const vendorDetails = poolManager.getSystemMetrics().pools
        .flatMap(pool => pool.vendorCount > 0 ? [{ poolId: pool.poolId, vendorCount: pool.vendorCount }] : [])
        .find(pool => pool.vendorCount > 0);

      if (!vendorDetails) {
        res.status(404).json({
          error: 'Not Found',
          message: `Vendor ${vendorId} not found`,
          timestamp: new Date().toISOString()
        });
        return;
      }

      res.json({
        success: true,
        data: {
          vendorId,
          status: 'active',
          registeredAt: new Date().toISOString(),
          poolId: vendorDetails.poolId
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error getting vendor info:', error);
      
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Remove a vendor
   */
  router.delete('/:vendorId', async (req: Request, res: Response): Promise<void> => {
    try {
      const { vendorId  } = req.params;
      
      const result = await poolManager.removeVendor(vendorId as string);
      
      if (result.success) {
        res.json({
          success: true,
          message: result.message,
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: result.message,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error: any) {
      console.error('Error removing vendor:', error);
      
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * List all vendors
   */
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const systemMetrics = poolManager.getSystemMetrics();
      
      res.json({
        success: true,
        data: {
          totalVendors: systemMetrics.totalVendors,
          totalPools: systemMetrics.totalPools,
          pools: systemMetrics.pools.map(pool => ({
            poolId: pool.poolId,
            vendorCount: pool.vendorCount,
            maxVendors: pool.maxVendors,
            isInitialized: pool.isInitialized
          }))
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error listing vendors:', error);
      
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
