import { Injectable } from '@nestjs/common';
import { GatewayService } from '../gateway/gateway.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { UserLoginDto } from './dto/user-login.dto';

@Injectable()
export class AuthService {
  constructor(private readonly gatewayService: GatewayService) {}

  async loginAdmin(loginDto: AdminLoginDto) {
    return this.gatewayService.sendToUserService('auth.login.admin', loginDto);
  }

  async loginUser(loginDto: UserLoginDto) {
    return this.gatewayService.sendToUserService('auth.login.user', loginDto);
  }

  async refresh(user: any) {
    return this.gatewayService.sendToUserService('auth.refresh', { user });
  }

  async logout(userId: string) {
    return this.gatewayService.sendToUserService('auth.logout', { userId });
  }
}
