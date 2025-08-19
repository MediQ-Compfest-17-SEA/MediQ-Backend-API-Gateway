import { Injectable, Logger } from '@nestjs/common';
import { CircuitBreakerConfig, CIRCUIT_BREAKER_CONFIG } from 'src/config/resilience.config';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

interface CircuitBreakerStats {
  failureCount: number;
  successCount: number;
  lastFailureTime?: number;
  state: CircuitState;
  nextAttempt?: number;
}

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly circuits = new Map<string, CircuitBreakerStats>();

  async execute<T>(
    serviceKey: string,
    operation: () => Promise<T>,
    fallback?: () => Promise<T>,
  ): Promise<T> {
    const config = CIRCUIT_BREAKER_CONFIG[serviceKey];
    if (!config) {
      this.logger.warn(`No circuit breaker config found for service: ${serviceKey}`);
      return operation();
    }

    const circuit = this.getOrCreateCircuit(serviceKey);

    if (this.isCircuitOpen(circuit, config)) {
      this.logger.warn(`Circuit breaker OPEN for service: ${serviceKey}`);
      
      if (fallback) {
        return fallback();
      }
      
      throw new Error(`Circuit breaker is OPEN for service: ${serviceKey}`);
    }

    try {
      const result = await operation();
      this.onSuccess(serviceKey, circuit, config);
      return result;
    } catch (error) {
      this.onFailure(serviceKey, circuit, config, error);
      
      if (fallback && this.isCircuitOpen(circuit, config)) {
        this.logger.warn(`Executing fallback for service: ${serviceKey}`);
        return fallback();
      }
      
      throw error;
    }
  }

  private getOrCreateCircuit(serviceKey: string): CircuitBreakerStats {
    if (!this.circuits.has(serviceKey)) {
      this.circuits.set(serviceKey, {
        failureCount: 0,
        successCount: 0,
        state: CircuitState.CLOSED,
      });
    }
    return this.circuits.get(serviceKey)!;
  }

  private isCircuitOpen(circuit: CircuitBreakerStats, config: CircuitBreakerConfig): boolean {
    if (circuit.state === CircuitState.CLOSED) {
      return false;
    }

    if (circuit.state === CircuitState.OPEN) {
      if (circuit.nextAttempt && Date.now() < circuit.nextAttempt) {
        return true;
      }
      
      // Transition to HALF_OPEN
      circuit.state = CircuitState.HALF_OPEN;
      circuit.successCount = 0;
      this.logger.log(`Circuit breaker transitioning to HALF_OPEN`);
      return false;
    }

    return false;
  }

  private onSuccess(serviceKey: string, circuit: CircuitBreakerStats, config: CircuitBreakerConfig): void {
    circuit.successCount++;
    
    if (circuit.state === CircuitState.HALF_OPEN) {
      if (circuit.successCount >= config.successThreshold) {
        circuit.state = CircuitState.CLOSED;
        circuit.failureCount = 0;
        circuit.successCount = 0;
        this.logger.log(`Circuit breaker CLOSED for service: ${serviceKey}`);
      }
    } else if (circuit.state === CircuitState.CLOSED) {
      // Reset failure count on success
      circuit.failureCount = 0;
    }
  }

  private onFailure(serviceKey: string, circuit: CircuitBreakerStats, config: CircuitBreakerConfig, error: any): void {
    circuit.failureCount++;
    circuit.lastFailureTime = Date.now();

    if (circuit.state === CircuitState.CLOSED || circuit.state === CircuitState.HALF_OPEN) {
      if (circuit.failureCount >= config.failureThreshold) {
        circuit.state = CircuitState.OPEN;
        circuit.nextAttempt = Date.now() + config.timeout;
        this.logger.error(`Circuit breaker OPENED for service: ${serviceKey}. Error: ${error.message}`);
      }
    }
  }

  getCircuitStats(serviceKey: string): CircuitBreakerStats | undefined {
    return this.circuits.get(serviceKey);
  }

  getAllCircuitsStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    this.circuits.forEach((value, key) => {
      stats[key] = { ...value };
    });
    return stats;
  }

  resetCircuit(serviceKey: string): void {
    const circuit = this.circuits.get(serviceKey);
    if (circuit) {
      circuit.state = CircuitState.CLOSED;
      circuit.failureCount = 0;
      circuit.successCount = 0;
      circuit.lastFailureTime = undefined;
      circuit.nextAttempt = undefined;
      this.logger.log(`Circuit breaker reset for service: ${serviceKey}`);
    }
  }
}
