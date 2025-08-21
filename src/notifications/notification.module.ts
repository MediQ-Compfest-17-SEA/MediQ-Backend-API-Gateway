import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { GatewayModule } from '../gateway/gateway.module';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'mediq-jwt-secret-key-2024',
      signOptions: { expiresIn: '15m' },
    }),
    GatewayModule,
    forwardRef(() => WebSocketModule),
  ],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
