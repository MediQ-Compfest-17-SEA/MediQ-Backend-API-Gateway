import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { GatewayService } from '../gateway/gateway.service';
import { UpdateRoleDto } from '../auth/dto/update-role.dto';
import { NotificationService } from '../notifications/notification.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly gatewayService: GatewayService,
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
  ) {}

  async create(userData: any) {
    const result = await this.gatewayService.sendToUserService('user.create', userData);
    
    // Trigger registration success notification
    if (result && !result.error) {
      try {
        await this.notificationService.sendRegistrationSuccessNotification(result.id, {
          nama: userData.nama,
          nik: userData.nik
        });
      } catch (error) {
        console.log('Failed to send registration notification:', error.message);
      }
    }
    
    return result;
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
