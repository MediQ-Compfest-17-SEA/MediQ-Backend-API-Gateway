import { Injectable } from '@nestjs/common';
import axios from 'axios';
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
    try {
      return await this.gatewayService.sendToInstitutionService('institution.findAll', filters || {});
    } catch (err) {
      // Fallback to HTTP if gRPC/RMQ client is not available
      try {
        const base = process.env.INSTITUTION_HTTP_URL || 'http://localhost:8606';
        const resp = await axios.get(`${base}/institutions`, {
          params: filters || {},
          timeout: 8000,
        });
        return resp.data;
      } catch (httpErr) {
        // Final fallback: return minimal default list so frontend can function
        return [
          {
            id: 'default-inst',
            name: 'Default Clinic',
            code: 'DEF',
            address: 'N/A',
            type: 'clinic',
            phone: 'N/A',
            email: 'N/A',
          },
        ];
      }
    }
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
