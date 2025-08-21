import { Module, forwardRef } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { GatewayModule } from '../gateway/gateway.module';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [
    GatewayModule,
    forwardRef(() => NotificationModule),
  ],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
