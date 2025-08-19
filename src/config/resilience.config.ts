export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  monitor?: boolean;
}

export interface RetryConfig {
  attempts: number;
  delay: number;
  exponentialBackoff: boolean;
  maxDelay: number;
  retryCondition?: (error: any) => boolean;
}

export interface BulkheadConfig {
  maxConcurrent: number;
  maxQueue: number;
  queueTimeout: number;
}

export interface HealthCheckConfig {
  interval: number;
  timeout: number;
  retries: number;
  gracePeriod: number;
}

export const CIRCUIT_BREAKER_CONFIG: Record<string, CircuitBreakerConfig> = {
  USER_SERVICE: {
    failureThreshold: parseInt(process.env.CB_USER_FAILURE_THRESHOLD || '5'),
    successThreshold: parseInt(process.env.CB_USER_SUCCESS_THRESHOLD || '2'),
    timeout: parseInt(process.env.CB_USER_TIMEOUT || '60000'), // 1 minute
    monitor: true,
  },
  PATIENT_QUEUE_SERVICE: {
    failureThreshold: parseInt(process.env.CB_QUEUE_FAILURE_THRESHOLD || '3'),
    successThreshold: parseInt(process.env.CB_QUEUE_SUCCESS_THRESHOLD || '2'),
    timeout: parseInt(process.env.CB_QUEUE_TIMEOUT || '30000'), // 30 seconds
    monitor: true,
  },
};

export const RETRY_CONFIG: Record<string, RetryConfig> = {
  DEFAULT: {
    attempts: parseInt(process.env.RETRY_ATTEMPTS || '3'),
    delay: parseInt(process.env.RETRY_DELAY || '1000'),
    exponentialBackoff: true,
    maxDelay: parseInt(process.env.RETRY_MAX_DELAY || '10000'),
  },
  CRITICAL: {
    attempts: parseInt(process.env.RETRY_CRITICAL_ATTEMPTS || '5'),
    delay: parseInt(process.env.RETRY_CRITICAL_DELAY || '2000'),
    exponentialBackoff: true,
    maxDelay: parseInt(process.env.RETRY_CRITICAL_MAX_DELAY || '30000'),
  },
};

export const BULKHEAD_CONFIG: Record<string, BulkheadConfig> = {
  CRITICAL: {
    maxConcurrent: parseInt(process.env.BULKHEAD_CRITICAL_CONCURRENT || '10'),
    maxQueue: parseInt(process.env.BULKHEAD_CRITICAL_QUEUE || '20'),
    queueTimeout: parseInt(process.env.BULKHEAD_CRITICAL_TIMEOUT || '5000'),
  },
  NON_CRITICAL: {
    maxConcurrent: parseInt(process.env.BULKHEAD_NON_CRITICAL_CONCURRENT || '5'),
    maxQueue: parseInt(process.env.BULKHEAD_NON_CRITICAL_QUEUE || '10'),
    queueTimeout: parseInt(process.env.BULKHEAD_NON_CRITICAL_TIMEOUT || '2000'),
  },
};

export const HEALTH_CHECK_CONFIG: HealthCheckConfig = {
  interval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'), // 30 seconds
  timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000'), // 5 seconds
  retries: parseInt(process.env.HEALTH_CHECK_RETRIES || '3'),
  gracePeriod: parseInt(process.env.HEALTH_CHECK_GRACE_PERIOD || '60000'), // 1 minute
};

export const SAGA_CONFIG = {
  timeout: parseInt(process.env.SAGA_TIMEOUT || '300000'), // 5 minutes
  maxRetries: parseInt(process.env.SAGA_MAX_RETRIES || '3'),
  compensationTimeout: parseInt(process.env.SAGA_COMPENSATION_TIMEOUT || '60000'), // 1 minute
};

export const EVENT_STORE_CONFIG = {
  retentionDays: parseInt(process.env.EVENT_STORE_RETENTION_DAYS || '90'),
  batchSize: parseInt(process.env.EVENT_STORE_BATCH_SIZE || '100'),
  flushInterval: parseInt(process.env.EVENT_STORE_FLUSH_INTERVAL || '5000'), // 5 seconds
};
