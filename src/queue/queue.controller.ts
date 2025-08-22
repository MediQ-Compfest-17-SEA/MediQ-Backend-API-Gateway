import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Req, HttpException } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { QueueService } from './queue.service';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/guards/roles/roles.guard';
import axios from 'axios';
import { Request } from 'express';

@ApiTags('queue')
@Controller('queue')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tambah pasien ke antrian' })
  @ApiBody({
    description: 'Data untuk menambah pasien ke antrian',
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'ID user/pasien' },
        institutionId: { type: 'string', description: 'ID institusi kesehatan' },
        serviceType: { type: 'string', description: 'Jenis layanan', example: 'konsultasi' },
        priority: { type: 'string', enum: ['normal', 'urgent', 'emergency'], description: 'Prioritas antrian' }
      },
      required: ['userId', 'institutionId']
    }
  })
  @ApiResponse({ status: 201, description: 'Pasien berhasil ditambahkan ke antrian' })
  @ApiResponse({ status: 400, description: 'Data tidak valid' })
  @ApiResponse({ status: 401, description: 'Token tidak valid' })
  async addToQueue(@Body() queueData: any, @CurrentUser() user: any) {
    return this.queueService.addToQueue({ ...queueData, addedBy: user.id });
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dapatkan semua antrian' })
  @ApiQuery({ name: 'institutionId', required: false, description: 'Filter berdasarkan institusi' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter berdasarkan status' })
  @ApiQuery({ name: 'date', required: false, description: 'Filter berdasarkan tanggal (YYYY-MM-DD)' })
  @ApiResponse({ status: 200, description: 'Data antrian berhasil didapat' })
  async getAllQueues(
    @Query('institutionId') institutionId?: string,
    @Query('status') status?: string,
    @Query('date') date?: string,
    @Req() req?: Request,
  ) {
    try {
      return await this.queueService.findAll({ institutionId, status, date });
    } catch (e: any) {
      // HTTP fallback to Patient Queue Service
      try {
        const base = process.env.QUEUE_HTTP_URL || process.env.PATIENT_QUEUE_HTTP_URL || 'http://127.0.0.1:8605';
        const resp = await axios.get(`${base}/queue`, {
          params: { institutionId, status, date },
          headers: { Authorization: (req?.headers?.['authorization'] as string) || '' },
          timeout: 8000,
        });
        return resp.data;
      } catch (err: any) {
        const statusCode = err?.response?.status || 500;
        const data = err?.response?.data || { message: 'Upstream Queue Service error' };
        throw new HttpException(data, statusCode);
      }
    }
  }

  @Get('my-queue')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dapatkan antrian user saat ini' })
  @ApiResponse({ status: 200, description: 'Data antrian user' })
  async getMyQueue(@CurrentUser() user: any) {
    return this.queueService.getMyQueue(user.id);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Dapatkan statistik antrian' })
  @ApiQuery({ name: 'institutionId', required: false, description: 'Filter berdasarkan institusi' })
  @ApiResponse({ status: 200, description: 'Statistik antrian' })
  async getQueueStats(@Query('institutionId') institutionId?: string) {
    return this.queueService.getStats(institutionId);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dapatkan detail antrian berdasarkan ID' })
  @ApiParam({ name: 'id', description: 'ID antrian' })
  @ApiResponse({ status: 200, description: 'Detail antrian' })
  @ApiResponse({ status: 404, description: 'Antrian tidak ditemukan' })
  async getQueueById(@Param('id') id: string) {
    return this.queueService.findOne(id);
  }

  @Patch(':id/status')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.OPERATOR, Role.ADMIN_FASKES)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update status antrian (Operator/Admin only)' })
  @ApiParam({ name: 'id', description: 'ID antrian' })
  @ApiBody({
    description: 'Status baru untuk antrian',
    schema: {
      type: 'object',
      properties: {
        status: { 
          type: 'string', 
          enum: ['waiting', 'called', 'in-progress', 'completed', 'cancelled'],
          description: 'Status antrian baru'
        }
      },
      required: ['status']
    }
  })
  @ApiResponse({ status: 200, description: 'Status antrian berhasil diupdate' })
  @ApiResponse({ status: 404, description: 'Antrian tidak ditemukan' })
  @ApiResponse({ status: 403, description: 'Akses ditolak' })
  async updateQueueStatus(
    @Param('id') id: string,
    @Body() updateData: { status: string },
    @CurrentUser() user: any
  ) {
    return this.queueService.updateStatus(id, updateData.status, user);
  }

  @Post(':id/call')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.OPERATOR, Role.ADMIN_FASKES)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Panggil pasien dalam antrian (Operator/Admin only)' })
  @ApiParam({ name: 'id', description: 'ID antrian' })
  @ApiResponse({ status: 200, description: 'Pasien berhasil dipanggil' })
  @ApiResponse({ status: 404, description: 'Antrian tidak ditemukan' })
  @ApiResponse({ status: 403, description: 'Akses ditolak' })
  async callPatient(@Param('id') id: string, @CurrentUser() user: any) {
    return this.queueService.callPatient(id, user);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Batalkan antrian' })
  @ApiParam({ name: 'id', description: 'ID antrian' })
  @ApiResponse({ status: 200, description: 'Antrian berhasil dibatalkan' })
  @ApiResponse({ status: 404, description: 'Antrian tidak ditemukan' })
  async cancelQueue(@Param('id') id: string, @CurrentUser() user: any) {
    return this.queueService.cancel(id, user);
  }

  @Get('institution/:institutionId/current')
  @ApiOperation({ summary: 'Dapatkan antrian aktif saat ini di institusi' })
  @ApiParam({ name: 'institutionId', description: 'ID institusi' })
  @ApiResponse({ status: 200, description: 'Antrian aktif saat ini' })
  async getCurrentQueue(@Param('institutionId') institutionId: string) {
    return this.queueService.getCurrentQueue(institutionId);
  }

  @Get('institution/:institutionId/next')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.OPERATOR, Role.ADMIN_FASKES)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dapatkan antrian selanjutnya (Operator/Admin only)' })
  @ApiParam({ name: 'institutionId', description: 'ID institusi' })
  @ApiResponse({ status: 200, description: 'Antrian selanjutnya' })
  @ApiResponse({ status: 403, description: 'Akses ditolak' })
  async getNextQueue(@Param('institutionId') institutionId: string) {
    return this.queueService.getNextQueue(institutionId);
  }
}
