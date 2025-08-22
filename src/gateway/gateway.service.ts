import { Injectable, Inject, Logger, Optional } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, retry, catchError } from 'rxjs';
import { RpcException } from '@nestjs/microservices';

@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);

  constructor(
    @Optional() @Inject('USER_SERVICE') private readonly userServiceClient?: ClientProxy,
    @Optional() @Inject('OCR_SERVICE') private readonly ocrServiceClient?: ClientProxy,
    @Optional() @Inject('INSTITUTION_SERVICE') private readonly institutionServiceClient?: ClientProxy,
    @Optional() @Inject('OCR_ENGINE_SERVICE') private readonly ocrEngineServiceClient?: ClientProxy,
  ) {}

  async sendToUserService(pattern: string, data: any): Promise<any> {
    if (!this.userServiceClient) {
      throw new Error('User Service client not available');
    }
    try {
      this.logger.log(`Sending message to user service: ${pattern}`, data);

      const result = await firstValueFrom(
        this.userServiceClient.send(pattern, data).pipe(
          timeout(5000),
          retry({ count: 2, delay: 1000 }),
          catchError((error) => {
            this.logger.error(
              `Error communicating with user service: ${error.message}`,
            );
            throw new RpcException(error);
          }),
        ),
      );

      this.logger.log(`Received response from user service:`, result);
      return result;
    } catch (error) {
      this.logger.error(
        `Failed to communicate with user service: ${error.message}`,
      );
      throw error;
    }
  }

  async sendToOcrService(pattern: string, data: any): Promise<any> {
    if (!this.ocrServiceClient) {
      throw new Error('OCR Service client not available');
    }
    try {
      this.logger.log(`Sending message to OCR service: ${pattern}`, data);

      // Dynamically tune timeout for long-running OCR confirm flows
      const defaultTimeout = Number(process.env.TIMEOUT_MS || 5000);
      const ocrTimeout = Number(process.env.OCR_TIMEOUT_MS || 15000);
      const effectiveTimeout =
        pattern === 'ocr.confirm-temp' || pattern === 'ocr.confirm'
          ? ocrTimeout
          : defaultTimeout;

      const result = await firstValueFrom(
        this.ocrServiceClient.send(pattern, data).pipe(
          timeout(effectiveTimeout),
          retry({ count: 2, delay: 1000 }),
          catchError((error) => {
            this.logger.error(
              `Error communicating with OCR service [${pattern}]: ${error.message}`,
            );
            throw new RpcException(error);
          }),
        ),
      );

      this.logger.log(`Received response from OCR service:`, result);
      return result;
    } catch (error) {
      this.logger.error(
        `Failed to communicate with OCR service [${pattern}]: ${error.message}`,
      );
      throw error;
    }
  }

  async sendToInstitutionService(pattern: string, data: any): Promise<any> {
    if (!this.institutionServiceClient) {
      throw new Error('Institution Service client not available');
    }
    try {
      this.logger.log(`Sending message to Institution service: ${pattern}`, data);

      const result = await firstValueFrom(
        this.institutionServiceClient.send(pattern, data).pipe(
          timeout(5000),
          retry({ count: 2, delay: 1000 }),
          catchError((error) => {
            this.logger.error(
              `Error communicating with Institution service: ${error.message}`,
            );
            throw new RpcException(error);
          }),
        ),
      );

      this.logger.log(`Received response from Institution service:`, result);
      return result;
    } catch (error) {
      this.logger.error(
        `Failed to communicate with Institution service: ${error.message}`,
      );
      throw error;
    }
  }

  async sendToOcrEngineService(pattern: string, data: any): Promise<any> {
    if (!this.ocrEngineServiceClient) {
      throw new Error('OCR Engine Service client not available');
    }
    try {
      this.logger.log(`Sending message to OCR Engine service: ${pattern}`, data);

      const result = await firstValueFrom(
        this.ocrEngineServiceClient.send(pattern, data).pipe(
          timeout(5000),
          retry({ count: 2, delay: 1000 }),
          catchError((error) => {
            this.logger.error(
              `Error communicating with OCR Engine service: ${error.message}`,
            );
            throw new RpcException(error);
          }),
        ),
      );

      this.logger.log(`Received response from OCR Engine service:`, result);
      return result;
    } catch (error) {
      this.logger.error(
        `Failed to communicate with OCR Engine service: ${error.message}`,
      );
      throw error;
    }
  }

  async healthCheck(): Promise<any> {
    return this.sendToUserService('health.check', {});
  }
}
