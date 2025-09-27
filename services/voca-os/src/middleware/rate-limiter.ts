import { Request, Response, NextFunction } from 'express';

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
  onLimitReached?: (req: Request, res: Response) => void;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number; // Timestamp when the window resets
  retryAfter?: number; // Seconds until retry is allowed
}

export class RateLimiter {
  private requests: Map<string, { count: number; resetTime: number }> = new Map();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = {
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      keyGenerator: (req: Request) => req.ip || 'unknown',
      ...config
    };

    // Clean up expired entries every minute
    setInterval(() => {
      this.cleanupExpiredEntries();
    }, 60000);
  }

  /**
   * Express middleware for rate limiting
   */
  middleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const key = this.config.keyGenerator!(req);
      const now = Date.now();
      const windowStart = now - this.config.windowMs;

      // Get or create rate limit info for this key
      let rateLimitInfo = this.requests.get(key);
      
      if (!rateLimitInfo || rateLimitInfo.resetTime <= now) {
        // Create new window
        rateLimitInfo = {
          count: 0,
          resetTime: now + this.config.windowMs
        };
        this.requests.set(key, rateLimitInfo);
      }

      // Check if limit is exceeded
      if (rateLimitInfo.count >= this.config.maxRequests) {
        const retryAfter = Math.ceil((rateLimitInfo.resetTime - now) / 1000);
        
        // Add rate limit headers
        res.set({
          'X-RateLimit-Limit': this.config.maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': new Date(rateLimitInfo.resetTime).toISOString(),
          'Retry-After': retryAfter.toString()
        });

        // Call custom handler if provided
        if (this.config.onLimitReached) {
          this.config.onLimitReached(req, res);
        } else {
          res.status(429).json({
            error: 'Too Many Requests',
            message: 'Rate limit exceeded',
            retryAfter,
            timestamp: new Date().toISOString()
          });
        }
        return;
      }

      // Increment request count
      rateLimitInfo.count++;

      // Add rate limit headers
      const remaining = Math.max(0, this.config.maxRequests - rateLimitInfo.count);
      res.set({
        'X-RateLimit-Limit': this.config.maxRequests.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': new Date(rateLimitInfo.resetTime).toISOString()
      });

      // Store rate limit info in request for potential use
      (req as any).rateLimit = {
        limit: this.config.maxRequests,
        remaining,
        reset: rateLimitInfo.resetTime,
        retryAfter: remaining === 0 ? Math.ceil((rateLimitInfo.resetTime - now) / 1000) : undefined
      };

      next();
    };
  }

  /**
   * Check if a request would be allowed without incrementing counter
   */
  isAllowed(key: string): { allowed: boolean; info: RateLimitInfo } {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    let rateLimitInfo = this.requests.get(key);
    
    if (!rateLimitInfo || rateLimitInfo.resetTime <= now) {
      // New window, request would be allowed
      return {
        allowed: true,
        info: {
          limit: this.config.maxRequests,
          remaining: this.config.maxRequests,
          reset: now + this.config.windowMs
        }
      };
    }

    const remaining = Math.max(0, this.config.maxRequests - rateLimitInfo.count);
    const allowed = rateLimitInfo.count < this.config.maxRequests;

    return {
      allowed,
      info: {
        limit: this.config.maxRequests,
        remaining,
        reset: rateLimitInfo.resetTime,
        retryAfter: !allowed ? Math.ceil((rateLimitInfo.resetTime - now) / 1000) : undefined
      }
    };
  }

  /**
   * Get rate limit info for a key
   */
  getInfo(key: string): RateLimitInfo | null {
    const rateLimitInfo = this.requests.get(key);
    if (!rateLimitInfo) return null;

    const now = Date.now();
    if (rateLimitInfo.resetTime <= now) {
      // Window has expired
      return {
        limit: this.config.maxRequests,
        remaining: this.config.maxRequests,
        reset: now + this.config.windowMs
      };
    }

    const remaining = Math.max(0, this.config.maxRequests - rateLimitInfo.count);
    return {
      limit: this.config.maxRequests,
      remaining,
      reset: rateLimitInfo.resetTime,
      retryAfter: remaining === 0 ? Math.ceil((rateLimitInfo.resetTime - now) / 1000) : undefined
    };
  }

  /**
   * Reset rate limit for a specific key
   */
  reset(key: string): void {
    this.requests.delete(key);
  }

  /**
   * Reset all rate limits
   */
  resetAll(): void {
    this.requests.clear();
  }

  /**
   * Get current rate limit statistics
   */
  getStats(): {
    totalKeys: number;
    activeKeys: number;
    config: RateLimitConfig;
  } {
    const now = Date.now();
    const activeKeys = Array.from(this.requests.values())
      .filter(info => info.resetTime > now).length;

    return {
      totalKeys: this.requests.size,
      activeKeys,
      config: this.config
    };
  }

  /**
   * Clean up expired entries
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, info] of this.requests.entries()) {
      if (info.resetTime <= now) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => this.requests.delete(key));
    
    if (expiredKeys.length > 0) {
      console.log(`Cleaned up ${expiredKeys.length} expired rate limit entries`);
    }
  }
}

/**
 * Pre-configured rate limiters for different use cases
 */
export class RateLimitPresets {
  /**
   * Strict rate limiter for API endpoints
   */
  static strict(): RateLimiter {
    return new RateLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 100, // 100 requests per 15 minutes
      keyGenerator: (req: Request) => req.ip || 'unknown'
    });
  }

  /**
   * Moderate rate limiter for general use
   */
  static moderate(): RateLimiter {
    return new RateLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 1000, // 1000 requests per 15 minutes
      keyGenerator: (req: Request) => req.ip || 'unknown'
    });
  }

  /**
   * Lenient rate limiter for internal services
   */
  static lenient(): RateLimiter {
    return new RateLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 10000, // 10000 requests per 15 minutes
      keyGenerator: (req: Request) => req.ip || 'unknown'
    });
  }

  /**
   * Per-vendor rate limiter
   */
  static perVendor(): RateLimiter {
    return new RateLimiter({
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 60, // 60 requests per minute per vendor
      keyGenerator: (req: Request) => {
        const vendorId = req.params.vendorId || req.body.vendor_id;
        return vendorId ? `vendor:${vendorId}` : req.ip || 'unknown';
      }
    });
  }

  /**
   * Message processing rate limiter
   */
  static messageProcessing(): RateLimiter {
    return new RateLimiter({
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 30, // 30 messages per minute per user
      keyGenerator: (req: Request) => {
        const userId = req.body.user_id || req.params.userId;
        const vendorId = req.body.vendor_id || req.params.vendorId;
        return userId && vendorId ? `user:${userId}:vendor:${vendorId}` : req.ip || 'unknown';
      }
    });
  }
}
