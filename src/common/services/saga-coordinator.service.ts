import { Injectable, Logger } from '@nestjs/common';
import { EventStoreService } from './event-store.service';
import { v4 as uuidv4 } from 'uuid';

export enum SagaStatus {
  STARTED = 'STARTED',
  RUNNING = 'RUNNING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPENSATING = 'COMPENSATING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  COMPENSATED = 'COMPENSATED',
}

export interface SagaStep {
  id: string;
  name: string;
  action: () => Promise<any>;
  compensationAction: () => Promise<void>;
  executed: boolean;
  compensated: boolean;
  result?: any;
  error?: Error;
}

export interface SagaDefinition {
  id: string;
  name: string;
  steps: SagaStep[];
  status: SagaStatus;
  startTime: Date;
  endTime?: Date;
  metadata?: any;
}

@Injectable()
export class SagaCoordinatorService {
  private readonly logger = new Logger(SagaCoordinatorService.name);
  private sagas = new Map<string, SagaDefinition>();

  constructor(private readonly eventStore: EventStoreService) {}

  async startSaga(name: string, steps: Omit<SagaStep, 'id' | 'executed' | 'compensated'>[], metadata?: any): Promise<string> {
    const id = uuidv4();
    const saga: SagaDefinition = {
      id: id,
      name,
      steps: steps.map(step => ({
        ...step,
        id: uuidv4(),
        executed: false,
        compensated: false,
      })),
      status: SagaStatus.STARTED,
      startTime: new Date(),
      metadata,
    };

    this.sagas.set(id, saga);

    await this.eventStore.saveEvent(id, 'SagaStarted', {
      name,
      steps: saga.steps.map(s => ({ id: s.id, name: s.name })),
      metadata,
    });

    this.logger.log(`Saga ${name} started with ID: ${id}`);
    
    // Execute saga asynchronously
    this.executeSaga(id).catch(error => {
      this.logger.error(`Saga ${id} failed: ${error.message}`, error.stack);
    });

    return id;
  }

  private async executeSaga(id: string): Promise<void> {
    const saga = this.sagas.get(id);
    if (!saga) {
      throw new Error(`Saga ${id} not found`);
    }

    saga.status = SagaStatus.IN_PROGRESS;

    try {
      for (const step of saga.steps) {
        this.logger.debug(`Executing step: ${step.name} in saga ${id}`);
        
        try {
          step.result = await step.action();
          step.executed = true;

          await this.eventStore.saveEvent(id, 'StepCompleted', {
            id: step.id,
            stepName: step.name,
            result: step.result,
          });

          this.logger.debug(`Step ${step.name} completed successfully`);
        } catch (error) {
          step.error = error as Error;
          
          await this.eventStore.saveEvent(id, 'StepFailed', {
            id: step.id,
            stepName: step.name,
            error: error.message,
          });

          this.logger.error(`Step ${step.name} failed: ${error.message}`);
          throw error;
        }
      }

      saga.status = SagaStatus.COMPLETED;
      saga.endTime = new Date();

      await this.eventStore.saveEvent(id, 'SagaCompleted', {
        duration: saga.endTime.getTime() - saga.startTime.getTime(),
      });

      this.logger.log(`Saga ${id} completed successfully`);
    } catch (error) {
      saga.status = SagaStatus.COMPENSATING;
      
      await this.eventStore.saveEvent(id, 'SagaFailed', {
        error: error.message,
        failedStep: saga.steps.find(s => s.error)?.name,
      });

      await this.compensateSaga(id);
    }
  }

  private async compensateSaga(id: string): Promise<void> {
    const saga = this.sagas.get(id);
    if (!saga) {
      throw new Error(`Saga ${id} not found`);
    }

    this.logger.warn(`Starting compensation for saga ${id}`);

    // Execute compensation actions in reverse order
    const executedSteps = saga.steps.filter(step => step.executed).reverse();

    for (const step of executedSteps) {
      try {
        this.logger.debug(`Compensating step: ${step.name}`);
        
        await step.compensationAction();
        step.compensated = true;

        await this.eventStore.saveEvent(id, 'StepCompensated', {
          id: step.id,
          stepName: step.name,
        });

        this.logger.debug(`Step ${step.name} compensated successfully`);
      } catch (error) {
        this.logger.error(`Compensation failed for step ${step.name}: ${error.message}`);
        
        await this.eventStore.saveEvent(id, 'CompensationFailed', {
          id: step.id,
          stepName: step.name,
          error: error.message,
        });
      }
    }

    saga.status = SagaStatus.COMPENSATED;
    saga.endTime = new Date();

    await this.eventStore.saveEvent(id, 'SagaCompensated', {
      duration: saga.endTime.getTime() - saga.startTime.getTime(),
    });

    this.logger.log(`Saga ${id} compensation completed`);
  }

  async getSaga(id: string): Promise<SagaDefinition | undefined> {
    return this.sagas.get(id);
  }

  async getAllSagas(): Promise<SagaDefinition[]> {
    return Array.from(this.sagas.values());
  }

  async getSagasByStatus(status: SagaStatus): Promise<SagaDefinition[]> {
    return Array.from(this.sagas.values()).filter(saga => saga.status === status);
  }

  getActiveSagas(): SagaDefinition[] {
    return Array.from(this.sagas.values()).filter(saga => saga.status === SagaStatus.RUNNING);
  }

  getSagaStatus(id: string): SagaDefinition | null {
    return this.sagas.get(id) || null;
  }

  async getSagaHistory(id: string): Promise<any[]> {
    const saga = this.sagas.get(id);
    if (!saga) {
      return [];
    }
    
    return saga.steps.map((step, index) => ({
      id: `step-${index}`,
      status: step.executed ? 'completed' : 'pending',
      executedAt: step.executed ? new Date() : null,
      error: step.error,
    }));
  }

  async retrySaga(id: string): Promise<void> {
    const saga = this.sagas.get(id);
    if (!saga) {
      throw new Error(`Saga ${id} not found`);
    }

    if (saga.status !== SagaStatus.FAILED && saga.status !== SagaStatus.COMPENSATED) {
      throw new Error(`Cannot retry saga in status: ${saga.status}`);
    }

    // Reset saga state
    saga.steps.forEach(step => {
      step.executed = false;
      step.compensated = false;
      step.result = undefined;
      step.error = undefined;
    });

    saga.status = SagaStatus.STARTED;
    saga.startTime = new Date();
    saga.endTime = undefined;

    await this.eventStore.saveEvent(id, 'SagaRetried', {});

    this.logger.log(`Retrying saga ${id}`);
    await this.executeSaga(id);
  }
}
