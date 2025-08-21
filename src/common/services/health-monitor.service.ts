import { Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { HEALTH_CHECK_CONFIG } from 'src/config/resilience.config';
import { EventStoreService } from './event-store.service';
import { CircuitBreakerService } from './circuit-breaker.service';

export enum HealthStatus {
  UP = 'UP',
  DOWN = 'DOWN',
  DEGRADED = 'DEGRADED',
  UNKNOWN = 'UNKNOWN',
}

export interface ServiceHealth {
  service: string;
  status: HealthStatus;
  lastCheck: Date;
  responseTime?: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface SystemHealth {
  status: HealthStatus;
  timestamp: Date;
  services: Record<string, ServiceHealth>;
  uptime: number;
  version?: string;
}

@Injectable()
export class HealthMonitorService {
  private readonly logger = new Logger(HealthMonitorService.name);
  private readonly serviceClients = new Map<string, ClientProxy>();
  private readonly serviceHealth = new Map<string, ServiceHealth>();
  private readonly startTime = Date.now();
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(
    private readonly eventStore: EventStoreService,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {
    this.startHealthChecks();
  }

  registerService(serviceName: string, client: ClientProxy): void {
    this.serviceClients.set(serviceName, client);
    this.serviceHealth.set(serviceName, {
      service: serviceName,
      status: HealthStatus.UNKNOWN,
      lastCheck: new Date(),
    });

    this.logger.log(`Registered service for health monitoring: ${serviceName}`);
  }

  async checkServiceHealth(serviceName: string): Promise<ServiceHealth> {
    const client = this.serviceClients.get(serviceName);
    if (!client) {
      throw new Error(`Service ${serviceName} not registered`);
    }

    const startTime = Date.now();
    let health: ServiceHealth = {
      service: serviceName,
      status: HealthStatus.UNKNOWN,
      lastCheck: new Date(),
    };

    try {
      // Use circuit breaker for health checks
      const result = await this.circuitBreaker.execute(
        serviceName,
        async () => {
          return await client.send('health_check', {}).toPromise();
        },
        {
          failureThreshold: 5,
          recoveryTimeout: 30000,
          timeout: 5000,
        },
      );

      const responseTime = Date.now() - startTime;
      
      health = {
        service: serviceName,
        status: this.mapHealthStatus(result.status),
        lastCheck: new Date(),
        responseTime,
        metadata: result,
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      health = {
        service: serviceName,
        status: HealthStatus.DOWN,
        lastCheck: new Date(),
        responseTime,
        error: error.message,
      };

      this.logger.error(`Health check failed for ${serviceName}: ${error.message}`);
    }

    // Store previous status for comparison
    const previousHealth = this.serviceHealth.get(serviceName);
    this.serviceHealth.set(serviceName, health);

    // Log status changes
    if (previousHealth && previousHealth.status !== health.status) {
      await this.logHealthStatusChange(serviceName, previousHealth.status, health.status);
    }

    return health;
  }

  async checkAllServicesHealth(): Promise<Record<string, ServiceHealth>> {
    const healthChecks: Record<string, ServiceHealth> = {};
    
    const promises = Array.from(this.serviceClients.keys()).map(async (serviceName) => {
      try {
        const health = await this.checkServiceHealth(serviceName);
        healthChecks[serviceName] = health;
      } catch (error) {
        healthChecks[serviceName] = {
          service: serviceName,
          status: HealthStatus.DOWN,
          lastCheck: new Date(),
          error: error.message,
        };
      }
    });

    await Promise.allSettled(promises);
    return healthChecks;
  }

  async getSystemHealth(): Promise<SystemHealth> {
    const servicesHealth = await this.checkAllServicesHealth();
    const systemStatus = this.calculateSystemStatus(servicesHealth);
    
    return {
      status: systemStatus,
      timestamp: new Date(),
      services: servicesHealth,
      uptime: Date.now() - this.startTime,
      version: process.env.npm_package_version || '1.0.0',
    };
  }

  getServiceHealth(serviceName: string): ServiceHealth | undefined {
    return this.serviceHealth.get(serviceName);
  }

  async isServiceHealthy(serviceName: string): Promise<boolean> {
    const health = await this.checkServiceHealth(serviceName);
    return health.status === HealthStatus.UP;
  }

  async waitForServiceHealth(serviceName: string, timeout = HEALTH_CHECK_CONFIG.gracePeriod): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const isHealthy = await this.isServiceHealthy(serviceName);
        if (isHealthy) {
          return true;
        }
      } catch (error) {
        this.logger.debug(`Service ${serviceName} not yet healthy: ${error.message}`);
      }

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, HEALTH_CHECK_CONFIG.interval));
    }

    this.logger.warn(`Service ${serviceName} did not become healthy within ${timeout}ms`);
    return false;
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.checkAllServicesHealth();
      } catch (error) {
        this.logger.error(`Periodic health check failed: ${error.message}`);
      }
    }, HEALTH_CHECK_CONFIG.interval);

    this.logger.log(`Started periodic health checks every ${HEALTH_CHECK_CONFIG.interval}ms`);
  }

  private mapHealthStatus(status: string): HealthStatus {
    switch (status?.toUpperCase()) {
      case 'UP':
      case 'HEALTHY':
        return HealthStatus.UP;
      case 'DOWN':
      case 'UNHEALTHY':
        return HealthStatus.DOWN;
      case 'DEGRADED':
      case 'PARTIAL':
        return HealthStatus.DEGRADED;
      default:
        return HealthStatus.UNKNOWN;
    }
  }

  private calculateSystemStatus(servicesHealth: Record<string, ServiceHealth>): HealthStatus {
    const statuses = Object.values(servicesHealth).map(h => h.status);
    
    if (statuses.every(s => s === HealthStatus.UP)) {
      return HealthStatus.UP;
    }
    
    if (statuses.some(s => s === HealthStatus.UP)) {
      return HealthStatus.DEGRADED;
    }
    
    if (statuses.every(s => s === HealthStatus.DOWN)) {
      return HealthStatus.DOWN;
    }
    
    return HealthStatus.UNKNOWN;
  }

  private async logHealthStatusChange(serviceName: string, fromStatus: HealthStatus, toStatus: HealthStatus): Promise<void> {
    await this.eventStore.appendEvent({
      aggregateId: `health_${serviceName}`,
      eventType: 'HEALTH_STATUS_CHANGED',
      data: {
        service: serviceName,
        fromStatus,
        toStatus,
        timestamp: new Date(),
      },
      metadata: { version: 1 },
    });

    this.logger.log(`Service ${serviceName} health changed from ${fromStatus} to ${toStatus}`);
  }

  onModuleDestroy() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }
}
