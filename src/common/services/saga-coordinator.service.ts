import { Injectable, Logger } from '@nestjs/common';
import { EventStoreService } from './event-store.service';
import { v4 as uuidv4 } from 'uuid';

export enum SagaStatus {
  STARTED = 'STARTED',
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
    const sagaId = uuidv4();
    const saga: SagaDefinition = {
      id: sagaId,
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

    this.sagas.set(sagaId, saga);

    await this.eventStore.saveEvent(sagaId, 'SagaStarted', {
      name,
      steps: saga.steps.map(s => ({ id: s.id, name: s.name })),
      metadata,
    });

    this.logger.log(`Saga ${name} started with ID: ${sagaId}`);
    
    // Execute saga asynchronously
    this.executeSaga(sagaId).catch(error => {
      this.logger.error(`Saga ${sagaId} failed: ${error.message}`, error.stack);
    });

    return sagaId;
  }

  private async executeSaga(sagaId: string): Promise<void> {
    const saga = this.sagas.get(sagaId);
    if (!saga) {
      throw new Error(`Saga ${sagaId} not found`);
    }

    saga.status = SagaStatus.IN_PROGRESS;

    try {
      for (const step of saga.steps) {
        this.logger.debug(`Executing step: ${step.name} in saga ${sagaId}`);
        
        try {
          step.result = await step.action();
          step.executed = true;

          await this.eventStore.saveEvent(sagaId, 'StepCompleted', {
            stepId: step.id,
            stepName: step.name,
            result: step.result,
          });

          this.logger.debug(`Step ${step.name} completed successfully`);
        } catch (error) {
          step.error = error as Error;
          
          await this.eventStore.saveEvent(sagaId, 'StepFailed', {
            stepId: step.id,
            stepName: step.name,
            error: error.message,
          });

          this.logger.error(`Step ${step.name} failed: ${error.message}`);
          throw error;
        }
      }

      saga.status = SagaStatus.COMPLETED;
      saga.endTime = new Date();

      await this.eventStore.saveEvent(sagaId, 'SagaCompleted', {
        duration: saga.endTime.getTime() - saga.startTime.getTime(),
      });

      this.logger.log(`Saga ${sagaId} completed successfully`);
    } catch (error) {
      saga.status = SagaStatus.COMPENSATING;
      
      await this.eventStore.saveEvent(sagaId, 'SagaFailed', {
        error: error.message,
        failedStep: saga.steps.find(s => s.error)?.name,
      });

      await this.compensateSaga(sagaId);
    }
  }

  private async compensateSaga(sagaId: string): Promise<void> {
    const saga = this.sagas.get(sagaId);
    if (!saga) {
      throw new Error(`Saga ${sagaId} not found`);
    }

    this.logger.warn(`Starting compensation for saga ${sagaId}`);

    // Execute compensation actions in reverse order
    const executedSteps = saga.steps.filter(step => step.executed).reverse();

    for (const step of executedSteps) {
      try {
        this.logger.debug(`Compensating step: ${step.name}`);
        
        await step.compensationAction();
        step.compensated = true;

        await this.eventStore.saveEvent(sagaId, 'StepCompensated', {
          stepId: step.id,
          stepName: step.name,
        });

        this.logger.debug(`Step ${step.name} compensated successfully`);
      } catch (error) {
        this.logger.error(`Compensation failed for step ${step.name}: ${error.message}`);
        
        await this.eventStore.saveEvent(sagaId, 'CompensationFailed', {
          stepId: step.id,
          stepName: step.name,
          error: error.message,
        });
      }
    }

    saga.status = SagaStatus.COMPENSATED;
    saga.endTime = new Date();

    await this.eventStore.saveEvent(sagaId, 'SagaCompensated', {
      duration: saga.endTime.getTime() - saga.startTime.getTime(),
    });

    this.logger.log(`Saga ${sagaId} compensation completed`);
  }

  async getSaga(sagaId: string): Promise<SagaDefinition | undefined> {
    return this.sagas.get(sagaId);
  }

  async getAllSagas(): Promise<SagaDefinition[]> {
    return Array.from(this.sagas.values());
  }

  async getSagasByStatus(status: SagaStatus): Promise<SagaDefinition[]> {
    return Array.from(this.sagas.values()).filter(saga => saga.status === status);
  }

  async retrySaga(sagaId: string): Promise<void> {
    const saga = this.sagas.get(sagaId);
    if (!saga) {
      throw new Error(`Saga ${sagaId} not found`);
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

    await this.eventStore.saveEvent(sagaId, 'SagaRetried', {});

    this.logger.log(`Retrying saga ${sagaId}`);
    await this.executeSaga(sagaId);
  }
}
