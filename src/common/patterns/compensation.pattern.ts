import { Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { EventStoreService } from '../services/event-store.service';

export interface CompensationAction {
  actionId: string;
  serviceName: string;
  method: string;
  parameters: any;
  timeout?: number;
  retries?: number;
}

export interface CompensationPlan {
  planId: string;
  transactionId: string;
  actions: CompensationAction[];
  createdAt: Date;
  status: CompensationStatus;
}

export enum CompensationStatus {
  PENDING = 'PENDING',
  EXECUTING = 'EXECUTING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  PARTIAL = 'PARTIAL',
}

export interface CompensationResult {
  actionId: string;
  success: boolean;
  error?: string;
  executedAt: Date;
}

@Injectable()
export class CompensationPatternService {
  private readonly logger = new Logger(CompensationPatternService.name);
  private readonly compensationPlans = new Map<string, CompensationPlan>();
  private readonly serviceClients = new Map<string, ClientProxy>();

  constructor(private readonly eventStore: EventStoreService) {}

  registerServiceClient(serviceName: string, client: ClientProxy): void {
    this.serviceClients.set(serviceName, client);
    this.logger.log(`Registered service client for compensation: ${serviceName}`);
  }

  createCompensationPlan(transactionId: string): CompensationPlan {
    const plan: CompensationPlan = {
      planId: this.generatePlanId(),
      transactionId,
      actions: [],
      createdAt: new Date(),
      status: CompensationStatus.PENDING,
    };

    this.compensationPlans.set(plan.planId, plan);
    this.logger.debug(`Created compensation plan: ${plan.planId}`);

    return plan;
  }

  addCompensationAction(
    planId: string,
    serviceName: string,
    method: string,
    parameters: any,
    options?: { timeout?: number; retries?: number },
  ): void {
    const plan = this.compensationPlans.get(planId);
    if (!plan) {
      throw new Error(`Compensation plan ${planId} not found`);
    }

    const action: CompensationAction = {
      actionId: this.generateActionId(),
      serviceName,
      method,
      parameters,
      timeout: options?.timeout || 30000,
      retries: options?.retries || 3,
    };

    plan.actions.push(action);
    this.logger.debug(`Added compensation action ${action.actionId} to plan ${planId}`);
  }

  async executeCompensation(planId: string): Promise<CompensationResult[]> {
    const plan = this.compensationPlans.get(planId);
    if (!plan) {
      throw new Error(`Compensation plan ${planId} not found`);
    }

    plan.status = CompensationStatus.EXECUTING;

    await this.eventStore.appendEvent({
      aggregateId: `compensation_${planId}`,
      eventType: 'COMPENSATION_STARTED',
      data: {
        planId,
        transactionId: plan.transactionId,
        actionsCount: plan.actions.length,
      },
      metadata: { version: 1 },
    });

    this.logger.log(`Starting compensation for plan ${planId}`);

    const results: CompensationResult[] = [];

    // Execute compensation actions in reverse order
    for (let i = plan.actions.length - 1; i >= 0; i--) {
      const action = plan.actions[i];
      const result = await this.executeCompensationAction(action);
      results.push(result);

      await this.eventStore.appendEvent({
        aggregateId: `compensation_${planId}`,
        eventType: 'COMPENSATION_ACTION_COMPLETED',
        data: {
          actionId: action.actionId,
          success: result.success,
          error: result.error,
        },
        metadata: { version: plan.actions.length - i + 1 },
      });
    }

    // Update plan status
    const allSuccess = results.every(r => r.success);
    const anySuccess = results.some(r => r.success);

    if (allSuccess) {
      plan.status = CompensationStatus.COMPLETED;
    } else if (anySuccess) {
      plan.status = CompensationStatus.PARTIAL;
    } else {
      plan.status = CompensationStatus.FAILED;
    }

    await this.eventStore.appendEvent({
      aggregateId: `compensation_${planId}`,
      eventType: 'COMPENSATION_FINISHED',
      data: {
        planId,
        status: plan.status,
        results: results.map(r => ({
          actionId: r.actionId,
          success: r.success,
          error: r.error,
        })),
      },
      metadata: { version: plan.actions.length + 2 },
    });

    this.logger.log(`Compensation plan ${planId} completed with status: ${plan.status}`);

    return results;
  }

  private async executeCompensationAction(action: CompensationAction): Promise<CompensationResult> {
    this.logger.debug(`Executing compensation action: ${action.actionId}`);

    const client = this.serviceClients.get(action.serviceName);
    if (!client) {
      return {
        actionId: action.actionId,
        success: false,
        error: `Service client not found: ${action.serviceName}`,
        executedAt: new Date(),
      };
    }

    let attempts = 0;
    let lastError: any;

    while (attempts < (action.retries || 3)) {
      try {
        const result = await Promise.race([
          client.send(action.method, action.parameters).toPromise(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Action timeout')), action.timeout || 30000),
          ),
        ]);

        this.logger.debug(`Compensation action ${action.actionId} completed successfully`);

        return {
          actionId: action.actionId,
          success: true,
          executedAt: new Date(),
        };

      } catch (error) {
        lastError = error;
        attempts++;

        this.logger.warn(
          `Compensation action ${action.actionId} failed (attempt ${attempts}/${action.retries}): ${error.message}`,
        );

        if (attempts < (action.retries || 3)) {
          // Wait before retry with exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempts - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    return {
      actionId: action.actionId,
      success: false,
      error: lastError.message,
      executedAt: new Date(),
    };
  }

  // Predefined compensation patterns

  async createUserRegistrationCompensation(
    transactionId: string,
    userId: string,
    profileId?: string,
    notificationId?: string,
  ): Promise<string> {
    const plan = this.createCompensationPlan(transactionId);

    // Compensation actions in order they should be executed (reverse of creation)
    if (notificationId) {
      this.addCompensationAction(
        plan.planId,
        'USER_SERVICE',
        'cancel_notification',
        { notificationId },
      );
    }

    if (profileId) {
      this.addCompensationAction(
        plan.planId,
        'USER_SERVICE',
        'delete_user_profile',
        { profileId },
      );
    }

    this.addCompensationAction(
      plan.planId,
      'USER_SERVICE',
      'delete_user',
      { userId },
    );

    return plan.planId;
  }

  async createPatientQueueCompensation(
    transactionId: string,
    patientId: string,
    queueId?: string,
    notificationId?: string,
  ): Promise<string> {
    const plan = this.createCompensationPlan(transactionId);

    if (notificationId) {
      this.addCompensationAction(
        plan.planId,
        'PATIENT_QUEUE_SERVICE',
        'cancel_notification',
        { notificationId },
      );
    }

    if (queueId) {
      this.addCompensationAction(
        plan.planId,
        'PATIENT_QUEUE_SERVICE',
        'remove_from_queue',
        { patientId, queueId },
      );
    }

    this.addCompensationAction(
      plan.planId,
      'PATIENT_QUEUE_SERVICE',
      'delete_patient',
      { patientId },
    );

    return plan.planId;
  }

  async createPatientTransferCompensation(
    transactionId: string,
    patientId: string,
    fromQueueId: string,
    toQueueId: string,
    originalPosition: number,
  ): Promise<string> {
    const plan = this.createCompensationPlan(transactionId);

    // Remove from destination queue
    this.addCompensationAction(
      plan.planId,
      'PATIENT_QUEUE_SERVICE',
      'remove_from_queue',
      { patientId, queueId: toQueueId },
    );

    // Re-add to original queue at original position
    this.addCompensationAction(
      plan.planId,
      'PATIENT_QUEUE_SERVICE',
      'add_to_queue_at_position',
      { patientId, queueId: fromQueueId, position: originalPosition },
    );

    return plan.planId;
  }

  getCompensationPlan(planId: string): CompensationPlan | undefined {
    return this.compensationPlans.get(planId);
  }

  getCompensationPlanByTransaction(transactionId: string): CompensationPlan | undefined {
    for (const plan of this.compensationPlans.values()) {
      if (plan.transactionId === transactionId) {
        return plan;
      }
    }
    return undefined;
  }

  async getCompensationHistory(planId: string): Promise<any[]> {
    const events = await this.eventStore.getEvents({ aggregateId: `compensation_${planId}` });
    return events.filter(event => event.eventType.startsWith('COMPENSATION_'));
  }

  cleanupCompletedPlans(olderThanHours = 24): void {
    const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000);
    
    for (const [planId, plan] of this.compensationPlans.entries()) {
      if (
        (plan.status === CompensationStatus.COMPLETED || plan.status === CompensationStatus.FAILED) &&
        plan.createdAt.getTime() < cutoffTime
      ) {
        this.compensationPlans.delete(planId);
      }
    }

    this.logger.debug(`Cleaned up old compensation plans older than ${olderThanHours} hours`);
  }

  private generatePlanId(): string {
    return `comp_plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateActionId(): string {
    return `comp_action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
