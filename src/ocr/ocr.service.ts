import { Injectable, OnModuleInit, Inject, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, Observable } from 'rxjs';
import axios from 'axios';
import * as FormData from 'form-data';

interface GetTempResp {
  success: boolean;
  tempId: string;
  dataJson?: string;
  error?: string;
}
interface PatchTempResp {
  success: boolean;
  tempId: string;
  dataJson?: string;
  error?: string;
}
interface ConfirmResp {
  success: boolean;
  message?: string;
  queueJson?: string;
  tokensJson?: string;
  error?: string;
}
interface ConfirmTempResp extends ConfirmResp {
  tempIdDeleted?: string;
}

interface OcrGrpcService {
  GetTemp(data: { tempId: string }): Observable<GetTempResp>;
  PatchTemp(data: { tempId: string; patchJson: string }): Observable<PatchTempResp>;
  Confirm(data: { dataJson: string; institutionId?: string }): Observable<ConfirmResp>;
  ConfirmTemp(data: { tempId: string; institutionId?: string }): Observable<ConfirmTempResp>;
}

@Injectable()
export class OcrService implements OnModuleInit {
  private ocrGrpc!: OcrGrpcService;

  constructor(@Inject('OCR_GRPC') private readonly ocrGrpcClient: ClientGrpc) {}

  onModuleInit(): void {
    this.ocrGrpc = this.ocrGrpcClient.getService<OcrGrpcService>('OcrService');
  }

  private getOcrHttpBase(): string {
    // Public HTTP endpoint for OCR service (for file upload passthrough)
    return process.env.OCR_SERVICE_HTTP_URL || 'http://localhost:8603';
  }

  /**
   * Forward multipart upload to OCR Service HTTP endpoint.
   * Keep upload as HTTP-only (not gRPC) to avoid streaming complexity.
   */
  async uploadKtp(file: Express.Multer.File, _user: any) {
    if (!file?.buffer || !file?.mimetype) {
      throw new BadRequestException('Invalid file payload');
    }
    const base = this.getOcrHttpBase();
    // Use constructor from CommonJS interop safely
    const form = new (FormData as any)();
    form.append('file', file.buffer, {
      filename: file.originalname || 'ktp.jpg',
      contentType: file.mimetype,
    });

    try {
      const res = await axios.post(`${base}/ocr/upload`, form, {
        headers: {
          ...form.getHeaders(),
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        validateStatus: () => true,
      });

      if (res.status >= 200 && res.status < 300) {
        return res.data;
      }

      // Map upstream 5xx to a client-friendly 400 to avoid opaque 500s from Gateway
      const mappedStatus = res.status >= 500 ? HttpStatus.BAD_REQUEST : (res.status || HttpStatus.BAD_REQUEST);
      throw new HttpException(
        {
          message: 'OCR service responded with an error during upload',
          upstream: res.data ?? null,
          status: res.status,
        },
        mappedStatus,
      );
    } catch (err: any) {
      // Preserve HttpException thrown above (with upstream status)
      if (err instanceof HttpException) {
        throw err;
      }
      // Handle axios/network errors with upstream details if any, map 5xx to 400
      const rawStatus = err?.response?.status || HttpStatus.BAD_GATEWAY;
      const mappedStatus = rawStatus >= 500 ? HttpStatus.BAD_REQUEST : rawStatus;
      const upstream = err?.response?.data || { error: err?.message || 'upload_failed' };
      throw new HttpException(
        {
          message: 'Failed to upload to OCR Service',
          upstream,
        },
        mappedStatus,
      );
    }
  }

  async confirmOcr(confirmData: any, _user: any) {
    const dataJson = JSON.stringify(confirmData || {});
    const resp = await firstValueFrom(this.ocrGrpc.Confirm({ dataJson }));
    if (resp?.queueJson) (resp as any).queue = JSON.parse(resp.queueJson);
    if (resp?.tokensJson) (resp as any).tokens = JSON.parse(resp.tokensJson);
    return resp;
  }

  async getTemp(tempId: string) {
    const resp = await firstValueFrom(this.ocrGrpc.GetTemp({ tempId }));
    if (resp?.dataJson) {
      const data = JSON.parse(resp.dataJson);
      return { success: resp.success, tempId: resp.tempId, data, error: resp.error };
    }
    return resp;
  }

  async patchTemp(tempId: string, patch: any) {
    const patchJson = JSON.stringify(patch || {});
    const resp = await firstValueFrom(this.ocrGrpc.PatchTemp({ tempId, patchJson }));
    if (resp?.dataJson) {
      const data = JSON.parse(resp.dataJson);
      return { success: resp.success, tempId: resp.tempId, data, error: resp.error };
    }
    return resp;
  }

  async confirmTemp(tempId: string, institutionId: string | undefined, _user: any) {
    const resp = await firstValueFrom(this.ocrGrpc.ConfirmTemp({ tempId, institutionId }));
    if ((resp as any)?.queueJson) (resp as any).queue = JSON.parse((resp as any).queueJson);
    if ((resp as any)?.tokensJson) (resp as any).tokens = JSON.parse((resp as any).tokensJson);
    return resp;
  }
}
