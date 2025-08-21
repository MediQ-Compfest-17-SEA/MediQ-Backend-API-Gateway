import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { HealthController } from './health/health.controller';
import { UsersModule } from './users/users.module';
import { OcrModule } from './ocr/ocr.module';
import { InstitutionsModule } from './institutions/institutions.module';
import { OcrEngineModule } from './ocr-engine/ocr-engine.module';
import { AuthModule } from './auth/auth.module';
import { GatewayModule } from './gateway/gateway.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ClientsModule.register([
      {
        name: 'USER_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672'],
          queue: 'user_queue',
          queueOptions: {
            durable: true,
          },
        },
      },
      {
        name: 'PATIENT_QUEUE_SERVICE', 
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672'],
          queue: 'patient_queue',
          queueOptions: {
            durable: true,
          },
        },
      },
      {
        name: 'OCR_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672'],
          queue: 'ocr_service_queue',
          queueOptions: {
            durable: true,
          },
        },
      },
      {
        name: 'INSTITUTION_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672'],
          queue: 'institution_service_queue',
          queueOptions: {
            durable: true,
          },
        },
      },
      {
        name: 'OCR_ENGINE_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672'],
          queue: 'ocr_engine_service_queue',
          queueOptions: {
            durable: true,
          },
        },
      },
    ]),
    GatewayModule,
    AuthModule,
    UsersModule,
    OcrModule,
    InstitutionsModule,
    OcrEngineModule,
    MonitoringModule,
    QueueModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
