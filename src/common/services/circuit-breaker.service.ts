import { Injectable, Logger } from '@nestjs/common';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN', 
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  monitorTimeout?: number;
  timeout?: number;
  name?: string;
}

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private circuits = new Map<string, CircuitBreakerState>();

  async execute<T>(
    serviceName: string,
    operation: () => Promise<T>,
    config: CircuitBreakerConfig,
  ): Promise<T> {
    const circuit = this.getCircuit(serviceName, config);

    if (circuit.state === CircuitState.OPEN) {
      if (Date.now() - circuit.lastFailureTime < config.recoveryTimeout) {
        throw new Error(`Circuit breaker is OPEN for ${serviceName}`);
      }
      circuit.state = CircuitState.HALF_OPEN;
      this.logger.log(`Circuit breaker ${serviceName} moved to HALF_OPEN`);
    }

    try {
      const result = await operation();
      
      if (circuit.state === CircuitState.HALF_OPEN) {
        circuit.state = CircuitState.CLOSED;
        circuit.failureCount = 0;
        this.logger.log(`Circuit breaker ${serviceName} moved to CLOSED`);
      }
      
      return result;
    } catch (error) {
      circuit.failureCount++;
      circuit.lastFailureTime = Date.now();

      if (circuit.failureCount >= config.failureThreshold) {
        circuit.state = CircuitState.OPEN;
        this.logger.error(`Circuit breaker ${serviceName} moved to OPEN`);
      }

      throw error;
    }
  }

  private getCircuit(serviceName: string, config: CircuitBreakerConfig): CircuitBreakerState {
    if (!this.circuits.has(serviceName)) {
      this.circuits.set(serviceName, {
        state: CircuitState.CLOSED,
        failureCount: 0,
        lastFailureTime: 0,
        config,
      });
    }
    return this.circuits.get(serviceName)!;
  }

  getCircuitState(serviceName: string): CircuitState {
    return this.circuits.get(serviceName)?.state || CircuitState.CLOSED;
  }

  getAllCircuitsStats(): any {
    const stats: any = {};
    for (const [name, circuit] of this.circuits.entries()) {
      stats[name] = {
        state: circuit.state,
        failureCount: circuit.failureCount,
        lastFailureTime: circuit.lastFailureTime,
        config: circuit.config,
      };
    }
    return stats;
  }

  getCircuitStats(serviceName: string): any {
    const circuit = this.circuits.get(serviceName);
    if (!circuit) {
      return null;
    }
    return {
      state: circuit.state,
      failureCount: circuit.failureCount,
      lastFailureTime: circuit.lastFailureTime,
      config: circuit.config,
    };
  }

  resetCircuit(serviceName: string): void {
    const circuit = this.circuits.get(serviceName);
    if (circuit) {
      circuit.state = CircuitState.CLOSED;
      circuit.failureCount = 0;
      circuit.lastFailureTime = 0;
      this.logger.log(`Circuit breaker ${serviceName} reset to CLOSED`);
    }
  }
}

interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number;
  config: CircuitBreakerConfig;
}
