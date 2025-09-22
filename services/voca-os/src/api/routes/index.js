import { createVendorRoutes } from './vendors.js';
import { createMessageRoutes } from './messages.js';
import { createPoolRoutes } from './pools.js';
import { createHealthRoutes } from './health.js';

/**
 * Main routes configuration
 * Sets up all route modules with proper middleware and error handling
 */
function setupRoutes(app, URL_PREFIX, VOCA_AI_ENGINE_URL) {
  // Create route instances
  const vendorRoutes = createVendorRoutes(VOCA_AI_ENGINE_URL);
  const messageRoutes = createMessageRoutes(VOCA_AI_ENGINE_URL);
  const poolRoutes = createPoolRoutes();
  const healthRoutes = createHealthRoutes();

  // Mount routes with URL prefix
  app.use(`${URL_PREFIX}/vendors`, vendorRoutes);
  app.use(`${URL_PREFIX}/messages`, messageRoutes);
  app.use(`${URL_PREFIX}/pools`, poolRoutes);
  app.use(`${URL_PREFIX}/health`, healthRoutes);

  // Root endpoint with API documentation
  app.get('/', (req, res) => {
    res.json({
      message: 'Voca OS Service - Multi-Pool Architecture with Dynamic Character Loading',
      version: '2.0.0',
      architecture: 'multi-pool-dynamic-characters',
      documentation: {
        health: {
          endpoint: `${URL_PREFIX}/health`,
          description: 'Service health check and metrics',
          methods: ['GET']
        },
        vendors: {
          endpoint: `${URL_PREFIX}/vendors`,
          description: 'Vendor character management',
          methods: ['POST', 'DELETE', 'GET']
        },
        messages: {
          endpoint: `${URL_PREFIX}/messages`,
          description: 'Message processing and statistics',
          methods: ['POST', 'GET']
        },
        pools: {
          endpoint: `${URL_PREFIX}/pools`,
          description: 'Agent pool management and monitoring',
          methods: ['GET', 'POST']
        }
      },
      endpoints: {
        [`GET ${URL_PREFIX}/health`]: 'Health check with pool metrics',
        [`GET ${URL_PREFIX}/health/detailed`]: 'Detailed health information',
        [`GET ${URL_PREFIX}/health/info`]: 'Service information',
        [`POST ${URL_PREFIX}/vendors`]: 'Register vendor character',
        [`DELETE ${URL_PREFIX}/vendors/:vendor_id`]: 'Remove vendor character',
        [`GET ${URL_PREFIX}/vendors/:vendor_id/status`]: 'Get vendor status',
        [`POST ${URL_PREFIX}/messages`]: 'Process message',
        [`GET ${URL_PREFIX}/messages/stats`]: 'Get message processing statistics',
        [`GET ${URL_PREFIX}/pools`]: 'Get all pool metrics',
        [`POST ${URL_PREFIX}/pools`]: 'Create new agent pool',
        [`GET ${URL_PREFIX}/pools/:pool_id`]: 'Get specific pool details',
        [`GET ${URL_PREFIX}/pools/:pool_id/metrics`]: 'Get pool performance metrics',
        [`GET ${URL_PREFIX}/pools/:pool_id/vendors`]: 'Get pool vendors'
      }
    });
  });

  // 404 handler for undefined routes
  app.use('*', (req, res) => {
    res.status(404).json({
      error: 'Route not found',
      message: `The requested route ${req.method} ${req.originalUrl} was not found`,
      availableRoutes: [
        'GET /',
        `GET ${URL_PREFIX}/health`,
        `POST ${URL_PREFIX}/vendors`,
        `POST ${URL_PREFIX}/messages`,
        `GET ${URL_PREFIX}/pools`
      ]
    });
  });

  // Global error handler
  app.use((error, req, res, next) => {
    console.error('Global error handler:', error);
    
    res.status(error.status || 500).json({
      error: 'Internal server error',
      message: error.message || 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method
    });
  });
}

export { setupRoutes };
