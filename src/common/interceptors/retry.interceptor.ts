import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Logger,
} from '@nestjs/common';
import { Observable, throwError, timer } from 'rxjs';
import { retryWhen, mergeMap, finalize } from 'rxjs/operators';
import { RETRY_CONFIG, RetryConfig } from 'src/config/resilience.config';
import { EventStoreService } from '../services/event-store.service';

interface RetryAttempt {
  attempt: number;
  error: any;
  delay: number;
  timestamp: Date;
}

@Injectable()
export class RetryInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RetryInterceptor.name);

  constructor(private readonly eventStore: EventStoreService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const handler = context.getHandler();
    const retryKey = this.getRetryKey(handler);
    const retryConfig = this.getRetryConfig(retryKey);
    
    if (!retryConfig || retryConfig.attempts <= 1) {
      return next.handle();
    }

    const requestId = this.generateRequestId();
    let attemptCount = 0;

    return next.handle().pipe(
      retryWhen(errors =>
        errors.pipe(
          mergeMap((error, index) => {
            attemptCount = index + 1;
            
            // Check if we should retry this error
            if (!this.shouldRetry(error, attemptCount, retryConfig)) {
              return throwError(() => error);
            }

            const delay = this.calculateDelay(attemptCount, retryConfig);
            
            this.logRetryAttempt({
              attempt: attemptCount,
              error,
              delay,
              timestamp: new Date(),
            }, requestId, retryKey);

            return timer(delay);
          }),
        ),
      ),
      finalize(() => {
        if (attemptCount > 0) {
          this.logRetryResult(requestId, retryKey, attemptCount);
        }
      }),
    );
  }

  private getRetryKey(handler: Function): string {
    // Try to get retry key from decorator metadata
    const retryKey = Reflect.getMetadata('retry_key', handler);
    if (retryKey) {
      return retryKey;
    }

    // Extract from handler name or use default
    const handlerName = handler.name;
    if (handlerName.toLowerCase().includes('critical')) {
      return 'CRITICAL';
    }

    return 'DEFAULT';
  }

  private getRetryConfig(retryKey: string): RetryConfig | null {
    return RETRY_CONFIG[retryKey] || RETRY_CONFIG.DEFAULT;
  }

  private shouldRetry(error: any, attemptCount: number, config: RetryConfig): boolean {
    // Check if we've exceeded max attempts
    if (attemptCount >= config.attempts) {
      return false;
    }

    // Check if we have a custom retry condition
    if (config.retryCondition) {
      return config.retryCondition(error);
    }

    // Default retry conditions
    return this.isRetryableError(error);
  }

  private isRetryableError(error: any): boolean {
    // Network/connection errors - retry
    if (error.code === 'ECONNREFUSED' || 
        error.code === 'ENOTFOUND' || 
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT') {
      return true;
    }

    // HTTP status codes that are retryable
    const retryableHttpCodes = [408, 429, 500, 502, 503, 504];
    if (error.status && retryableHttpCodes.includes(error.status)) {
      return true;
    }

    // Timeout errors
    if (error.name === 'TimeoutError' || error.message?.includes('timeout')) {
      return true;
    }

    // Circuit breaker errors (when circuit is open)
    if (error.message?.includes('Circuit breaker is OPEN')) {
      return true;
    }

    // Message queue errors
    if (error.message?.includes('Connection closed') || 
        error.message?.includes('Channel closed')) {
      return true;
    }

    return false;
  }

  private calculateDelay(attemptCount: number, config: RetryConfig): number {
    if (!config.exponentialBackoff) {
      return config.delay;
    }

    // Exponential backoff with jitter
    const baseDelay = config.delay;
    const exponentialDelay = baseDelay * Math.pow(2, attemptCount - 1);
    const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
    
    const totalDelay = Math.min(exponentialDelay + jitter, config.maxDelay);
    
    return Math.floor(totalDelay);
  }

  private async logRetryAttempt(
    attempt: RetryAttempt,
    requestId: string,
    retryKey: string,
  ): Promise<void> {
    this.logger.warn(
      `Retry attempt ${attempt.attempt} for ${retryKey} (${requestId}) after ${attempt.delay}ms delay. Error: ${attempt.error.message}`,
    );

    try {
      await this.eventStore.appendEvent({
        aggregateId: `retry_${requestId}`,
        eventType: 'RETRY_ATTEMPT',
        data: {
          retryKey,
          attempt: attempt.attempt,
          delay: attempt.delay,
          error: {
            message: attempt.error.message,
            code: attempt.error.code,
            status: attempt.error.status,
          },
        },
        metadata: { version: attempt.attempt },
      });
    } catch (error) {
      this.logger.error(`Failed to log retry attempt: ${error.message}`);
    }
  }

  private async logRetryResult(
    requestId: string,
    retryKey: string,
    totalAttempts: number,
  ): Promise<void> {
    try {
      await this.eventStore.appendEvent({
        aggregateId: `retry_${requestId}`,
        eventType: 'RETRY_COMPLETED',
        data: {
          retryKey,
          totalAttempts,
        },
        metadata: { version: totalAttempts + 1 },
      });
    } catch (error) {
      this.logger.error(`Failed to log retry result: ${error.message}`);
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Decorator to mark methods with specific retry configurations
export const Retryable = (retryKey: string = 'DEFAULT') => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata('retry_key', retryKey, descriptor.value);
    return descriptor;
  };
};
