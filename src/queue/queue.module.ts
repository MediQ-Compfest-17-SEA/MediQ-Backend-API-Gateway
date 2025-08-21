import { Module, forwardRef } from '@nestjs/common';
import { QueueController } from './queue.controller';
import { QueueService } from './queue.service';
import { GatewayModule } from '../gateway/gateway.module';
import { NotificationModule } from '../notifications/notification.module';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    GatewayModule,
    forwardRef(() => NotificationModule),
    forwardRef(() => WebSocketModule),
  ],
  controllers: [QueueController],
  providers: [QueueService],
})
export class QueueModule {}
