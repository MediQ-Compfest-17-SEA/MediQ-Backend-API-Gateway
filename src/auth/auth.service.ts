import { Injectable, HttpException } from '@nestjs/common';
import axios from 'axios';
import { GatewayService } from '../gateway/gateway.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { UserLoginDto } from './dto/user-login.dto';

@Injectable()
export class AuthService {
  constructor(private readonly gatewayService: GatewayService) {}

  /**
   * Try internal transport first; if unavailable, fallback to direct HTTP to User Service.
   * Maps upstream HTTP errors to proper HttpException so the client receives correct status (e.g., 401).
   */
  async loginAdmin(loginDto: AdminLoginDto) {
    try {
      return await this.gatewayService.sendToUserService('auth.login.admin', loginDto);
    } catch (e: any) {
      try {
        const base = process.env.USER_HTTP_URL || 'http://localhost:8602';
        const resp = await axios.post(`${base}/auth/login/admin`, loginDto, { timeout: 8000 });
        return resp.data;
      } catch (err: any) {
        const status = err?.response?.status || 500;
        const data = err?.response?.data || { message: 'Upstream User Service error' };
        throw new HttpException(data, status);
      }
    }
  }

  async loginUser(loginDto: UserLoginDto) {
    try {
      return await this.gatewayService.sendToUserService('auth.login.user', loginDto);
    } catch (e: any) {
      try {
        const base = process.env.USER_HTTP_URL || 'http://localhost:8602';
        const resp = await axios.post(`${base}/auth/login/user`, loginDto, { timeout: 8000 });
        return resp.data;
      } catch (err: any) {
        const status = err?.response?.status || 500;
        const data = err?.response?.data || { message: 'Upstream User Service error' };
        throw new HttpException(data, status);
      }
    }
  }

  async refresh(user: any) {
    // Keep legacy path; if internal transport not available this will throw.
    // Frontend currently doesn't call refresh in this flow.
    return this.gatewayService.sendToUserService('auth.refresh', { user });
  }

  async logout(userId: string) {
    // Keep legacy path; not critical for current flow.
    return this.gatewayService.sendToUserService('auth.logout', { userId });
  }
}
