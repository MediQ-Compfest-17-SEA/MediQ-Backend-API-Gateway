import { Module } from '@nestjs/common';
import { OcrEngineService } from './ocr-engine.service';
import { OcrEngineController } from './ocr-engine.controller';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [GatewayModule],
  controllers: [OcrEngineController],
  providers: [OcrEngineService],
})
export class OcrEngineModule {}
