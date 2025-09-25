import { Application } from 'express';
import { createHealthRoutes } from './health.js';
import { createVendorRoutes } from './vendors.js';
import { createMessageRoutes } from './messages.js';
import { createPoolRoutes } from './pools.js';
import { PoolManager } from '../../services/pool-manager.js';

/**
 * Setup all API routes for the Voca OS service
 * @param app - Express application instance
 * @param urlPrefix - URL prefix for all routes
 * @param vocaAiEngineUrl - URL of the main Voca AI Engine
 */
export function setupRoutes(app: Application, urlPrefix: string, vocaAiEngineUrl: string): void {
  console.log('Setting up Voca OS API routes...');
  
  // Initialize pool manager
  const poolManager = new PoolManager();
  
  // Initialize pool manager asynchronously
  poolManager.initialize().then((success) => {
    if (success) {
      console.log('Pool Manager initialized successfully');
    } else {
      console.error('Failed to initialize Pool Manager');
    }
  }).catch((error) => {
    console.error('Error initializing Pool Manager:', error);
  });

  // Health check routes
  app.use(`${urlPrefix}/health`, createHealthRoutes(poolManager));

  // Vendor management routes
  app.use(`${urlPrefix}/vendors`, createVendorRoutes(vocaAiEngineUrl, poolManager));

  // Message processing routes
  app.use(`${urlPrefix}/messages`, createMessageRoutes(vocaAiEngineUrl, poolManager));

  // Pool management routes
  app.use(`${urlPrefix}/pools`, createPoolRoutes(poolManager));

  // Root endpoint
  app.get(urlPrefix, (req, res) => {
    res.json({
      service: 'Voca OS',
      version: '1.0.0',
      status: 'running',
      description: 'Multi-Pool Architecture with Dynamic Character Loading',
      endpoints: {
        health: `${urlPrefix}/health`,
        vendors: `${urlPrefix}/vendors`,
        messages: `${urlPrefix}/messages`,
        pools: `${urlPrefix}/pools`
      },
      timestamp: new Date().toISOString()
    });
  });

  // 404 handler for undefined routes
  app.use(`${urlPrefix}/*`, (req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.method} ${req.originalUrl} not found`,
      availableEndpoints: [
        `${urlPrefix}/health`,
        `${urlPrefix}/vendors`,
        `${urlPrefix}/messages`,
        `${urlPrefix}/pools`
      ],
      timestamp: new Date().toISOString()
    });
  });

  console.log('All API routes configured successfully');
}
