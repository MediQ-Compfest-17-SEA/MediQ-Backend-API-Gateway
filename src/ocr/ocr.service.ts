import { Injectable } from '@nestjs/common';
import { GatewayService } from '../gateway/gateway.service';

@Injectable()
export class OcrService {
  constructor(private readonly gatewayService: GatewayService) {}

  async uploadKtp(file: Express.Multer.File, user: any) {
    return this.gatewayService.sendToOcrService('ocr.upload', { file, user });
  }

  async confirmOcr(confirmData: any, user: any) {
    return this.gatewayService.sendToOcrService('ocr.confirm', { confirmData, user });
  }
}
