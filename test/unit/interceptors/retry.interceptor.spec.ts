import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, throwError, of, timer } from 'rxjs';
import { RetryInterceptor, Retryable } from 'src/common/interceptors/retry.interceptor';
import { EventStoreService } from 'src/common/services/event-store.service';
import { RETRY_CONFIG } from 'src/config/resilience.config';

// Mock the config
jest.mock('src/config/resilience.config', () => ({
  RETRY_CONFIG: {
    DEFAULT: {
      attempts: 3,
      delay: 1000,
      exponentialBackoff: true,
      maxDelay: 10000,
      retryCondition: null,
    },
    CRITICAL: {
      attempts: 5,
      delay: 500,
      exponentialBackoff: true,
      maxDelay: 30000,
      retryCondition: null,
    },
  },
}));

// Mock timer to avoid actual delays in tests
jest.mock('rxjs', () => {
  const originalModule = jest.requireActual('rxjs');
  return {
    ...originalModule,
    timer: jest.fn().mockImplementation(() => of(null)),
  };
});

describe('RetryInterceptor', () => {
  let interceptor: RetryInterceptor;
  let eventStoreService: jest.Mocked<EventStoreService>;
  let mockCallHandler: jest.Mocked<CallHandler>;
  let mockExecutionContext: jest.Mocked<ExecutionContext>;

  const mockEventStoreService = {
    appendEvent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetryInterceptor,
        {
          provide: EventStoreService,
          useValue: mockEventStoreService,
        },
      ],
    }).compile();

    interceptor = module.get<RetryInterceptor>(RetryInterceptor);
    eventStoreService = module.get(EventStoreService);

    // Mock CallHandler
    mockCallHandler = {
      handle: jest.fn(),
    };

    // Mock ExecutionContext
    mockExecutionContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn(),
      getArgs: jest.fn(),
      getArgByIndex: jest.fn(),
      switchToRpc: jest.fn(),
      switchToWs: jest.fn(),
      getType: jest.fn(),
    };

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  describe('intercept', () => {
    it('should pass through without retry when config has attempts <= 1', (done) => {
      // Arrange
      const mockHandler = jest.fn().mockReturnValue('test');
      mockExecutionContext.getHandler.mockReturnValue(mockHandler);
      mockCallHandler.handle.mockReturnValue(of('success'));

      // Mock config with no retries
      jest.spyOn(interceptor as any, 'getRetryConfig').mockReturnValue({ attempts: 1 });

      // Act
      const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

      // Assert
      result$.subscribe({
        next: (value) => {
          expect(value).toBe('success');
          expect(mockCallHandler.handle).toHaveBeenCalledTimes(1);
          done();
        },
      });
    });

    it('should pass through without retry when no retry config found', (done) => {
      // Arrange
      const mockHandler = jest.fn().mockReturnValue('test');
      mockExecutionContext.getHandler.mockReturnValue(mockHandler);
      mockCallHandler.handle.mockReturnValue(of('success'));

      jest.spyOn(interceptor as any, 'getRetryConfig').mockReturnValue(null);

      // Act
      const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

      // Assert
      result$.subscribe({
        next: (value) => {
          expect(value).toBe('success');
          done();
        },
      });
    });

    it('should succeed on first attempt without retry', (done) => {
      // Arrange
      const mockHandler = jest.fn().mockReturnValue('test');
      mockExecutionContext.getHandler.mockReturnValue(mockHandler);
      mockCallHandler.handle.mockReturnValue(of('success'));

      // Act
      const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

      // Assert
      result$.subscribe({
        next: (value) => {
          expect(value).toBe('success');
          expect(mockCallHandler.handle).toHaveBeenCalledTimes(1);
          done();
        },
      });
    });

    it('should retry on retryable error and succeed on second attempt', (done) => {
      // Arrange
      const mockHandler = jest.fn().mockReturnValue('test');
      mockExecutionContext.getHandler.mockReturnValue(mockHandler);
      
      const retryableError = new Error('Connection refused');
      (retryableError as any).code = 'ECONNREFUSED';
      
      mockCallHandler.handle
        .mockReturnValueOnce(throwError(() => retryableError))
        .mockReturnValueOnce(of('success'));

      // Act
      const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

      // Assert
      result$.subscribe({
        next: (value) => {
          expect(value).toBe('success');
          expect(mockCallHandler.handle).toHaveBeenCalledTimes(2);
          done();
        },
      });
    });

    it('should exhaust retries and fail when max attempts reached', (done) => {
      // Arrange
      const mockHandler = jest.fn().mockReturnValue('test');
      mockExecutionContext.getHandler.mockReturnValue(mockHandler);
      
      const retryableError = new Error('Service unavailable');
      (retryableError as any).status = 503;
      
      mockCallHandler.handle.mockReturnValue(throwError(() => retryableError));

      // Act
      const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

      // Assert
      result$.subscribe({
        error: (error) => {
          expect(error).toBe(retryableError);
          expect(mockCallHandler.handle).toHaveBeenCalledTimes(3); // Original + 2 retries
          done();
        },
      });
    });

    it('should not retry on non-retryable error', (done) => {
      // Arrange
      const mockHandler = jest.fn().mockReturnValue('test');
      mockExecutionContext.getHandler.mockReturnValue(mockHandler);
      
      const nonRetryableError = new Error('Bad request');
      (nonRetryableError as any).status = 400;
      
      mockCallHandler.handle.mockReturnValue(throwError(() => nonRetryableError));

      // Act
      const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

      // Assert
      result$.subscribe({
        error: (error) => {
          expect(error).toBe(nonRetryableError);
          expect(mockCallHandler.handle).toHaveBeenCalledTimes(1);
          done();
        },
      });
    });
  });

  describe('getRetryKey', () => {
    it('should return key from decorator metadata when available', () => {
      // Arrange
      const mockHandler = jest.fn();
      Reflect.defineMetadata('retry_key', 'CUSTOM_KEY', mockHandler);

      // Act
      const result = (interceptor as any).getRetryKey(mockHandler);

      // Assert
      expect(result).toBe('CUSTOM_KEY');
    });

    it('should return CRITICAL for handlers with "critical" in name', () => {
      // Arrange
      const mockHandler = function criticalOperation() {};

      // Act
      const result = (interceptor as any).getRetryKey(mockHandler);

      // Assert
      expect(result).toBe('CRITICAL');
    });

    it('should return DEFAULT for handlers without metadata or special names', () => {
      // Arrange
      const mockHandler = function normalOperation() {};

      // Act
      const result = (interceptor as any).getRetryKey(mockHandler);

      // Assert
      expect(result).toBe('DEFAULT');
    });
  });

  describe('getRetryConfig', () => {
    it('should return specific config for known retry key', () => {
      // Act
      const result = (interceptor as any).getRetryConfig('CRITICAL');

      // Assert
      expect(result).toEqual(RETRY_CONFIG.CRITICAL);
    });

    it('should return DEFAULT config for unknown retry key', () => {
      // Act
      const result = (interceptor as any).getRetryConfig('UNKNOWN');

      // Assert
      expect(result).toEqual(RETRY_CONFIG.DEFAULT);
    });
  });

  describe('shouldRetry', () => {
    const mockConfig = {
      attempts: 3,
      delay: 1000,
      exponentialBackoff: true,
      maxDelay: 10000,
      retryCondition: null,
    };

    it('should return false when max attempts exceeded', () => {
      // Act
      const result = (interceptor as any).shouldRetry(new Error(), 3, mockConfig);

      // Assert
      expect(result).toBe(false);
    });

    it('should use custom retry condition when provided', () => {
      // Arrange
      const customConfig = {
        ...mockConfig,
        retryCondition: jest.fn().mockReturnValue(true),
      };
      const error = new Error('test');

      // Act
      const result = (interceptor as any).shouldRetry(error, 1, customConfig);

      // Assert
      expect(result).toBe(true);
      expect(customConfig.retryCondition).toHaveBeenCalledWith(error);
    });

    it('should fallback to default retry conditions', () => {
      // Arrange
      const error = new Error('timeout');
      jest.spyOn(interceptor as any, 'isRetryableError').mockReturnValue(true);

      // Act
      const result = (interceptor as any).shouldRetry(error, 1, mockConfig);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('isRetryableError', () => {
    it('should return true for network connection errors', () => {
      // Test cases for different network errors
      const networkErrors = [
        { code: 'ECONNREFUSED' },
        { code: 'ENOTFOUND' },
        { code: 'ECONNRESET' },
        { code: 'ETIMEDOUT' },
      ];

      networkErrors.forEach(errorProps => {
        const error = new Error('Network error');
        Object.assign(error, errorProps);
        
        expect((interceptor as any).isRetryableError(error)).toBe(true);
      });
    });

    it('should return true for retryable HTTP status codes', () => {
      const retryableStatuses = [408, 429, 500, 502, 503, 504];

      retryableStatuses.forEach(status => {
        const error = { status };
        expect((interceptor as any).isRetryableError(error)).toBe(true);
      });
    });

    it('should return true for timeout errors', () => {
      const timeoutErrors = [
        { name: 'TimeoutError' },
        { message: 'Request timeout' },
        { message: 'Connection timeout' },
      ];

      timeoutErrors.forEach(errorProps => {
        const error = new Error();
        Object.assign(error, errorProps);
        
        expect((interceptor as any).isRetryableError(error)).toBe(true);
      });
    });

    it('should return true for circuit breaker errors', () => {
      // Arrange
      const error = new Error('Circuit breaker is OPEN');

      // Act & Assert
      expect((interceptor as any).isRetryableError(error)).toBe(true);
    });

    it('should return true for message queue errors', () => {
      const mqErrors = [
        new Error('Connection closed'),
        new Error('Channel closed'),
      ];

      mqErrors.forEach(error => {
        expect((interceptor as any).isRetryableError(error)).toBe(true);
      });
    });

    it('should return false for non-retryable errors', () => {
      const nonRetryableErrors = [
        new Error('Validation error'),
        { status: 400 },
        { status: 401 },
        { status: 403 },
        { status: 404 },
      ];

      nonRetryableErrors.forEach(error => {
        expect((interceptor as any).isRetryableError(error)).toBe(false);
      });
    });
  });

  describe('calculateDelay', () => {
    it('should return fixed delay when exponential backoff is disabled', () => {
      // Arrange
      const config = {
        delay: 1000,
        exponentialBackoff: false,
        maxDelay: 10000,
      };

      // Act
      const result = (interceptor as any).calculateDelay(3, config);

      // Assert
      expect(result).toBe(1000);
    });

    it('should calculate exponential backoff with jitter', () => {
      // Arrange
      const config = {
        delay: 1000,
        exponentialBackoff: true,
        maxDelay: 10000,
      };

      // Mock Math.random for predictable jitter
      const originalRandom = Math.random;
      Math.random = jest.fn().mockReturnValue(0.5);

      // Act
      const delay1 = (interceptor as any).calculateDelay(1, config);
      const delay2 = (interceptor as any).calculateDelay(2, config);
      const delay3 = (interceptor as any).calculateDelay(3, config);

      // Assert
      expect(delay1).toBeGreaterThanOrEqual(1000);
      expect(delay2).toBeGreaterThanOrEqual(2000);
      expect(delay3).toBeGreaterThanOrEqual(4000);
      
      // Restore Math.random
      Math.random = originalRandom;
    });

    it('should respect max delay limit', () => {
      // Arrange
      const config = {
        delay: 1000,
        exponentialBackoff: true,
        maxDelay: 5000,
      };

      // Act
      const result = (interceptor as any).calculateDelay(10, config); // Very high attempt

      // Assert
      expect(result).toBeLessThanOrEqual(5000);
    });
  });

  describe('logRetryAttempt', () => {
    it('should log retry attempt and store event', async () => {
      // Arrange
      const attempt = {
        attempt: 1,
        error: new Error('Test error'),
        delay: 1000,
        timestamp: new Date(),
      };
      const requestId = 'test-request-id';
      const retryKey = 'DEFAULT';

      eventStoreService.appendEvent.mockResolvedValue(undefined);

      // Act
      await (interceptor as any).logRetryAttempt(attempt, requestId, retryKey);

      // Assert
      expect(eventStoreService.appendEvent).toHaveBeenCalledWith({
        aggregateId: `retry_${requestId}`,
        eventType: 'RETRY_ATTEMPT',
        eventData: {
          retryKey,
          attempt: 1,
          delay: 1000,
          error: {
            message: 'Test error',
            code: undefined,
            status: undefined,
          },
        },
        version: 1,
      });
    });

    it('should handle event store errors gracefully', async () => {
      // Arrange
      const attempt = {
        attempt: 1,
        error: new Error('Test error'),
        delay: 1000,
        timestamp: new Date(),
      };
      eventStoreService.appendEvent.mockRejectedValue(new Error('Event store error'));

      const loggerErrorSpy = jest.spyOn((interceptor as any).logger, 'error').mockImplementation();

      // Act
      await (interceptor as any).logRetryAttempt(attempt, 'request-id', 'DEFAULT');

      // Assert
      expect(loggerErrorSpy).toHaveBeenCalledWith('Failed to log retry attempt: Event store error');
      
      loggerErrorSpy.mockRestore();
    });
  });

  describe('generateRequestId', () => {
    it('should generate unique request IDs', () => {
      // Act
      const id1 = (interceptor as any).generateRequestId();
      const id2 = (interceptor as any).generateRequestId();

      // Assert
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^req_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^req_\d+_[a-z0-9]+$/);
    });
  });

  describe('Retryable decorator', () => {
    it('should set retry key metadata with specified key', () => {
      // Arrange
      class TestClass {
        @Retryable('CRITICAL')
        testMethod() {}
      }

      // Act
      const metadata = Reflect.getMetadata('retry_key', TestClass.prototype.testMethod);

      // Assert
      expect(metadata).toBe('CRITICAL');
    });

    it('should set retry key metadata with DEFAULT when no key specified', () => {
      // Arrange
      class TestClass {
        @Retryable()
        testMethod() {}
      }

      // Act
      const metadata = Reflect.getMetadata('retry_key', TestClass.prototype.testMethod);

      // Assert
      expect(metadata).toBe('DEFAULT');
    });
  });
});
