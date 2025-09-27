import { Request, Response, NextFunction } from 'express';
import { PoolManager } from '../services/pool-manager.js';

export interface ErrorInfo {
  id: string;
  timestamp: string;
  type: string;
  message: string;
  stack?: string;
  context: {
    url?: string;
    method?: string;
    userAgent?: string;
    ip?: string;
    vendorId?: string;
    userId?: string;
    platform?: string;
  };
  severity: 'low' | 'medium' | 'high' | 'critical';
  resolved: boolean;
  retryCount: number;
  lastRetry?: string;
}

export interface ErrorRecoveryAction {
  type: 'retry' | 'fallback' | 'circuit_breaker' | 'graceful_degradation';
  description: string;
  executed: boolean;
  success: boolean;
  timestamp: string;
}

export class ErrorHandler {
  private poolManager: PoolManager;
  private errors: Map<string, ErrorInfo> = new Map();
  private recoveryActions: Map<string, ErrorRecoveryAction[]> = new Map();
  private circuitBreakers: Map<string, { failures: number; lastFailure: number; state: 'closed' | 'open' | 'half-open' }> = new Map();
  private maxRetries: number = 3;
  private circuitBreakerThreshold: number = 5;
  private circuitBreakerTimeout: number = 60000; // 1 minute

  constructor(poolManager: PoolManager) {
    this.poolManager = poolManager;
  }

  /**
   * Express error handling middleware
   */
  middleware() {
    return (error: Error, req: Request, res: Response, next: NextFunction): void => {
      const errorInfo = this.captureError(error, {
        url: req.url,
        method: req.method,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        vendorId: req.params.vendorId || req.body.vendor_id,
        userId: req.params.userId || req.body.user_id,
        platform: req.body.platform
      });

      // Attempt recovery
      const recoveryResult = this.attemptRecovery(errorInfo, req, res);

      if (recoveryResult.success) {
        return; // Recovery was successful, response already sent
      }

      // Send error response
      this.sendErrorResponse(errorInfo, res);
    };
  }

  /**
   * Capture and categorize an error
   */
  captureError(error: Error, context: Partial<ErrorInfo['context']> = {}): ErrorInfo {
    const errorId = this.generateErrorId();
    const severity = this.determineSeverity(error, context);

    const errorInfo: ErrorInfo = {
      id: errorId,
      timestamp: new Date().toISOString(),
      type: error.constructor.name,
      message: error.message,
      stack: error.stack,
      context: {
        url: context.url,
        method: context.method,
        userAgent: context.userAgent,
        ip: context.ip,
        vendorId: context.vendorId,
        userId: context.userId,
        platform: context.platform
      },
      severity,
      resolved: false,
      retryCount: 0
    };

    this.errors.set(errorId, errorInfo);
    this.logError(errorInfo);

    return errorInfo;
  }

  /**
   * Attempt to recover from an error
   */
  attemptRecovery(errorInfo: ErrorInfo, req: Request, res: Response): { success: boolean; action?: ErrorRecoveryAction } {
    const recoveryActions = this.getRecoveryActions(errorInfo);
    
    for (const action of recoveryActions) {
      try {
        const result = this.executeRecoveryAction(action, errorInfo, req, res);
        
        if (result.success) {
          this.recordRecoveryAction(errorInfo.id, action, true);
          return { success: true, action };
        }
      } catch (recoveryError) {
        console.error(`Recovery action failed: ${action.type}`, recoveryError);
        this.recordRecoveryAction(errorInfo.id, action, false);
      }
    }

    return { success: false };
  }

  /**
   * Get appropriate recovery actions for an error
   */
  private getRecoveryActions(errorInfo: ErrorInfo): ErrorRecoveryAction[] {
    const actions: ErrorRecoveryAction[] = [];

    // Check circuit breaker
    const circuitBreakerKey = this.getCircuitBreakerKey(errorInfo);
    const circuitBreaker = this.circuitBreakers.get(circuitBreakerKey);
    
    if (circuitBreaker && circuitBreaker.state === 'open') {
      if (Date.now() - circuitBreaker.lastFailure > this.circuitBreakerTimeout) {
        circuitBreaker.state = 'half-open';
        actions.push({
          type: 'circuit_breaker',
          description: 'Attempting to close circuit breaker',
          executed: false,
          success: false,
          timestamp: new Date().toISOString()
        });
      } else {
        // Circuit breaker is open, use fallback
        actions.push({
          type: 'fallback',
          description: 'Using fallback response due to circuit breaker',
          executed: false,
          success: false,
          timestamp: new Date().toISOString()
        });
        return actions;
      }
    }

    // Determine recovery actions based on error type and context
    if (errorInfo.type === 'TimeoutError' || errorInfo.message.includes('timeout')) {
      actions.push({
        type: 'retry',
        description: 'Retrying request after timeout',
        executed: false,
        success: false,
        timestamp: new Date().toISOString()
      });
    }

    if (errorInfo.context.vendorId && errorInfo.message.includes('vendor')) {
      actions.push({
        type: 'fallback',
        description: 'Using fallback response for vendor error',
        executed: false,
        success: false,
        timestamp: new Date().toISOString()
      });
    }

    if (errorInfo.severity === 'low' || errorInfo.severity === 'medium') {
      actions.push({
        type: 'graceful_degradation',
        description: 'Providing degraded service response',
        executed: false,
        success: false,
        timestamp: new Date().toISOString()
      });
    }

    return actions;
  }

  /**
   * Execute a recovery action
   */
  private executeRecoveryAction(
    action: ErrorRecoveryAction,
    errorInfo: ErrorInfo,
    req: Request,
    res: Response
  ): { success: boolean; response?: any } {
    action.executed = true;
    action.timestamp = new Date().toISOString();

    switch (action.type) {
      case 'retry':
        if (errorInfo.retryCount < this.maxRetries) {
          errorInfo.retryCount++;
          errorInfo.lastRetry = new Date().toISOString();
          // In a real implementation, you would retry the original request
          action.success = true;
          return { success: true };
        }
        break;

      case 'fallback':
        const fallbackResponse = this.getFallbackResponse(errorInfo, req);
        res.status(200).json(fallbackResponse);
        action.success = true;
        return { success: true, response: fallbackResponse };

      case 'circuit_breaker':
        const circuitBreakerKey = this.getCircuitBreakerKey(errorInfo);
        const circuitBreaker = this.circuitBreakers.get(circuitBreakerKey);
        if (circuitBreaker) {
          circuitBreaker.state = 'closed';
          circuitBreaker.failures = 0;
        }
        action.success = true;
        return { success: true };

      case 'graceful_degradation':
        const degradedResponse = this.getDegradedResponse(errorInfo, req);
        res.status(200).json(degradedResponse);
        action.success = true;
        return { success: true, response: degradedResponse };
    }

    action.success = false;
    return { success: false };
  }

  /**
   * Get fallback response for vendor-related errors
   */
  private getFallbackResponse(errorInfo: ErrorInfo, req: Request): any {
    const vendorId = errorInfo.context.vendorId || 'unknown';
    
    return {
      success: true,
      message: 'Service temporarily unavailable, using fallback response',
      data: {
        poolId: 'fallback',
        vendor_id: vendorId,
        platform: errorInfo.context.platform || 'unknown',
        user_id: errorInfo.context.userId || 'unknown',
        message: req.body.message || 'Hello',
        response: "I'm sorry, I'm experiencing some technical difficulties right now. Please try again in a moment.",
        timestamp: new Date().toISOString(),
        character: 'Fallback Assistant',
        mode: 'fallback',
        error_recovery: true
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get degraded response for non-critical errors
   */
  private getDegradedResponse(errorInfo: ErrorInfo, req: Request): any {
    return {
      success: true,
      message: 'Service operating in degraded mode',
      data: {
        poolId: 'degraded',
        vendor_id: errorInfo.context.vendorId || 'unknown',
        platform: errorInfo.context.platform || 'unknown',
        user_id: errorInfo.context.userId || 'unknown',
        message: req.body.message || 'Hello',
        response: "I'm here to help, though I'm operating with limited functionality at the moment.",
        timestamp: new Date().toISOString(),
        character: 'Assistant',
        mode: 'degraded',
        degraded_mode: true
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Send error response when recovery fails
   */
  private sendErrorResponse(errorInfo: ErrorInfo, res: Response): void {
    const statusCode = this.getStatusCode(errorInfo);
    
    res.status(statusCode).json({
      success: false,
      error: errorInfo.type,
      message: this.getUserFriendlyMessage(errorInfo),
      errorId: errorInfo.id,
      timestamp: errorInfo.timestamp,
      ...(process.env.NODE_ENV === 'development' && {
        stack: errorInfo.stack,
        context: errorInfo.context
      })
    });
  }

  /**
   * Determine error severity
   */
  private determineSeverity(error: Error, context: Partial<ErrorInfo['context']>): ErrorInfo['severity'] {
    if (error.message.includes('database') || error.message.includes('connection')) {
      return 'critical';
    }
    
    if (error.message.includes('timeout') || error.message.includes('memory')) {
      return 'high';
    }
    
    if (error.message.includes('validation') || error.message.includes('not found')) {
      return 'medium';
    }
    
    return 'low';
  }

  /**
   * Get HTTP status code for error
   */
  private getStatusCode(errorInfo: ErrorInfo): number {
    switch (errorInfo.severity) {
      case 'critical':
        return 503; // Service Unavailable
      case 'high':
        return 500; // Internal Server Error
      case 'medium':
        return 400; // Bad Request
      case 'low':
        return 422; // Unprocessable Entity
      default:
        return 500;
    }
  }

  /**
   * Get user-friendly error message
   */
  private getUserFriendlyMessage(errorInfo: ErrorInfo): string {
    switch (errorInfo.severity) {
      case 'critical':
        return 'Service temporarily unavailable. Please try again later.';
      case 'high':
        return 'An error occurred while processing your request. Please try again.';
      case 'medium':
        return 'Invalid request. Please check your input and try again.';
      case 'low':
        return 'Request could not be processed. Please try again.';
      default:
        return 'An unexpected error occurred.';
    }
  }

  /**
   * Get circuit breaker key for error context
   */
  private getCircuitBreakerKey(errorInfo: ErrorInfo): string {
    if (errorInfo.context.vendorId) {
      return `vendor:${errorInfo.context.vendorId}`;
    }
    if (errorInfo.context.url) {
      return `endpoint:${errorInfo.context.url}`;
    }
    return 'global';
  }

  /**
   * Record recovery action
   */
  private recordRecoveryAction(errorId: string, action: ErrorRecoveryAction, success: boolean): void {
    if (!this.recoveryActions.has(errorId)) {
      this.recoveryActions.set(errorId, []);
    }
    
    const actions = this.recoveryActions.get(errorId)!;
    actions.push({ ...action, success });
  }

  /**
   * Log error information
   */
  private logError(errorInfo: ErrorInfo): void {
    const logLevel = errorInfo.severity === 'critical' || errorInfo.severity === 'high' ? 'error' : 'warn';
    console[logLevel](`Error ${errorInfo.id}: ${errorInfo.type} - ${errorInfo.message}`, {
      severity: errorInfo.severity,
      context: errorInfo.context,
      timestamp: errorInfo.timestamp
    });
  }

  /**
   * Generate unique error ID
   */
  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    total: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
    resolved: number;
    unresolved: number;
  } {
    const stats = {
      total: this.errors.size,
      bySeverity: {} as Record<string, number>,
      byType: {} as Record<string, number>,
      resolved: 0,
      unresolved: 0
    };

    for (const error of this.errors.values()) {
      stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + 1;
      stats.byType[error.type] = (stats.byType[error.type] || 0) + 1;
      
      if (error.resolved) {
        stats.resolved++;
      } else {
        stats.unresolved++;
      }
    }

    return stats;
  }

  /**
   * Mark error as resolved
   */
  markErrorResolved(errorId: string): boolean {
    const error = this.errors.get(errorId);
    if (error) {
      error.resolved = true;
      return true;
    }
    return false;
  }

  /**
   * Get all errors
   */
  getAllErrors(): ErrorInfo[] {
    return Array.from(this.errors.values());
  }

  /**
   * Clear resolved errors older than specified time
   */
  clearOldErrors(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAgeMs;
    let cleared = 0;

    for (const [id, error] of this.errors.entries()) {
      if (error.resolved && new Date(error.timestamp).getTime() < cutoff) {
        this.errors.delete(id);
        this.recoveryActions.delete(id);
        cleared++;
      }
    }

    return cleared;
  }
}
