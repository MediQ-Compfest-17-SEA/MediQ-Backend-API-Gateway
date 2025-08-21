import { Module } from '@nestjs/common';
import { SimpleMonitoringController } from './monitoring.controller';

@Module({
  controllers: [SimpleMonitoringController],
})
export class MonitoringModule {}
