import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { OcrService } from './ocr.service';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/guards/roles/roles.guard';

@ApiTags('OCR')
@Controller('ocr')
export class OcrController {
  constructor(private readonly ocrService: OcrService) {}

  @Post('upload')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('file'))
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload KTP untuk proses OCR' })
  @ApiResponse({ status: 201, description: 'File berhasil diupload dan diproses' })
  @ApiResponse({ status: 400, description: 'File tidak valid' })
  @ApiResponse({ status: 401, description: 'Token tidak valid' })
  async uploadKtp(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    return this.ocrService.uploadKtp(file, user);
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
