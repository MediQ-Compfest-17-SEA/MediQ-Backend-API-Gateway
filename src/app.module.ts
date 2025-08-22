import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { HealthController } from './health/health.controller';
import { UsersModule } from './users/users.module';
import { OcrModule } from './ocr/ocr.module';
import { InstitutionsModule } from './institutions/institutions.module';
import { OcrEngineModule } from './ocr-engine/ocr-engine.module';
import { AuthModule } from './auth/auth.module';
import { GatewayModule } from './gateway/gateway.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { QueueModule } from './queue/queue.module';
import { WebSocketModule } from './websocket/websocket.module';
import { NotificationModule } from './notifications/notification.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // Replace RMQ with gRPC clients (phase 1 & 2: user + ocr)
    ClientsModule.register([
      {
        name: 'USER_GRPC',
        transport: Transport.GRPC,
        options: {
          package: 'user.v1',
          // dist/app.module.js lives under dist, so one level up to reach shared/proto
          protoPath: join(__dirname, '../shared/proto/user.proto'),
          url: process.env.USER_GRPC_URL || 'localhost:51052',
        },
      },
      {
        name: 'OCR_GRPC',
        transport: Transport.GRPC,
        options: {
          package: 'ocr.v1',
          // dist/app.module.js lives under dist, so one level up to reach shared/proto
          protoPath: join(__dirname, '../shared/proto/ocr.proto'),
          url: process.env.OCR_GRPC_URL || 'localhost:51053',
        },
      },
      // TODO: Subsequent phases - add Queue, Institution, OCR Engine gRPC clients
    ]),
    GatewayModule,
    AuthModule,
    UsersModule,
    OcrModule,
    InstitutionsModule,
    OcrEngineModule,
    MonitoringModule,
    QueueModule,
    WebSocketModule,
    NotificationModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
