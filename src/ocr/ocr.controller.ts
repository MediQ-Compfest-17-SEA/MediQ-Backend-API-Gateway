import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
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
    FileFieldsInterceptor([
      { name: 'file', maxCount: 1 },
      { name: 'image', maxCount: 1 },
    ]),
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
      throw new Error('No file provided. Use form field "file" or "image".');
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
  async confirmOcr(@Body() confirmData: any, @CurrentUser() user: any) {
    return this.ocrService.confirmOcr(confirmData, user);
  }
}
