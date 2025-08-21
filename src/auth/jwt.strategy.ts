import { Injectable, UnauthorizedException, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    @Optional() @Inject('USER_SERVICE') private readonly userServiceClient?: ClientProxy,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'default-secret',
    });
  }

  async validate(payload: any) {
    if (!this.userServiceClient) {
      // For now, just return the payload without user service validation
      return { id: payload.sub, email: payload.email, role: payload.role };
    }
    
    try {
      const user = await firstValueFrom(
        this.userServiceClient
          .send('user.profile', { userId: payload.sub })
          .pipe(timeout(5000)),
      );

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      return user;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
