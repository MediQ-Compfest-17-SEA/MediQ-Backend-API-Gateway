import { Injectable } from '@nestjs/common';
import { GatewayService } from '../gateway/gateway.service';

@Injectable()
export class OcrEngineService {
  constructor(private readonly gatewayService: GatewayService) {}

  async processDocument(file: Express.Multer.File, user: any) {
    return this.gatewayService.sendToOcrEngineService('ocr-engine.process', { file, user });
  }

  async scanOcr(file: Express.Multer.File, scanOptions: any, user: any) {
    return this.gatewayService.sendToOcrEngineService('ocr-engine.scan-ocr', {
      file,
      scanOptions,
      user,
    });
  }

  async validateResult(validationData: any, user: any) {
    return this.gatewayService.sendToOcrEngineService('ocr-engine.validate-result', {
      validationData,
      user,
    });
  }
}
