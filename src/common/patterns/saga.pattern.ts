import { Injectable, Logger } from '@nestjs/common';
import { SagaCoordinatorService, SagaDefinition, SagaStep } from '../services/saga-coordinator.service';
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
      sagaId,
      steps: [
        this.createUserStep(userServiceClient),
        this.createUserProfileStep(userServiceClient),
        this.sendWelcomeNotificationStep(userServiceClient),
      ],
      timeout: 300000, // 5 minutes
    };

    return await this.sagaCoordinator.executeSaga(sagaDefinition, context);
  }

  async executePatientQueueSaga(
    context: PatientQueueSagaContext,
    patientQueueServiceClient: ClientProxy,
  ): Promise<string> {
    const sagaId = `patient_queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const sagaDefinition: SagaDefinition = {
      sagaId,
      steps: [
        this.validatePatientDataStep(),
        this.createPatientStep(patientQueueServiceClient),
        this.addToQueueStep(patientQueueServiceClient),
        this.sendQueueNotificationStep(patientQueueServiceClient),
      ],
      timeout: 180000, // 3 minutes
    };

    return await this.sagaCoordinator.executeSaga(sagaDefinition, context);
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

    const sagaDefinition: SagaDefinition = {
      sagaId,
      steps: [
        this.validateTransferStep(patientQueueServiceClient),
        this.removeFromSourceQueueStep(patientQueueServiceClient),
        this.addToDestinationQueueStep(patientQueueServiceClient),
        this.notifyQueueChangesStep(patientQueueServiceClient),
      ],
      timeout: 120000, // 2 minutes
    };

    return await this.sagaCoordinator.executeSaga(sagaDefinition, context);
  }

  private createUserStep(userServiceClient: ClientProxy): SagaStep {
    return {
      stepId: 'create_user',
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

        return { userId: result.id };
      },
      compensation: async () => {
        this.logger.log('Saga: Compensating user creation');
        
        // Delete the created user
        await userServiceClient
          .send('delete_user', { userId: 'context.userId' })
          .toPromise();
      },
      timeout: 30000,
    };
  }

  private createUserProfileStep(userServiceClient: ClientProxy): SagaStep {
    return {
      stepId: 'create_user_profile',
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

        return { profileId: result.id };
      },
      compensation: async () => {
        this.logger.log('Saga: Compensating user profile creation');
        
        await userServiceClient
          .send('delete_user_profile', { profileId: 'context.profileId' })
          .toPromise();
      },
      timeout: 20000,
    };
  }

  private sendWelcomeNotificationStep(userServiceClient: ClientProxy): SagaStep {
    return {
      stepId: 'send_welcome_notification',
      action: async () => {
        this.logger.log('Saga: Sending welcome notification');
        
        await userServiceClient
          .send('send_notification', {
            userId: 'context.userId',
            type: 'welcome',
            email: 'context.userData.email',
          })
          .toPromise();

        return { notificationsSent: true };
      },
      compensation: async () => {
        this.logger.log('Saga: Compensating welcome notification');
        // Usually notifications can't be "unsent", but we can mark them as cancelled
        
        await userServiceClient
          .send('cancel_notification', {
            userId: 'context.userId',
            type: 'welcome',
          })
          .toPromise();
      },
      timeout: 15000,
    };
  }

  private validatePatientDataStep(): SagaStep {
    return {
      stepId: 'validate_patient_data',
      action: async () => {
        this.logger.log('Saga: Validating patient data');
        
        // Validation logic
        const requiredFields = ['name', 'phone', 'complaint'];
        const missingFields = requiredFields.filter(field => !('context.patientData' as any)[field]);
        
        if (missingFields.length > 0) {
          throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
        }

        return { validated: true };
      },
      compensation: async () => {
        this.logger.log('Saga: No compensation needed for validation');
        // Validation doesn't need compensation
      },
    };
  }

  private createPatientStep(patientQueueServiceClient: ClientProxy): SagaStep {
    return {
      stepId: 'create_patient',
      action: async () => {
        this.logger.log('Saga: Creating patient');
        
        const result = await patientQueueServiceClient
          .send('create_patient', 'context.patientData')
          .toPromise();

        if (!result || !result.id) {
          throw new Error('Failed to create patient');
        }

        return { patientId: result.id };
      },
      compensation: async () => {
        this.logger.log('Saga: Compensating patient creation');
        
        await patientQueueServiceClient
          .send('delete_patient', { patientId: 'context.patientId' })
          .toPromise();
      },
      timeout: 25000,
    };
  }

  private addToQueueStep(patientQueueServiceClient: ClientProxy): SagaStep {
    return {
      stepId: 'add_to_queue',
      action: async () => {
        this.logger.log('Saga: Adding patient to queue');
        
        const result = await patientQueueServiceClient
          .send('add_to_queue', {
            patientId: 'context.patientId',
            priority: 'context.patientData.priority',
          })
          .toPromise();

        return { queuePosition: result.position };
      },
      compensation: async () => {
        this.logger.log('Saga: Compensating queue addition');
        
        await patientQueueServiceClient
          .send('remove_from_queue', { patientId: 'context.patientId' })
          .toPromise();
      },
      timeout: 20000,
    };
  }

  private sendQueueNotificationStep(patientQueueServiceClient: ClientProxy): SagaStep {
    return {
      stepId: 'send_queue_notification',
      action: async () => {
        this.logger.log('Saga: Sending queue notification');
        
        await patientQueueServiceClient
          .send('send_queue_notification', {
            patientId: 'context.patientId',
            queuePosition: 'context.queuePosition',
            phone: 'context.patientData.phone',
          })
          .toPromise();

        return { notificationsSent: true };
      },
      compensation: async () => {
        this.logger.log('Saga: Compensating queue notification');
        
        await patientQueueServiceClient
          .send('cancel_queue_notification', {
            patientId: 'context.patientId',
          })
          .toPromise();
      },
      timeout: 15000,
    };
  }

  private validateTransferStep(patientQueueServiceClient: ClientProxy): SagaStep {
    return {
      stepId: 'validate_transfer',
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

        return { validated: true, originalPosition: result.originalPosition };
      },
      compensation: async () => {
        this.logger.log('Saga: No compensation needed for transfer validation');
      },
    };
  }

  private removeFromSourceQueueStep(patientQueueServiceClient: ClientProxy): SagaStep {
    return {
      stepId: 'remove_from_source_queue',
      action: async () => {
        this.logger.log('Saga: Removing patient from source queue');
        
        await patientQueueServiceClient
          .send('remove_from_queue', {
            queueId: 'context.fromQueueId',
            patientId: 'context.patientId',
          })
          .toPromise();

        return { removedFromSource: true };
      },
      compensation: async () => {
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
      stepId: 'add_to_destination_queue',
      action: async () => {
        this.logger.log('Saga: Adding patient to destination queue');
        
        const result = await patientQueueServiceClient
          .send('add_to_queue', {
            queueId: 'context.toQueueId',
            patientId: 'context.patientId',
          })
          .toPromise();

        return { newPosition: result.position };
      },
      compensation: async () => {
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
      stepId: 'notify_queue_changes',
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

        return { notificationsSent: true };
      },
      compensation: async () => {
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
