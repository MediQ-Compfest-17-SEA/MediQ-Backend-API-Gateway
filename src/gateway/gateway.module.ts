import { Module } from '@nestjs/common';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';
import { MonitoringController } from './monitoring.controller';

@Module({
  controllers: [GatewayController, MonitoringController],
  providers: [GatewayService],
  exports: [GatewayService],
})
export class GatewayModule {}
