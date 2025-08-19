import { Injectable, Logger } from '@nestjs/common';
import { EventStoreService } from './event-store.service';
import { SAGA_CONFIG } from 'src/config/resilience.config';

export interface SagaStep {
  stepId: string;
  action: () => Promise<any>;
  compensation: () => Promise<any>;
  timeout?: number;
}

export interface SagaDefinition {
  sagaId: string;
  steps: SagaStep[];
  timeout?: number;
}

export enum SagaStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  COMPENSATING = 'COMPENSATING',
  COMPENSATED = 'COMPENSATED',
}

export interface SagaExecution {
  sagaId: string;
  status: SagaStatus;
  currentStep: number;
  completedSteps: string[];
  failedStep?: string;
  startTime: Date;
  endTime?: Date;
  error?: string;
  context: any;
}

@Injectable()
export class SagaCoordinatorService {
  private readonly logger = new Logger(SagaCoordinatorService.name);
  private readonly activeSagas = new Map<string, SagaExecution>();

  constructor(private readonly eventStore: EventStoreService) {}

  async executeSaga(definition: SagaDefinition, context: any = {}): Promise<string> {
    const execution: SagaExecution = {
      sagaId: definition.sagaId,
      status: SagaStatus.PENDING,
      currentStep: 0,
      completedSteps: [],
      startTime: new Date(),
      context,
    };

    this.activeSagas.set(definition.sagaId, execution);

    await this.eventStore.appendEvent({
      aggregateId: definition.sagaId,
      eventType: 'SAGA_STARTED',
      eventData: {
        sagaId: definition.sagaId,
        steps: definition.steps.map(s => s.stepId),
        context,
      },
      version: 1,
    });

    try {
      await this.runSaga(definition, execution);
      return definition.sagaId;
    } catch (error) {
      this.logger.error(`Saga ${definition.sagaId} failed: ${error.message}`);
      throw error;
    }
  }

  private async runSaga(definition: SagaDefinition, execution: SagaExecution): Promise<void> {
    execution.status = SagaStatus.RUNNING;

    const timeout = definition.timeout || SAGA_CONFIG.timeout;
    const sagaTimeout = setTimeout(() => {
      this.handleSagaTimeout(definition.sagaId);
    }, timeout);

    try {
      for (let i = 0; i < definition.steps.length; i++) {
        const step = definition.steps[i];
        execution.currentStep = i;

        await this.eventStore.appendEvent({
          aggregateId: definition.sagaId,
          eventType: 'SAGA_STEP_STARTED',
          eventData: {
            stepId: step.stepId,
            stepIndex: i,
          },
          version: execution.completedSteps.length + 2,
        });

        try {
          const stepTimeout = step.timeout || SAGA_CONFIG.timeout;
          const result = await Promise.race([
            step.action(),
            this.createTimeoutPromise(stepTimeout, `Step ${step.stepId} timed out`),
          ]);

          execution.completedSteps.push(step.stepId);
          execution.context.stepResults = execution.context.stepResults || {};
          execution.context.stepResults[step.stepId] = result;

          await this.eventStore.appendEvent({
            aggregateId: definition.sagaId,
            eventType: 'SAGA_STEP_COMPLETED',
            eventData: {
              stepId: step.stepId,
              stepIndex: i,
              result,
            },
            version: execution.completedSteps.length + 1,
          });

          this.logger.debug(`Saga ${definition.sagaId} completed step ${step.stepId}`);

        } catch (error) {
          execution.status = SagaStatus.FAILED;
          execution.failedStep = step.stepId;
          execution.error = error.message;

          await this.eventStore.appendEvent({
            aggregateId: definition.sagaId,
            eventType: 'SAGA_STEP_FAILED',
            eventData: {
              stepId: step.stepId,
              stepIndex: i,
              error: error.message,
            },
            version: execution.completedSteps.length + 2,
          });

          this.logger.error(`Saga ${definition.sagaId} step ${step.stepId} failed: ${error.message}`);

          // Start compensation
          await this.compensateSaga(definition, execution);
          throw error;
        }
      }

      // All steps completed successfully
      execution.status = SagaStatus.COMPLETED;
      execution.endTime = new Date();

      await this.eventStore.appendEvent({
        aggregateId: definition.sagaId,
        eventType: 'SAGA_COMPLETED',
        eventData: {
          sagaId: definition.sagaId,
          duration: execution.endTime.getTime() - execution.startTime.getTime(),
        },
        version: execution.completedSteps.length + 2,
      });

      this.logger.log(`Saga ${definition.sagaId} completed successfully`);

    } finally {
      clearTimeout(sagaTimeout);
      this.activeSagas.delete(definition.sagaId);
    }
  }

  private async compensateSaga(definition: SagaDefinition, execution: SagaExecution): Promise<void> {
    execution.status = SagaStatus.COMPENSATING;

    await this.eventStore.appendEvent({
      aggregateId: definition.sagaId,
      eventType: 'SAGA_COMPENSATION_STARTED',
      eventData: {
        failedStep: execution.failedStep,
        completedSteps: execution.completedSteps,
      },
      version: execution.completedSteps.length + 3,
    });

    this.logger.log(`Starting compensation for saga ${definition.sagaId}`);

    // Compensate in reverse order
    for (let i = execution.completedSteps.length - 1; i >= 0; i--) {
      const stepId = execution.completedSteps[i];
      const step = definition.steps.find(s => s.stepId === stepId);

      if (!step) {
        this.logger.warn(`Step ${stepId} not found for compensation`);
        continue;
      }

      try {
        const compensationTimeout = SAGA_CONFIG.compensationTimeout;
        await Promise.race([
          step.compensation(),
          this.createTimeoutPromise(compensationTimeout, `Compensation for step ${stepId} timed out`),
        ]);

        await this.eventStore.appendEvent({
          aggregateId: definition.sagaId,
          eventType: 'SAGA_STEP_COMPENSATED',
          eventData: { stepId },
          version: execution.completedSteps.length + 4 + (execution.completedSteps.length - 1 - i),
        });

        this.logger.debug(`Compensated step ${stepId} for saga ${definition.sagaId}`);

      } catch (error) {
        this.logger.error(`Failed to compensate step ${stepId}: ${error.message}`);
        
        await this.eventStore.appendEvent({
          aggregateId: definition.sagaId,
          eventType: 'SAGA_COMPENSATION_FAILED',
          eventData: {
            stepId,
            error: error.message,
          },
          version: execution.completedSteps.length + 4 + (execution.completedSteps.length - 1 - i),
        });
      }
    }

    execution.status = SagaStatus.COMPENSATED;
    execution.endTime = new Date();

    await this.eventStore.appendEvent({
      aggregateId: definition.sagaId,
      eventType: 'SAGA_COMPENSATED',
      eventData: {
        sagaId: definition.sagaId,
        duration: execution.endTime.getTime() - execution.startTime.getTime(),
      },
      version: execution.completedSteps.length + 20,
    });

    this.logger.log(`Saga ${definition.sagaId} compensation completed`);
  }

  private async handleSagaTimeout(sagaId: string): Promise<void> {
    const execution = this.activeSagas.get(sagaId);
    if (!execution) return;

    execution.status = SagaStatus.FAILED;
    execution.error = 'Saga timeout';
    execution.endTime = new Date();

    await this.eventStore.appendEvent({
      aggregateId: sagaId,
      eventType: 'SAGA_TIMEOUT',
      eventData: {
        sagaId,
        currentStep: execution.currentStep,
      },
      version: execution.completedSteps.length + 10,
    });

    this.logger.error(`Saga ${sagaId} timed out`);
  }

  private createTimeoutPromise(timeout: number, message: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeout);
    });
  }

  getSagaStatus(sagaId: string): SagaExecution | undefined {
    return this.activeSagas.get(sagaId);
  }

  async getSagaHistory(sagaId: string): Promise<any[]> {
    const events = await this.eventStore.getEvents(sagaId);
    return events.filter(event => event.eventType.startsWith('SAGA_'));
  }

  getActiveSagas(): SagaExecution[] {
    return Array.from(this.activeSagas.values());
  }

  async retrySaga(sagaId: string): Promise<void> {
    // Implementation for retrying failed sagas
    const events = await this.eventStore.getEvents(sagaId);
    const sagaStartEvent = events.find(e => e.eventType === 'SAGA_STARTED');
    
    if (!sagaStartEvent) {
      throw new Error(`Saga ${sagaId} not found`);
    }

    this.logger.log(`Retrying saga ${sagaId}`);
    // Implementation would reconstruct and retry the saga
  }
}
