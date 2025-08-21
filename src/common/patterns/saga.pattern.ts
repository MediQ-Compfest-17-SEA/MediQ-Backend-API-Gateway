import { Injectable, Logger } from '@nestjs/common';
import { SagaCoordinatorService, SagaDefinition, SagaStep, SagaStatus } from '../services/saga-coordinator.service';
import { ClientProxy } from '@nestjs/microservices';

export interface UserRegistrationSagaContext {
  userData: {
    email: string;
    password: string;
    name: string;
    role: string;
  };
  userId?: string;
  profileId?: string;
  notificationsSent?: boolean;
}

export interface PatientQueueSagaContext {
  patientData: {
    name: string;
    phone: string;
    complaint: string;
    priority: string;
  };
  patientId?: string;
  queuePosition?: number;
  notificationsSent?: boolean;
}

@Injectable()
export class SagaPatternService {
  private readonly logger = new Logger(SagaPatternService.name);

  constructor(
    private readonly sagaCoordinator: SagaCoordinatorService,
  ) {}

  async executeUserRegistrationSaga(
    context: UserRegistrationSagaContext,
    userServiceClient: ClientProxy,
  ): Promise<string> {
    const sagaId = `user_registration_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const sagaDefinition: SagaDefinition = {
      id: sagaId,
      name: 'user_registration_saga',
      steps: [
        this.createUserStep(userServiceClient),
        this.createUserProfileStep(userServiceClient),
        this.sendWelcomeNotificationStep(userServiceClient),
      ],
      status: SagaStatus.STARTED,
      startTime: new Date(),
    };

    await this.sagaCoordinator.startSaga('user_registration_saga', sagaDefinition.steps);
    return sagaId;
  }

  async executePatientQueueSaga(
    context: PatientQueueSagaContext,
    patientQueueServiceClient: ClientProxy,
  ): Promise<string> {
    const sagaId = `patient_queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const sagaSteps = [
      this.validatePatientDataStep(),
      this.createPatientStep(patientQueueServiceClient),
      this.addToQueueStep(patientQueueServiceClient),
      this.sendQueueNotificationStep(patientQueueServiceClient),
    ];

    return await this.sagaCoordinator.startSaga('patient_queue_saga', sagaSteps);
  }

  async executeComplexPatientTransferSaga(
    fromQueueId: string,
    toQueueId: string,
    patientId: string,
    patientQueueServiceClient: ClientProxy,
  ): Promise<string> {
    const sagaId = `patient_transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const context = {
      fromQueueId,
      toQueueId,
      patientId,
      originalPosition: null,
      newPosition: null,
    };

    const sagaSteps = [
      this.validateTransferStep(patientQueueServiceClient),
      this.removeFromSourceQueueStep(patientQueueServiceClient),
      this.addToDestinationQueueStep(patientQueueServiceClient),
      this.notifyQueueChangesStep(patientQueueServiceClient),
    ];

    return await this.sagaCoordinator.startSaga('patient_transfer_saga', sagaSteps);
  }

  private createUserStep(userServiceClient: ClientProxy): SagaStep {
    return {
      name: "step",
      executed: false,
      compensated: false,
      id: 'create_user',
      action: async () => {
        this.logger.log('Saga: Creating user');
        
        const result = await userServiceClient
          .send('create_user', {
            email: 'context.userData.email',
            password: 'context.userData.password',
            name: 'context.userData.name',
            role: 'context.userData.role',
          })
          .toPromise();

        if (!result || !result.id) {
          throw new Error('Failed to create user');
        }

        return {
      name: "step",
      executed: false,
      compensated: false, userId: result.id };
      },
      compensationAction: async () => {
        this.logger.log('Saga: Compensating user creation');
        
        // Delete the created user
        await userServiceClient
          .send('delete_user', { userId: 'context.userId' })
          .toPromise();
      },

    };
  }

  private createUserProfileStep(userServiceClient: ClientProxy): SagaStep {
    return {
      name: "step",
      executed: false,
      compensated: false,
      id: 'create_user_profile',
      action: async () => {
        this.logger.log('Saga: Creating user profile');
        
        const result = await userServiceClient
          .send('create_user_profile', {
            userId: 'context.userId',
            name: 'context.userData.name',
          })
          .toPromise();

        if (!result || !result.id) {
          throw new Error('Failed to create user profile');
        }

        return {
      name: "step",
      executed: false,
      compensated: false, profileId: result.id };
      },
      compensationAction: async () => {
        this.logger.log('Saga: Compensating user profile creation');
        
        await userServiceClient
          .send('delete_user_profile', { profileId: 'context.profileId' })
          .toPromise();
      },

    };
  }

  private sendWelcomeNotificationStep(userServiceClient: ClientProxy): SagaStep {
    return {
      name: "step",
      executed: false,
      compensated: false,
      id: 'send_welcome_notification',
      action: async () => {
        this.logger.log('Saga: Sending welcome notification');
        
        await userServiceClient
          .send('send_notification', {
            userId: 'context.userId',
            type: 'welcome',
            email: 'context.userData.email',
          })
          .toPromise();

        return {
      name: "step",
      executed: false,
      compensated: false, notificationsSent: true };
      },
      compensationAction: async () => {
        this.logger.log('Saga: Compensating welcome notification');
        // Usually notifications can't be "unsent", but we can mark them as cancelled
        
        await userServiceClient
          .send('cancel_notification', {
            userId: 'context.userId',
            type: 'welcome',
          })
          .toPromise();
      },

    };
  }

  private validatePatientDataStep(): SagaStep {
    return {
      name: "step",
      executed: false,
      compensated: false,
      id: 'validate_patient_data',
      action: async () => {
        this.logger.log('Saga: Validating patient data');
        
        // Validation logic
        const requiredFields = ['name', 'phone', 'complaint'];
        const missingFields = requiredFields.filter(field => !('context.patientData' as any)[field]);
        
        if (missingFields.length > 0) {
          throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
        }

        return {
      name: "step",
      executed: false,
      compensated: false, validated: true };
      },
      compensationAction: async () => {
        this.logger.log('Saga: No compensation needed for validation');
        // Validation doesn't need compensation
      },
    };
  }

  private createPatientStep(patientQueueServiceClient: ClientProxy): SagaStep {
    return {
      name: "step",
      executed: false,
      compensated: false,
      id: 'create_patient',
      action: async () => {
        this.logger.log('Saga: Creating patient');
        
        const result = await patientQueueServiceClient
          .send('create_patient', 'context.patientData')
          .toPromise();

        if (!result || !result.id) {
          throw new Error('Failed to create patient');
        }

        return {
      name: "step",
      executed: false,
      compensated: false, patientId: result.id };
      },
      compensationAction: async () => {
        this.logger.log('Saga: Compensating patient creation');
        
        await patientQueueServiceClient
          .send('delete_patient', { patientId: 'context.patientId' })
          .toPromise();
      },

    };
  }

  private addToQueueStep(patientQueueServiceClient: ClientProxy): SagaStep {
    return {
      name: "step",
      executed: false,
      compensated: false,
      id: 'add_to_queue',
      action: async () => {
        this.logger.log('Saga: Adding patient to queue');
        
        const result = await patientQueueServiceClient
          .send('add_to_queue', {
            patientId: 'context.patientId',
            priority: 'context.patientData.priority',
          })
          .toPromise();

        return {
      name: "step",
      executed: false,
      compensated: false, queuePosition: result.position };
      },
      compensationAction: async () => {
        this.logger.log('Saga: Compensating queue addition');
        
        await patientQueueServiceClient
          .send('remove_from_queue', { patientId: 'context.patientId' })
          .toPromise();
      },

    };
  }

  private sendQueueNotificationStep(patientQueueServiceClient: ClientProxy): SagaStep {
    return {
      name: "step",
      executed: false,
      compensated: false,
      id: 'send_queue_notification',
      action: async () => {
        this.logger.log('Saga: Sending queue notification');
        
        await patientQueueServiceClient
          .send('send_queue_notification', {
            patientId: 'context.patientId',
            queuePosition: 'context.queuePosition',
            phone: 'context.patientData.phone',
          })
          .toPromise();

        return {
      name: "step",
      executed: false,
      compensated: false, notificationsSent: true };
      },
      compensationAction: async () => {
        this.logger.log('Saga: Compensating queue notification');
        
        await patientQueueServiceClient
          .send('cancel_queue_notification', {
            patientId: 'context.patientId',
          })
          .toPromise();
      },

    };
  }

  private validateTransferStep(patientQueueServiceClient: ClientProxy): SagaStep {
    return {
      name: "step",
      executed: false,
      compensated: false,
      id: 'validate_transfer',
      action: async () => {
        this.logger.log('Saga: Validating patient transfer');
        
        const result = await patientQueueServiceClient
          .send('validate_transfer', {
            fromQueueId: 'context.fromQueueId',
            toQueueId: 'context.toQueueId',
            patientId: 'context.patientId',
          })
          .toPromise();

        if (!result.valid) {
          throw new Error('Transfer validation failed: ' + result.reason);
        }

        return {
      name: "step",
      executed: false,
      compensated: false, validated: true, originalPosition: result.originalPosition };
      },
      compensationAction: async () => {
        this.logger.log('Saga: No compensation needed for transfer validation');
      },
    };
  }

  private removeFromSourceQueueStep(patientQueueServiceClient: ClientProxy): SagaStep {
    return {
      name: "step",
      executed: false,
      compensated: false,
      id: 'remove_from_source_queue',
      action: async () => {
        this.logger.log('Saga: Removing patient from source queue');
        
        await patientQueueServiceClient
          .send('remove_from_queue', {
            queueId: 'context.fromQueueId',
            patientId: 'context.patientId',
          })
          .toPromise();

        return {
      name: "step",
      executed: false,
      compensated: false, removedFromSource: true };
      },
      compensationAction: async () => {
        this.logger.log('Saga: Compensating source queue removal');
        
        await patientQueueServiceClient
          .send('add_to_queue_at_position', {
            queueId: 'context.fromQueueId',
            patientId: 'context.patientId',
            position: 'context.originalPosition',
          })
          .toPromise();
      },
    };
  }

  private addToDestinationQueueStep(patientQueueServiceClient: ClientProxy): SagaStep {
    return {
      name: "step",
      executed: false,
      compensated: false,
      id: 'add_to_destination_queue',
      action: async () => {
        this.logger.log('Saga: Adding patient to destination queue');
        
        const result = await patientQueueServiceClient
          .send('add_to_queue', {
            queueId: 'context.toQueueId',
            patientId: 'context.patientId',
          })
          .toPromise();

        return {
      name: "step",
      executed: false,
      compensated: false, newPosition: result.position };
      },
      compensationAction: async () => {
        this.logger.log('Saga: Compensating destination queue addition');
        
        await patientQueueServiceClient
          .send('remove_from_queue', {
            queueId: 'context.toQueueId',
            patientId: 'context.patientId',
          })
          .toPromise();
      },
    };
  }

  private notifyQueueChangesStep(patientQueueServiceClient: ClientProxy): SagaStep {
    return {
      name: "step",
      executed: false,
      compensated: false,
      id: 'notify_queue_changes',
      action: async () => {
        this.logger.log('Saga: Notifying queue changes');
        
        await patientQueueServiceClient
          .send('notify_queue_transfer', {
            patientId: 'context.patientId',
            fromQueueId: 'context.fromQueueId',
            toQueueId: 'context.toQueueId',
            newPosition: 'context.newPosition',
          })
          .toPromise();

        return {
      name: "step",
      executed: false,
      compensated: false, notificationsSent: true };
      },
      compensationAction: async () => {
        this.logger.log('Saga: Compensating queue change notifications');
        
        await patientQueueServiceClient
          .send('cancel_transfer_notification', {
            patientId: 'context.patientId',
          })
          .toPromise();
      },
    };
  }
}
