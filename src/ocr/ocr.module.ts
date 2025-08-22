import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { OcrService } from './ocr.service';
import { OcrController } from './ocr.controller';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [
    GatewayModule,
    // Register gRPC client here so token 'OCR_GRPC' is available in this module
    ClientsModule.register([
      {
        name: 'OCR_GRPC',
        transport: Transport.GRPC,
        options: {
          package: 'ocr.v1',
          // Resolve from service working directory so systemd runtime finds the real file
          protoPath: join(process.cwd(), 'shared/proto/ocr.proto'),
          url: process.env.OCR_GRPC_URL || 'localhost:51053',
        },
      },
    ]),
  ],
  controllers: [OcrController],
  providers: [OcrService],
})
export class OcrModule {}
