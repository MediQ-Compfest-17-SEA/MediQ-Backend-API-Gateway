import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard that allows either a valid JWT (standard) or a valid X-API-KEY header
 * using PUBLIC_API_KEY from environment for external integrations.
 */
@Injectable()
export class JwtOrApiKeyGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const apiKeyHeader = (request.headers['x-api-key'] || request.headers['x-api_key']) as string | undefined;
    const publicApiKey = process.env.PUBLIC_API_KEY;

    if (publicApiKey && apiKeyHeader && apiKeyHeader === publicApiKey) {
      // Attach a minimal external user context
      request.user = {
        id: 'external-api',
        roles: ['external'],
        type: 'api_key',
      };
      return true;
    }

    // Fallback to standard JWT auth
    return super.canActivate(context);
  }
}
