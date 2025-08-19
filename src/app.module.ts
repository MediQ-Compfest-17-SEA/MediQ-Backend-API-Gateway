import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { GatewayModule } from './gateway/gateway.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';

// Advanced Synchronization Services
import { CircuitBreakerService } from './common/services/circuit-breaker.service';
import { EventStoreService } from './common/services/event-store.service';
import { SagaCoordinatorService } from './common/services/saga-coordinator.service';
import { HealthMonitorService } from './common/services/health-monitor.service';

// Pattern Services
import { SagaPatternService } from './common/patterns/saga.pattern';
import { CompensationPatternService } from './common/patterns/compensation.pattern';

// Interceptors
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';
import { RetryInterceptor } from './common/interceptors/retry.interceptor';
import { MetricsInterceptor } from './common/interceptors/metrics.interceptor';

// Configuration
import { getRabbitMQConfig, getDeadLetterQueueConfig } from './config/rabbitmq.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ClientsModule.register([
      {
        name: 'USER_SERVICE',
        ...getRabbitMQConfig(),
        options: {
          ...getRabbitMQConfig().options,
          queue: 'user_queue',
        },
      },
      {
        name: 'PATIENT_QUEUE_SERVICE',
        ...getRabbitMQConfig(),
        options: {
          ...getRabbitMQConfig().options,
          queue: 'patient_queue',
        },
      },
      {
        name: 'DEAD_LETTER_QUEUE',
        ...getDeadLetterQueueConfig(),
      },
    ]),
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '1h' },
    }),
    GatewayModule,
    UsersModule,
    AuthModule,
  ],
  providers: [
    // Core Services
    EventStoreService,
    CircuitBreakerService,
    SagaCoordinatorService,
    HealthMonitorService,
    
    // Pattern Services
    SagaPatternService,
    CompensationPatternService,
    
    // Global Interceptors
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: IdempotencyInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RetryInterceptor,
    },
  ],
  exports: [
    EventStoreService,
    CircuitBreakerService,
    SagaCoordinatorService,
    HealthMonitorService,
    SagaPatternService,
    CompensationPatternService,
  ],
})
export class AppModule {}
