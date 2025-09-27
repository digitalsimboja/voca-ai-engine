import dotenv from 'dotenv';
import express from 'express';
import { setupRoutes } from './src/api/routes/index.js';
import { PoolManager } from './src/services/pool-manager.js';
import { HealthMonitor } from './src/monitoring/health-monitor.js';
import { GracefulShutdown } from './src/monitoring/graceful-shutdown.js';
import { MemoryManager } from './src/monitoring/memory-manager.js';
import { ErrorHandler } from './src/monitoring/error-handler.js';
import { RateLimiter, RateLimitPresets } from './src/middleware/rate-limiter.js';

dotenv.config();

const app = express();
const PORT = process.env['PORT'] || 5001;
const URL_PREFIX = process.env['URL_PREFIX'] || '/voca-os/api/v1';
const VOCA_AI_ENGINE_URL = process.env['VOCA_AI_ENGINE_URL'] || 'http://voca-ai-engine:5008/voca-engine/api/v1';
const NODE_ENV = process.env['NODE_ENV'] || 'development';

// Initialize core services
const poolManager = new PoolManager();
const healthMonitor = new HealthMonitor(poolManager);
const memoryManager = new MemoryManager(poolManager, {
  maxHeapSize: parseInt(process.env['MAX_HEAP_SIZE_MB'] || '1024'),
  warningThreshold: parseFloat(process.env['MEMORY_WARNING_THRESHOLD'] || '0.7'),
  criticalThreshold: parseFloat(process.env['MEMORY_CRITICAL_THRESHOLD'] || '0.85'),
  maxVendorsPerPool: parseInt(process.env['MAX_VENDORS_PER_POOL'] || '1000'),
  maxTotalVendors: parseInt(process.env['MAX_TOTAL_VENDORS'] || '5000')
});
const errorHandler = new ErrorHandler(poolManager);
const gracefulShutdown = new GracefulShutdown(poolManager, healthMonitor, {
  timeout: parseInt(process.env['SHUTDOWN_TIMEOUT_MS'] || '30000'),
  forceExit: process.env['FORCE_EXIT_ON_SHUTDOWN'] !== 'false'
});

// Rate limiters
const globalRateLimiter = RateLimitPresets.moderate();
const messageRateLimiter = RateLimitPresets.messageProcessing();
const vendorRateLimiter = RateLimitPresets.perVendor();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Global rate limiting
app.use(globalRateLimiter.middleware());

// Health check endpoint (no rate limiting)
app.get('/health', (req, res) => {
  const health = healthMonitor.getHealthMetrics();
  const memoryStats = memoryManager.getMemoryStats();
  const errorStats = errorHandler.getErrorStats();
  
  res.json({
    status: health.status,
    timestamp: health.timestamp,
    uptime: health.uptime,
    memory: memoryStats,
    errors: errorStats,
    recommendations: healthMonitor.getResourceRecommendations()
  });
});

// Memory management endpoint
app.get('/memory', (req, res) => {
  const memoryHealth = memoryManager.getMemoryHealth();
  res.json(memoryHealth);
});

// Error statistics endpoint
app.get('/errors', (req, res) => {
  const errorStats = errorHandler.getErrorStats();
  const recentErrors = errorHandler.getAllErrors().slice(-10);
  res.json({
    stats: errorStats,
    recent: recentErrors
  });
});

// Setup API routes with rate limiting
setupRoutes(app, URL_PREFIX, VOCA_AI_ENGINE_URL);

// Apply specific rate limiting to message processing
app.use(`${URL_PREFIX}/messages`, messageRateLimiter.middleware());
app.use(`${URL_PREFIX}/vendors`, vendorRateLimiter.middleware());

// Error handling middleware (must be last)
app.use(errorHandler.middleware());

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// Initialize the service
async function startService(): Promise<void> {
  console.log('🚀 Starting Voca OS Service (Production Mode)...');
  console.log(`Environment: ${NODE_ENV}`);
  console.log(`Port: ${PORT}`);
  console.log(`URL Prefix: ${URL_PREFIX}`);
  console.log(`Main Engine URL: ${VOCA_AI_ENGINE_URL}`);
  
  try {
    // Initialize pool manager
    console.log('📊 Initializing Pool Manager...');
    const poolInitSuccess = await poolManager.initialize();
    if (!poolInitSuccess) {
      throw new Error('Failed to initialize Pool Manager');
    }
    console.log('✅ Pool Manager initialized successfully');

    // Start memory monitoring
    console.log('🧠 Starting memory monitoring...');
    memoryManager.startMonitoring(30000); // Check every 30 seconds
    console.log('✅ Memory monitoring started');

    // Add cleanup tasks for graceful shutdown
    gracefulShutdown.addCleanupTask(async () => {
      console.log('🧹 Cleaning up memory manager...');
      memoryManager.stopMonitoring();
    });

    gracefulShutdown.addCleanupTask(async () => {
      console.log('🧹 Clearing old errors...');
      const cleared = errorHandler.clearOldErrors();
      console.log(`Cleared ${cleared} old error records`);
    });

    // Start the Express server
    const server = app.listen(PORT, () => {
      console.log('🌐 Voca OS service running on port', PORT);
      console.log(`📡 API endpoints available at: http://localhost:${PORT}${URL_PREFIX}`);
      console.log('🔍 Health check available at: http://localhost:${PORT}/health');
      console.log('📊 Memory stats available at: http://localhost:${PORT}/memory');
      console.log('🚨 Error stats available at: http://localhost:${PORT}/errors');
      
      // Log initial health status
      const initialHealth = healthMonitor.getHealthMetrics();
      console.log(`💚 Initial health status: ${initialHealth.status}`);
      console.log(`🧠 Initial memory usage: ${memoryManager.getMemoryStats().heapUsed}MB`);
    });

    // Store server reference for graceful shutdown
    gracefulShutdown.addCleanupTask(async () => {
      console.log('🛑 Closing HTTP server...');
      return new Promise<void>((resolve) => {
        server.close(() => {
          console.log('✅ HTTP server closed');
          resolve();
        });
      });
    });

    // Log startup completion
    console.log('🎉 Voca OS Service started successfully!');
    console.log('📋 Production features enabled:');
    console.log('  ✅ Health monitoring');
    console.log('  ✅ Memory management');
    console.log('  ✅ Error handling & recovery');
    console.log('  ✅ Rate limiting');
    console.log('  ✅ Graceful shutdown');
    console.log('  ✅ Process monitoring');

  } catch (error: any) {
    console.error('❌ Failed to start service:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  gracefulShutdown.shutdown('uncaughtException', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown.shutdown('unhandledRejection', reason);
});

// Start the service
startService().catch((error: Error) => {
  console.error('💥 Failed to start service:', error);
  process.exit(1);
});

// Export for testing
export { app, poolManager, healthMonitor, memoryManager, errorHandler };
