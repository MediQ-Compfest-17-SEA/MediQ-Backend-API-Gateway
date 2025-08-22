import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { OcrService } from './ocr.service';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/guards/roles/roles.guard';
import { ApiHeader } from '@nestjs/swagger';
import { JwtOrApiKeyGuard } from '../auth/guards/jwt-or-api-key.guard';

@ApiTags('OCR')
@Controller('ocr')
export class OcrController {
  constructor(private readonly ocrService: OcrService) {}

  @Post('upload')
  @UseGuards(JwtOrApiKeyGuard)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'file', maxCount: 1 },
        { name: 'image', maxCount: 1 },
      ],
      {
        limits: {
          fileSize: 20 * 1024 * 1024, // 20MB safety cap matching nginx config
        },
      },
    ),
  )
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-API-KEY', required: false, description: 'Alternatif untuk Bearer token (external access)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Upload file KTP. Gunakan field form-data "file" atau "image".',
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        image: { type: 'string', format: 'binary' },
      },
      oneOf: [
        { required: ['file'] },
        { required: ['image'] },
      ],
    },
  })
  @ApiOperation({ summary: 'Upload KTP untuk proses OCR' })
  @ApiResponse({ status: 201, description: 'File berhasil diupload dan diproses' })
  @ApiResponse({ status: 400, description: 'File tidak valid' })
  @ApiResponse({ status: 401, description: 'Token tidak valid' })
  async uploadKtp(
    @UploadedFiles()
    files: { file?: Express.Multer.File[]; image?: Express.Multer.File[] },
    @CurrentUser() user: any,
  ) {
    const uploaded: Express.Multer.File | undefined = (files?.file?.[0] || files?.image?.[0]);
    if (!uploaded) {
      throw new BadRequestException('No file provided. Use form field "file" or "image".');
    }
    return this.ocrService.uploadKtp(uploaded, user);
  }

  @Post('confirm')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Konfirmasi hasil OCR' })
  @ApiResponse({ status: 200, description: 'Hasil OCR berhasil dikonfirmasi' })
  @ApiResponse({ status: 400, description: 'Data tidak valid' })
  @ApiResponse({ status: 401, description: 'Token tidak valid' })
  async confirmOcr(@Body() confirmData: any, @CurrentUser() user: any): Promise<any> {
    return this.ocrService.confirmOcr(confirmData, user);
  }

  @Get('temp/:tempId')
  @ApiOperation({ summary: 'Ambil data OCR sementara (tempId) via Gateway' })
  @ApiResponse({ status: 200, description: 'Data temporary ditemukan' })
  async getTemp(@Param('tempId') tempId: string): Promise<any> {
    return this.ocrService.getTemp(tempId);
  }

  @Patch('temp/:tempId')
  @UseGuards(JwtOrApiKeyGuard)
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-API-KEY', required: false, description: 'Alternatif untuk Bearer token (external access)' })
  @ApiOperation({ summary: 'Patch data OCR sementara (nama, email, dll.) via Gateway' })
  @ApiBody({ description: 'Fields untuk update', schema: { type: 'object', additionalProperties: true } })
  @ApiResponse({ status: 200, description: 'Data temporary terupdate' })
  @ApiResponse({ status: 401, description: 'Token tidak valid' })
  async patchTemp(@Param('tempId') tempId: string, @Body() patch: any): Promise<any> {
    return this.ocrService.patchTemp(tempId, patch);
  }

  @Post('confirm-temp/:tempId')
  @UseGuards(JwtOrApiKeyGuard)
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-API-KEY', required: false, description: 'Alternatif untuk Bearer token (external access)' })
  @ApiOperation({ summary: 'Konfirmasi dari tempId via Gateway (hapus temp, daftar antrian)' })
  @ApiBody({ description: 'Optional institutionId', schema: { type: 'object', properties: { institutionId: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Berhasil konfirmasi dan hapus temporary' })
  @ApiResponse({ status: 401, description: 'Token tidak valid' })
  async confirmTemp(
    @Param('tempId') tempId: string,
    @Body('institutionId') institutionId: string | undefined,
    @CurrentUser() user: any,
  ): Promise<any> {
    return this.ocrService.confirmTemp(tempId, institutionId, user);
  }
}
