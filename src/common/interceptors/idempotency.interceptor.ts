import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { EventStoreService } from '../services/event-store.service';

interface IdempotentRequest {
  id: string;
  method: string;
  url: string;
  body: any;
  headers: Record<string, string>;
  timestamp: Date;
  response?: any;
  statusCode?: number;
  metadata: {
    timestamp: Date;
  };
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);
  private readonly requestCache = new Map<string, IdempotentRequest>();
  private readonly IDEMPOTENCY_HEADER = 'x-idempotency-key';
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor(private readonly eventStore: EventStoreService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    
    const idempotencyKey = request.headers[this.IDEMPOTENCY_HEADER] as string;
    
    // Skip idempotency check for GET requests and requests without idempotency key
    if (request.method === 'GET' || !idempotencyKey) {
      return next.handle();
    }

    if (!this.isValidIdempotencyKey(idempotencyKey)) {
      throw new BadRequestException('Invalid idempotency key format');
    }

    const requestFingerprint = this.generateRequestFingerprint(request);
    const cacheKey = `${idempotencyKey}_${requestFingerprint}`;

    // Check for existing request
    const existingRequest = await this.getIdempotentRequest(cacheKey);
    
    if (existingRequest) {
      return this.handleDuplicateRequest(existingRequest, request, response);
    }

    // Store the new request
    const newRequest: IdempotentRequest = {
      id: cacheKey,
      method: request.method,
      url: request.url,
      body: request.body,
      headers: this.extractRelevantHeaders(request.headers),
      timestamp: new Date(),
      metadata: {
        timestamp: new Date(),
      },
    };

    await this.storeIdempotentRequest(newRequest);

    return next.handle().pipe(
      tap({
        next: (data) => {
          this.updateRequestWithResponse(cacheKey, data, response.statusCode || 200);
        },
        error: (error) => {
          this.updateRequestWithError(cacheKey, error);
        },
      }),
    );
  }

  private isValidIdempotencyKey(key: string): boolean {
    // UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(key) || (key.length >= 16 && key.length <= 128);
  }

  private generateRequestFingerprint(request: Request): string {
    const { method, url, body } = request;
    const relevantHeaders = this.extractRelevantHeaders(request.headers);
    
    const fingerprint = {
      method,
      url,
      body,
      headers: relevantHeaders,
    };

    return Buffer.from(JSON.stringify(fingerprint)).toString('base64');
  }

  private extractRelevantHeaders(headers: any): Record<string, string> {
    const relevantHeaderKeys = ['content-type', 'authorization', 'x-user-id'];
    const relevantHeaders: Record<string, string> = {};

    for (const key of relevantHeaderKeys) {
      if (headers[key]) {
        relevantHeaders[key] = headers[key];
      }
    }

    return relevantHeaders;
  }

  private async getIdempotentRequest(cacheKey: string): Promise<IdempotentRequest | null> {
    // Check in-memory cache first
    const cached = this.requestCache.get(cacheKey);
    if (cached && this.isRequestValid(cached)) {
      return cached;
    }

    // Check event store
    try {
      const events = await this.eventStore.getEvents({
        aggregateId: `idempotent_${cacheKey}`,
        eventType: 'IDEMPOTENT_REQUEST_STORED',
      });

      if (events.length > 0) {
        const latestEvent = events[events.length - 1];
        const request = latestEvent.data as IdempotentRequest;
        
        if (this.isRequestValid(request)) {
          this.requestCache.set(cacheKey, request);
          return request;
        }
      }
    } catch (error) {
      this.logger.error(`Failed to retrieve idempotent request: ${error.message}`);
    }

    return null;
  }

  private async storeIdempotentRequest(request: IdempotentRequest): Promise<void> {
    // Store in memory cache
    this.requestCache.set(request.id, request);

    // Store in event store
    try {
      await this.eventStore.appendEvent({
        aggregateId: `idempotent_${request.id}`,
        eventType: 'IDEMPOTENT_REQUEST_STORED',
        data: request,
        metadata: { version: 1 },
      });
    } catch (error) {
      this.logger.error(`Failed to store idempotent request: ${error.message}`);
    }

    // Schedule cleanup
    setTimeout(() => {
      this.requestCache.delete(request.id);
    }, this.CACHE_TTL);
  }

  private async updateRequestWithResponse(cacheKey: string, data: any, statusCode: number): Promise<void> {
    const request = this.requestCache.get(cacheKey);
    if (request) {
      request.response = data;
      request.statusCode = statusCode;

      try {
        await this.eventStore.appendEvent({
          aggregateId: `idempotent_${cacheKey}`,
          eventType: 'IDEMPOTENT_REQUEST_COMPLETED',
          data: {
            response: data,
            statusCode,
          },
          metadata: { version: 2 },
        });
      } catch (error) {
        this.logger.error(`Failed to update idempotent request response: ${error.message}`);
      }
    }
  }

  private async updateRequestWithError(cacheKey: string, error: any): Promise<void> {
    try {
      await this.eventStore.appendEvent({
        aggregateId: `idempotent_${cacheKey}`,
        eventType: 'IDEMPOTENT_REQUEST_FAILED',
        data: {
          error: error.message,
          statusCode: error.status || 500,
        },
        metadata: { version: 2 },
      });
    } catch (err) {
      this.logger.error(`Failed to update idempotent request error: ${err.message}`);
    }
  }

  private handleDuplicateRequest(
    existingRequest: IdempotentRequest,
    request: Request,
    response: Response,
  ): Observable<any> {
    this.logger.log(`Duplicate request detected for idempotency key: ${this.IDEMPOTENCY_HEADER}`);

    // Verify request consistency
    const currentFingerprint = this.generateRequestFingerprint(request);
    const existingFingerprint = this.generateRequestFingerprint({
      method: existingRequest.method,
      url: existingRequest.url,
      body: existingRequest.body,
      headers: existingRequest.headers,
    } as Request);

    if (currentFingerprint !== existingFingerprint) {
      throw new BadRequestException('Request with same idempotency key but different content detected');
    }

    // Return cached response if available
    if (existingRequest.response !== undefined) {
      response.status(existingRequest.statusCode || 200);
      response.setHeader('X-Idempotent-Replayed', 'true');
      
      return new Observable(subscriber => {
        subscriber.next(existingRequest.response);
        subscriber.complete();
      });
    }

    // If request is still processing, return 409 Conflict
    throw new BadRequestException('Request with same idempotency key is still processing');
  }

  private isRequestValid(request: IdempotentRequest): boolean {
    const age = Date.now() - new Date(request.metadata.timestamp).getTime();
    return age < this.CACHE_TTL;
  }
}
