import express from 'express';
import { setupRoutes } from './src/api/routes/index.js';

const app = express();
const PORT = process.env.PORT || 5001;
const URL_PREFIX = process.env.URL_PREFIX || '/voca-os/api/v1';
const VOCA_AI_ENGINE_URL = process.env.VOCA_AI_ENGINE_URL || 'http://voca-ai-engine:5008/voca-engine/api/v1';

// Middleware
app.use(express.json());

// Setup all routes (pool manager is initialized within the routes)
setupRoutes(app, URL_PREFIX, VOCA_AI_ENGINE_URL);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Initialize the service
async function startService() {
  console.log('Starting Voca OS Service with ElizaOS Runtime Integration...');
  
  // Start the Express server
  app.listen(PORT, () => {
    console.log(`Voca OS service running on port ${PORT} with ElizaOS runtime integration`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Main engine URL: ${VOCA_AI_ENGINE_URL}`);
    console.log(`API endpoints available at: http://localhost:${PORT}${URL_PREFIX}`);
  });
}

// Start the service
startService().catch(error => {
  console.error('Failed to start service:', error);
  process.exit(1);
});
