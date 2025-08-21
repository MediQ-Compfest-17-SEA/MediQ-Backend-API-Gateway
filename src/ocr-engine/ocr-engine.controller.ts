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
import { OcrEngineService } from './ocr-engine.service';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/guards/roles/roles.guard';

@ApiTags('OCR Engine')
@Controller('ocr-engine')
export class OcrEngineController {
  constructor(private readonly ocrEngineService: OcrEngineService) {}

  @Post('process')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('file'))
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Proses dokumen dengan ML OCR Engine' })
  @ApiResponse({ status: 201, description: 'Dokumen berhasil diproses dengan ML engine' })
  @ApiResponse({ status: 400, description: 'File tidak valid' })
  @ApiResponse({ status: 401, description: 'Token tidak valid' })
  async processDocument(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    return this.ocrEngineService.processDocument(file, user);
  }

  @Post('scan-ocr')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('file'))
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Scan KTP/SIM dengan YOLO + EasyOCR' })
  @ApiResponse({ status: 201, description: 'Dokumen berhasil discan dengan YOLO + EasyOCR' })
  @ApiResponse({ status: 400, description: 'File tidak valid' })
  @ApiResponse({ status: 401, description: 'Token tidak valid' })
  async scanOcr(
    @UploadedFile() file: Express.Multer.File,
    @Body() scanOptions: any,
    @CurrentUser() user: any,
  ) {
    return this.ocrEngineService.scanOcr(file, scanOptions, user);
  }

  @Post('validate-result')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Validasi hasil OCR dengan ML model' })
  @ApiResponse({ status: 200, description: 'Hasil OCR berhasil divalidasi' })
  @ApiResponse({ status: 400, description: 'Data tidak valid' })
  @ApiResponse({ status: 401, description: 'Token tidak valid' })
  async validateResult(@Body() validationData: any, @CurrentUser() user: any) {
    return this.ocrEngineService.validateResult(validationData, user);
  }
}
