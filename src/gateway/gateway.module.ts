import { Module } from '@nestjs/common';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';

/**
 * RMQ clients removed. Internal comms migrated to gRPC/HTTP.
 * GatewayService methods are Optional()-injected; when a client is unavailable,
 * feature services should fallback to HTTP (see InstitutionsService.findAll()).
 */
@Module({
  imports: [],
  controllers: [GatewayController],
  providers: [GatewayService],
  exports: [GatewayService],
})
export class GatewayModule {}
