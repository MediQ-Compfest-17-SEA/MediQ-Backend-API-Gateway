import { Injectable, Inject, forwardRef, BadRequestException, OnModuleInit } from '@nestjs/common';
import { GatewayService } from '../gateway/gateway.service';
import { UpdateRoleDto } from '../auth/dto/update-role.dto';
import { NotificationService } from '../notifications/notification.service';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

interface UserGrpcService {
  GetById(data: { id: string }): any;
}

@Injectable()
export class UsersService implements OnModuleInit {
  private userGrpc!: UserGrpcService;

  constructor(
    private readonly gatewayService: GatewayService,
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
    @Inject('USER_GRPC') private readonly userGrpcClient: ClientGrpc,
  ) {}

  onModuleInit(): void {
    // Bind gRPC stub
    this.userGrpc = this.userGrpcClient.getService<UserGrpcService>('UserService');
  }

  private getUserServiceBase(): string {
    // Prefer explicit env, fall back to production URL known by docs
    return process.env.USER_SERVICE_HTTP_URL || 'https://mediq-user-service.craftthingy.com';
  }

  private async httpGetJson<T = any>(url: string): Promise<T> {
    try {
      const fetchApi: any = (global as any).fetch;
      if (!fetchApi) {
        throw new Error('fetch API not available in runtime');
      }
      const res = await fetchApi(url, { method: 'GET' });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} ${res.statusText} - ${text}`);
      }
      return (await res.json()) as T;
    } catch (e) {
      throw e;
    }
  }

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
        console.log('Failed to send registration notification:', (error as any)?.message);
      }
    }
    
    return result;
  }

  async checkNik(nik: string) {
    return this.gatewayService.sendToUserService('user.check-nik', { nik });
  }

  /**
   * Legacy passthrough (RMQ) - returns whatever user service returns for 'user.profile'
   */
  async getProfile(user: any) {
    return this.gatewayService.sendToUserService('user.profile', { user });
  }

  /**
   * Get full user data by user id via gRPC (primary), then RMQ fallback, then HTTP fallback.
   */
  async getUserById(id: string) {
    if (!id) throw new BadRequestException('Missing user id');

    // 1) gRPC primary path
    try {
      const res = await firstValueFrom(this.userGrpc.GetById({ id }));
      if (res) return res;
    } catch (grpcErr) {
      // continue to fallbacks
    }

    // 2) RMQ fallback (legacy)
    try {
      return await this.gatewayService.sendToUserService('user.get-by-id', { id });
    } catch (rmqErr) {
      // continue to HTTP fallback
    }

    // 3) HTTP fallback (public)
    const base = this.getUserServiceBase();
    const url = `${base}/users/${encodeURIComponent(id)}`;
    try {
      return await this.httpGetJson(url);
    } catch (httpErr) {
      // As a last resort, return minimal structure
      return { id, error: 'user_fetch_failed' };
    }
  }

  /**
   * Resolve current user from JWT payload (request.user) and fetch full profile by id
   * JWT payload from gateway uses { sub, email, role }
   * On failure to fetch from User Service, return minimal payload from JWT.
   */
  async getMeFromJwt(user: any) {
    const userId = user?.sub || user?.id;
    if (!userId) {
      throw new BadRequestException('Invalid JWT payload - user id (sub) not found');
    }
    try {
      return await this.getUserById(userId);
    } catch (e) {
      return {
        id: userId,
        email: user?.email ?? null,
        role: user?.role ?? null,
        note: 'Returned minimal profile from JWT due to upstream fetch failure',
      };
    }
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
