import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MediQWebSocketGateway } from './websocket.gateway';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'mediq-jwt-secret-key-2024',
      signOptions: { expiresIn: '15m' },
    }),
    NotificationModule,
  ],
  providers: [MediQWebSocketGateway],
  exports: [MediQWebSocketGateway],
})
export class WebSocketModule {}
