import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'USER_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672'],
          // Align with User Service microservice queue name and durability
          queue: 'user_service_queue',
          queueOptions: { durable: false },
        },
      },
      {
        name: 'PATIENT_QUEUE_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672'],
          queue: 'patient_queue',
          queueOptions: { durable: true },
        },
      },
      {
        name: 'OCR_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672'],
          queue: 'ocr_service_queue',
          queueOptions: { durable: false },
        },
      },
      {
        name: 'INSTITUTION_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672'],
          queue: 'institution_service_queue',
          queueOptions: { durable: true },
        },
      },
      {
        name: 'OCR_ENGINE_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672'],
          queue: 'ocr_engine_service_queue',
          queueOptions: { durable: true },
        },
      },
    ]),
  ],
  controllers: [GatewayController],
  providers: [GatewayService],
  exports: [GatewayService],
})
export class GatewayModule {}
