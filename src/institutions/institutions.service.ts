import { Injectable } from '@nestjs/common';
import { GatewayService } from '../gateway/gateway.service';

@Injectable()
export class InstitutionsService {
  constructor(private readonly gatewayService: GatewayService) {}

  async create(createInstitutionDto: any, user: any) {
    return this.gatewayService.sendToInstitutionService('institution.create', {
      ...createInstitutionDto,
      user,
    });
  }

  async findAll(filters?: { location?: string; type?: string }) {
    return this.gatewayService.sendToInstitutionService('institution.findAll', filters || {});
  }

  async findOne(id: string) {
    return this.gatewayService.sendToInstitutionService('institution.findOne', { id });
  }

  async getServices(id: string) {
    return this.gatewayService.sendToInstitutionService('institution.getServices', { id });
  }

  async addService(id: string, serviceData: any, user: any) {
    return this.gatewayService.sendToInstitutionService('institution.addService', {
      id,
      serviceData,
      user,
    });
  }

  async update(id: string, updateInstitutionDto: any, user: any) {
    return this.gatewayService.sendToInstitutionService('institution.update', {
      id,
      ...updateInstitutionDto,
      user,
    });
  }

  async remove(id: string, user: any) {
    return this.gatewayService.sendToInstitutionService('institution.delete', { id, user });
  }

  async getQueueStats(id: string) {
    return this.gatewayService.sendToInstitutionService('institution.queue-stats', { id });
  }

  async search(query: string, limit: number) {
    return this.gatewayService.sendToInstitutionService('institution.search', { query, limit });
  }
}
