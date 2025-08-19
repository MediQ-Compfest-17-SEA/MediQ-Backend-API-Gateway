import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';
import { EventStoreService } from '../services/event-store.service';

interface RequestMetrics {
  requestId: string;
  method: string;
  url: string;
  userAgent?: string;
  userId?: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  statusCode?: number;
  contentLength?: number;
  error?: string;
  memoryUsage?: NodeJS.MemoryUsage;
}

interface PerformanceMetrics {
  endpoint: string;
  method: string;
  count: number;
  totalDuration: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  errorCount: number;
  successCount: number;
  errorRate: number;
  lastUpdated: Date;
}

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  private readonly logger = new Logger(MetricsInterceptor.name);
  private readonly metricsCache = new Map<string, PerformanceMetrics>();
  private readonly activeRequests = new Map<string, RequestMetrics>();

  constructor(private readonly eventStore: EventStoreService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    
    const requestId = this.generateRequestId();
    const startTime = Date.now();
    const startMemory = process.memoryUsage();

    const metrics: RequestMetrics = {
      requestId,
      method: request.method,
      url: this.sanitizeUrl(request.url),
      userAgent: request.headers['user-agent'],
      userId: this.extractUserId(request),
      startTime,
      memoryUsage: startMemory,
    };

    this.activeRequests.set(requestId, metrics);

    return next.handle().pipe(
      tap({
        next: (data) => {
          this.recordSuccess(requestId, response, data);
        },
      }),
      catchError((error) => {
        this.recordError(requestId, response, error);
        throw error;
      }),
    );
  }

  private recordSuccess(requestId: string, response: Response, data: any): void {
    const metrics = this.activeRequests.get(requestId);
    if (!metrics) return;

    metrics.endTime = Date.now();
    metrics.duration = metrics.endTime - metrics.startTime;
    metrics.statusCode = response.statusCode;
    metrics.contentLength = this.calculateContentLength(data);

    this.updateMetrics(metrics);
    this.logMetrics(metrics);
    this.activeRequests.delete(requestId);
  }

  private recordError(requestId: string, response: Response, error: any): void {
    const metrics = this.activeRequests.get(requestId);
    if (!metrics) return;

    metrics.endTime = Date.now();
    metrics.duration = metrics.endTime - metrics.startTime;
    metrics.statusCode = error.status || response.statusCode || 500;
    metrics.error = error.message;

    this.updateMetrics(metrics);
    this.logMetrics(metrics);
    this.activeRequests.delete(requestId);
  }

  private updateMetrics(requestMetrics: RequestMetrics): void {
    const key = `${requestMetrics.method}:${this.normalizeEndpoint(requestMetrics.url)}`;
    
    let metrics = this.metricsCache.get(key);
    if (!metrics) {
      metrics = {
        endpoint: this.normalizeEndpoint(requestMetrics.url),
        method: requestMetrics.method,
        count: 0,
        totalDuration: 0,
        avgDuration: 0,
        minDuration: Number.MAX_SAFE_INTEGER,
        maxDuration: 0,
        errorCount: 0,
        successCount: 0,
        errorRate: 0,
        lastUpdated: new Date(),
      };
      this.metricsCache.set(key, metrics);
    }

    // Update counters
    metrics.count++;
    metrics.totalDuration += requestMetrics.duration || 0;
    metrics.avgDuration = metrics.totalDuration / metrics.count;
    
    if (requestMetrics.duration) {
      metrics.minDuration = Math.min(metrics.minDuration, requestMetrics.duration);
      metrics.maxDuration = Math.max(metrics.maxDuration, requestMetrics.duration);
    }

    // Update success/error counts
    if (requestMetrics.error || (requestMetrics.statusCode && requestMetrics.statusCode >= 400)) {
      metrics.errorCount++;
    } else {
      metrics.successCount++;
    }

    metrics.errorRate = metrics.errorCount / metrics.count;
    metrics.lastUpdated = new Date();
  }

  private async logMetrics(metrics: RequestMetrics): Promise<void> {
    try {
      await this.eventStore.appendEvent({
        aggregateId: `metrics_${metrics.requestId}`,
        eventType: 'REQUEST_METRICS',
        eventData: {
          ...metrics,
          timestamp: new Date(),
        },
        version: 1,
      });
    } catch (error) {
      this.logger.error(`Failed to log request metrics: ${error.message}`);
    }

    // Log slow requests
    const slowRequestThreshold = parseInt(process.env.SLOW_REQUEST_THRESHOLD || '1000');
    if (metrics.duration && metrics.duration > slowRequestThreshold) {
      this.logger.warn(
        `Slow request detected: ${metrics.method} ${metrics.url} took ${metrics.duration}ms`,
      );
    }
  }

  private sanitizeUrl(url: string): string {
    // Remove sensitive information from URLs
    return url
      .replace(/\?.*$/, '') // Remove query parameters
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id') // Replace UUIDs
      .replace(/\/\d+/g, '/:id'); // Replace numeric IDs
  }

  private normalizeEndpoint(url: string): string {
    // Normalize endpoint for metrics aggregation
    return url
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/{id}')
      .replace(/\/\d+/g, '/{id}')
      .replace(/\?.*$/, '');
  }

  private extractUserId(request: Request): string | undefined {
    // Try to extract user ID from various sources
    const authHeader = request.headers.authorization;
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        return payload.sub || payload.userId;
      } catch {
        // Failed to parse JWT
      }
    }

    return request.headers['x-user-id'] as string;
  }

  private calculateContentLength(data: any): number {
    if (!data) return 0;
    
    try {
      return Buffer.byteLength(JSON.stringify(data), 'utf8');
    } catch {
      return 0;
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public methods for metrics access
  getMetrics(): Record<string, PerformanceMetrics> {
    const result: Record<string, PerformanceMetrics> = {};
    this.metricsCache.forEach((value, key) => {
      result[key] = { ...value };
    });
    return result;
  }

  getEndpointMetrics(endpoint: string, method?: string): PerformanceMetrics[] {
    const results: PerformanceMetrics[] = [];
    
    this.metricsCache.forEach((metrics, key) => {
      const [keyMethod, keyEndpoint] = key.split(':');
      
      if (keyEndpoint.includes(endpoint) && (!method || keyMethod === method)) {
        results.push({ ...metrics });
      }
    });

    return results;
  }

  getTopSlowEndpoints(limit = 10): PerformanceMetrics[] {
    const metrics = Array.from(this.metricsCache.values());
    return metrics
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, limit);
  }

  getTopErrorEndpoints(limit = 10): PerformanceMetrics[] {
    const metrics = Array.from(this.metricsCache.values());
    return metrics
      .filter(m => m.errorRate > 0)
      .sort((a, b) => b.errorRate - a.errorRate)
      .slice(0, limit);
  }

  getSystemMetrics(): any {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      memory: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers,
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
      uptime: process.uptime(),
      activeRequests: this.activeRequests.size,
      totalRequests: Array.from(this.metricsCache.values()).reduce((sum, m) => sum + m.count, 0),
    };
  }

  clearMetrics(): void {
    this.metricsCache.clear();
    this.logger.log('Metrics cache cleared');
  }
}
