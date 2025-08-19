import { Injectable, Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, retry, catchError } from 'rxjs';
import { RpcException } from '@nestjs/microservices';

@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);

  constructor(
    @Inject('USER_SERVICE') private readonly userServiceClient: ClientProxy,
  ) {}

  async sendToUserService(pattern: string, data: any): Promise<any> {
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

  async healthCheck(): Promise<any> {
    return this.sendToUserService('health.check', {});
  }
}
