import { Module, forwardRef } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { GatewayModule } from '../gateway/gateway.module';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [
    GatewayModule,
    forwardRef(() => NotificationModule),
    // Provide USER_GRPC token within UsersModule context
    ClientsModule.register([
      {
        name: 'USER_GRPC',
        transport: Transport.GRPC,
        options: {
          package: 'user.v1',
          // Resolve from service working directory so systemd runtime finds the real file
          protoPath: join(process.cwd(), 'shared/proto/user.proto'),
          url: process.env.USER_GRPC_URL || 'localhost:51052',
        },
      },
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
