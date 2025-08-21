import { Controller, Post, Body, Inject, HttpStatus, Logger, Headers } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader, ApiBody } from '@nestjs/swagger';
import { CircuitBreakerService } from '../common/services/circuit-breaker.service';
import { SagaPatternService, UserRegistrationSagaContext, PatientQueueSagaContext } from '../common/patterns/saga.pattern';
import { CompensationPatternService } from '../common/patterns/compensation.pattern';
import { EventStoreService } from '../common/services/event-store.service';
import { Retryable } from '../common/interceptors/retry.interceptor';

interface CreateUserRequest {
  email: string;
  password: string;
  name: string;
  role: string;
}

interface CreatePatientRequest {
  name: string;
  phone: string;
  complaint: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

interface TransferPatientRequest {
  patientId: string;
  fromQueueId: string;
  toQueueId: string;
}

@ApiTags('advanced-gateway')
@Controller('api/v1/advanced')
export class AdvancedGatewayController {
  private readonly logger = new Logger(AdvancedGatewayController.name);

  constructor(
    @Inject('USER_SERVICE') private readonly userServiceClient: ClientProxy,
    @Inject('PATIENT_QUEUE_SERVICE') private readonly patientQueueServiceClient: ClientProxy,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly sagaPattern: SagaPatternService,
    private readonly compensationPattern: CompensationPatternService,
    private readonly eventStore: EventStoreService,
  ) {}

  @Post('users/register')
  @ApiOperation({ summary: 'Register new user with saga pattern' })
  @ApiHeader({ name: 'x-idempotency-key', description: 'Idempotency key for duplicate prevention' })
  @ApiBody({ type: Object, description: 'User registration data' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 409, description: 'Duplicate request' })
  @Retryable('CRITICAL')
  async registerUser(
    @Body() userData: CreateUserRequest,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    this.logger.log(`Starting user registration saga for email: ${userData.email}`);

    const context: UserRegistrationSagaContext = {
      userData,
    };

    try {
      // Execute user registration saga
      const sagaId = await this.sagaPattern.executeUserRegistrationSaga(
        context,
        this.userServiceClient,
      );

      await this.eventStore.appendEvent({
        aggregateId: `user_registration_${userData.email}`,
        eventType: 'USER_REGISTRATION_INITIATED',
        data: {
          sagaId,
          email: userData.email,
          idempotencyKey,
        },
        metadata: { version: 1 },
      });

      return {
        message: 'User registration initiated',
        sagaId,
        status: 'PROCESSING',
        timestamp: new Date(),
      };

    } catch (error) {
      this.logger.error(`User registration failed: ${error.message}`);

      await this.eventStore.appendEvent({
        aggregateId: `user_registration_${userData.email}`,
        eventType: 'USER_REGISTRATION_FAILED',
        data: {
          email: userData.email,
          error: error.message,
          idempotencyKey,
        },
        metadata: { version: 1 },
      });

      throw error;
    }
  }

  @Post('patients')
  @ApiOperation({ summary: 'Create patient and add to queue with saga pattern' })
  @ApiHeader({ name: 'x-idempotency-key', description: 'Idempotency key for duplicate prevention' })
  @ApiBody({ type: Object, description: 'Patient data' })
  @ApiResponse({ status: 201, description: 'Patient created and added to queue' })
  @Retryable('DEFAULT')
  async createPatient(
    @Body() patientData: CreatePatientRequest,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    this.logger.log(`Starting patient creation saga for: ${patientData.name}`);

    const context: PatientQueueSagaContext = {
      patientData,
    };

    try {
      // Execute patient queue saga
      const sagaId = await this.sagaPattern.executePatientQueueSaga(
        context,
        this.patientQueueServiceClient,
      );

      await this.eventStore.appendEvent({
        aggregateId: `patient_creation_${patientData.phone}`,
        eventType: 'PATIENT_CREATION_INITIATED',
        data: {
          sagaId,
          patientName: patientData.name,
          phone: patientData.phone,
          idempotencyKey,
        },
        metadata: { version: 1 },
      });

      return {
        message: 'Patient creation initiated',
        sagaId,
        status: 'PROCESSING',
        timestamp: new Date(),
      };

    } catch (error) {
      this.logger.error(`Patient creation failed: ${error.message}`);

      await this.eventStore.appendEvent({
        aggregateId: `patient_creation_${patientData.phone}`,
        eventType: 'PATIENT_CREATION_FAILED',
        data: {
          patientName: patientData.name,
          phone: patientData.phone,
          error: error.message,
          idempotencyKey,
        },
        metadata: { version: 1 },
      });

      throw error;
    }
  }

  @Post('patients/transfer')
  @ApiOperation({ summary: 'Transfer patient between queues with saga pattern' })
  @ApiHeader({ name: 'x-idempotency-key', description: 'Idempotency key for duplicate prevention' })
  @ApiBody({ type: Object, description: 'Patient transfer data' })
  @ApiResponse({ status: 200, description: 'Patient transfer initiated' })
  @Retryable('CRITICAL')
  async transferPatient(
    @Body() transferData: TransferPatientRequest,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    this.logger.log(`Starting patient transfer saga: ${transferData.patientId}`);

    try {
      // Execute complex patient transfer saga
      const sagaId = await this.sagaPattern.executeComplexPatientTransferSaga(
        transferData.fromQueueId,
        transferData.toQueueId,
        transferData.patientId,
        this.patientQueueServiceClient,
      );

      await this.eventStore.appendEvent({
        aggregateId: `patient_transfer_${transferData.patientId}`,
        eventType: 'PATIENT_TRANSFER_INITIATED',
        data: {
          sagaId,
          patientId: transferData.patientId,
          fromQueueId: transferData.fromQueueId,
          toQueueId: transferData.toQueueId,
          idempotencyKey,
        },
        metadata: { version: 1 },
      });

      return {
        message: 'Patient transfer initiated',
        sagaId,
        status: 'PROCESSING',
        timestamp: new Date(),
      };

    } catch (error) {
      this.logger.error(`Patient transfer failed: ${error.message}`);

      await this.eventStore.appendEvent({
        aggregateId: `patient_transfer_${transferData.patientId}`,
        eventType: 'PATIENT_TRANSFER_FAILED',
        data: {
          patientId: transferData.patientId,
          fromQueueId: transferData.fromQueueId,
          toQueueId: transferData.toQueueId,
          error: error.message,
          idempotencyKey,
        },
        metadata: { version: 1 },
      });

      throw error;
    }
  }

  @Post('users/secure-operation')
  @ApiOperation({ summary: 'Secure operation with circuit breaker protection' })
  @ApiResponse({ status: 200, description: 'Operation completed' })
  @ApiResponse({ status: 503, description: 'Service unavailable (circuit breaker open)' })
  @Retryable('CRITICAL')
  async secureOperation(@Body() operationData: any) {
    this.logger.log('Executing secure operation with circuit breaker');

    return await this.circuitBreaker.execute(
      'USER_SERVICE',
      async () => {
        // Primary operation
        const result = await this.userServiceClient
          .send('secure_operation', operationData)
          .toPromise();
        
        this.logger.log('Secure operation completed successfully');
        return result;
      },
      {
        failureThreshold: 5,
        recoveryTimeout: 30000,
        timeout: 10000,
      },
    );
  }

  @Post('operations/with-compensation')
  @ApiOperation({ summary: 'Operation with automatic compensation on failure' })
  @ApiResponse({ status: 200, description: 'Operation completed' })
  @Retryable('DEFAULT')
  async operationWithCompensation(@Body() operationData: any) {
    const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.log(`Starting operation with compensation: ${transactionId}`);

    // Create compensation plan
    const compensationPlan = await this.compensationPattern.createUserRegistrationCompensation(
      transactionId,
      'temp_user_id', // This would be filled during execution
    );

    try {
      // Execute the main operation
      const result = await this.userServiceClient
        .send('complex_operation', { ...operationData, transactionId })
        .toPromise();

      await this.eventStore.appendEvent({
        aggregateId: `operation_${transactionId}`,
        eventType: 'OPERATION_COMPLETED',
        data: {
          transactionId,
          result,
          compensationPlan,
        },
        metadata: { version: 1 },
      });

      this.logger.log(`Operation completed successfully: ${transactionId}`);
      return result;

    } catch (error) {
      this.logger.error(`Operation failed, executing compensation: ${error.message}`);

      // Execute compensation
      const compensationResults = await this.compensationPattern.executeCompensation(compensationPlan);

      await this.eventStore.appendEvent({
        aggregateId: `operation_${transactionId}`,
        eventType: 'OPERATION_COMPENSATED',
        data: {
          transactionId,
          error: error.message,
          compensationResults,
        },
        metadata: { version: 2 },
      });

      throw error;
    }
  }

  @Post('bulk/patients')
  @ApiOperation({ summary: 'Bulk patient creation with advanced error handling' })
  @ApiResponse({ status: 200, description: 'Bulk operation completed' })
  @Retryable('DEFAULT')
  async bulkCreatePatients(@Body() patientsData: CreatePatientRequest[]) {
    this.logger.log(`Starting bulk patient creation: ${patientsData.length} patients`);
    
    const results = [];
    const failures = [];

    for (const [index, patientData] of patientsData.entries()) {
      try {
        const result = await this.circuitBreaker.execute(
          'PATIENT_QUEUE_SERVICE',
          async () => {
            return await this.patientQueueServiceClient
              .send('create_patient', patientData)
              .toPromise();
          },
          {
            failureThreshold: 3,
            recoveryTimeout: 15000,
            timeout: 5000,
          },
        );

        results.push({ index, success: true, data: result });

      } catch (error) {
        failures.push({ index, error: error.message, patientData });
        this.logger.warn(`Patient ${index} creation failed: ${error.message}`);
      }
    }

    const summary = {
      total: patientsData.length,
      successful: results.length,
      failed: failures.length,
      results,
      failures,
      timestamp: new Date(),
    };

    await this.eventStore.appendEvent({
      aggregateId: `bulk_operation_${Date.now()}`,
      eventType: 'BULK_PATIENT_CREATION_COMPLETED',
      data: summary,
      metadata: { version: 1 },
    });

    return summary;
  }
}
