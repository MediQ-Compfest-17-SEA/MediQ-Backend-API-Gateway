import { Injectable } from '@nestjs/common';
import { GatewayService } from '../gateway/gateway.service';

@Injectable()
export class QueueService {
  constructor(private readonly gatewayService: GatewayService) {}

  async addToQueue(queueData: any) {
    return this.gatewayService.sendToUserService('queue.add', queueData);
  }

  async findAll(filters: any) {
    return this.gatewayService.sendToUserService('queue.findAll', filters);
  }

  async getMyQueue(userId: string) {
    return this.gatewayService.sendToUserService('queue.my-queue', { userId });
  }

  async getStats(institutionId?: string) {
    return this.gatewayService.sendToUserService('queue.stats', { institutionId });
  }

  async findOne(id: string) {
    return this.gatewayService.sendToUserService('queue.findOne', { id });
  }

  async updateStatus(id: string, status: string, user: any) {
    return this.gatewayService.sendToUserService('queue.updateStatus', { id, status, user });
  }

  async callPatient(id: string, user: any) {
    return this.gatewayService.sendToUserService('queue.call', { id, user });
  }

  async cancel(id: string, user: any) {
    return this.gatewayService.sendToUserService('queue.cancel', { id, user });
  }

  async getCurrentQueue(institutionId: string) {
    return this.gatewayService.sendToUserService('queue.current', { institutionId });
  }

  async getNextQueue(institutionId: string) {
    return this.gatewayService.sendToUserService('queue.next', { institutionId });
  }
}
