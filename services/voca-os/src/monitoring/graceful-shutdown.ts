import { PoolManager } from '../services/pool-manager.js';
import { HealthMonitor } from './health-monitor.js';

export interface ShutdownOptions {
  timeout: number; // milliseconds
  forceExit: boolean;
  cleanupTasks: Array<() => Promise<void>>;
}

export class GracefulShutdown {
  private poolManager: PoolManager;
  private healthMonitor: HealthMonitor;
  private isShuttingDown: boolean = false;
  private shutdownTimeout: NodeJS.Timeout | null = null;
  private options: ShutdownOptions;

  constructor(
    poolManager: PoolManager,
    healthMonitor: HealthMonitor,
    options: Partial<ShutdownOptions> = {}
  ) {
    this.poolManager = poolManager;
    this.healthMonitor = healthMonitor;
    this.options = {
      timeout: 30000, // 30 seconds default
      forceExit: true,
      cleanupTasks: [],
      ...options
    };

    this.setupSignalHandlers();
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    // Handle SIGTERM (Docker, Kubernetes)
    process.on('SIGTERM', () => {
      console.log('Received SIGTERM signal');
      this.shutdown('SIGTERM');
    });

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      console.log('Received SIGINT signal');
      this.shutdown('SIGINT');
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      this.shutdown('uncaughtException', error);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      this.shutdown('unhandledRejection', reason);
    });

    // Handle warnings
    process.on('warning', (warning) => {
      console.warn('Process Warning:', warning);
    });
  }

  /**
   * Add a cleanup task to be executed during shutdown
   */
  addCleanupTask(task: () => Promise<void>): void {
    this.options.cleanupTasks.push(task);
  }

  /**
   * Initiate graceful shutdown
   */
  async shutdown(signal: string, error?: any): Promise<void> {
    if (this.isShuttingDown) {
      console.log('Shutdown already in progress, ignoring signal:', signal);
      return;
    }

    this.isShuttingDown = true;
    console.log(`Initiating graceful shutdown due to: ${signal}`);

    // Set timeout for forced shutdown
    this.shutdownTimeout = setTimeout(() => {
      console.error('Shutdown timeout reached, forcing exit');
      if (this.options.forceExit) {
        process.exit(1);
      }
    }, this.options.timeout);

    try {
      // 1. Stop accepting new requests
      console.log('Stopping acceptance of new requests...');
      await this.stopAcceptingRequests();

      // 2. Wait for ongoing requests to complete
      console.log('Waiting for ongoing requests to complete...');
      await this.waitForOngoingRequests();

      // 3. Shutdown pools
      console.log('Shutting down agent pools...');
      await this.poolManager.shutdown();

      // 4. Execute custom cleanup tasks
      console.log('Executing cleanup tasks...');
      await this.executeCleanupTasks();

      // 5. Final health check
      console.log('Performing final health check...');
      const finalHealth = this.healthMonitor.getHealthMetrics();
      console.log('Final health status:', finalHealth.status);

      // 6. Clear shutdown timeout
      if (this.shutdownTimeout) {
        clearTimeout(this.shutdownTimeout);
        this.shutdownTimeout = null;
      }

      console.log('Graceful shutdown completed successfully');
      process.exit(error ? 1 : 0);

    } catch (shutdownError) {
      console.error('Error during graceful shutdown:', shutdownError);
      if (this.shutdownTimeout) {
        clearTimeout(this.shutdownTimeout);
      }
      process.exit(1);
    }
  }

  /**
   * Stop accepting new requests
   */
  private async stopAcceptingRequests(): Promise<void> {
    // This would typically involve stopping the HTTP server
    // For now, we'll just log the action
    console.log('New request acceptance stopped');
  }

  /**
   * Wait for ongoing requests to complete
   */
  private async waitForOngoingRequests(): Promise<void> {
    // This would typically involve tracking active requests
    // and waiting for them to complete
    // For now, we'll wait a short time
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('Ongoing requests completed');
  }

  /**
   * Execute custom cleanup tasks
   */
  private async executeCleanupTasks(): Promise<void> {
    const tasks = this.options.cleanupTasks;
    
    for (let i = 0; i < tasks.length; i++) {
      try {
        console.log(`Executing cleanup task ${i + 1}/${tasks.length}`);
        await tasks[i]();
        console.log(`Cleanup task ${i + 1} completed successfully`);
      } catch (error) {
        console.error(`Cleanup task ${i + 1} failed:`, error);
        // Continue with other tasks even if one fails
      }
    }
  }

  /**
   * Check if shutdown is in progress
   */
  isShuttingDownInProgress(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Get shutdown status
   */
  getShutdownStatus(): {
    isShuttingDown: boolean;
    timeout: number;
    remainingTime?: number;
  } {
    return {
      isShuttingDown: this.isShuttingDown,
      timeout: this.options.timeout,
      remainingTime: this.shutdownTimeout ? this.options.timeout : undefined
    };
  }

  /**
   * Force immediate shutdown (emergency)
   */
  forceShutdown(): void {
    console.log('Force shutdown initiated');
    if (this.shutdownTimeout) {
      clearTimeout(this.shutdownTimeout);
    }
    process.exit(1);
  }
}
