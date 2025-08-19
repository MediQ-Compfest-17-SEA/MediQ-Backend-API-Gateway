import { Injectable } from '@nestjs/common';
import { GatewayService } from '../gateway/gateway.service';
import { UpdateRoleDto } from '../auth/dto/update-role.dto';

@Injectable()
export class UsersService {
  constructor(private readonly gatewayService: GatewayService) {}

  async create(userData: any) {
    return this.gatewayService.sendToUserService('user.create', userData);
  }

  async checkNik(nik: string) {
    return this.gatewayService.sendToUserService('user.check-nik', { nik });
  }

  async getProfile(user: any) {
    return this.gatewayService.sendToUserService('user.profile', { user });
  }

  async findAll() {
    return this.gatewayService.sendToUserService('user.findAll', {});
  }

  async updateRole(id: string, updateRoleDto: UpdateRoleDto) {
    return this.gatewayService.sendToUserService('user.updateRole', {
      id,
      ...updateRoleDto,
    });
  }

  async delete(id: string) {
    return this.gatewayService.sendToUserService('user.delete', { id });
  }
}
