import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { InstitutionsService } from './institutions.service';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/guards/roles/roles.guard';

@ApiTags('Institutions')
@Controller('institutions')
export class InstitutionsController {
  constructor(private readonly institutionsService: InstitutionsService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN_FASKES)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Buat institusi kesehatan baru (Admin only)' })
  @ApiResponse({ status: 201, description: 'Institusi berhasil dibuat' })
  @ApiResponse({ status: 400, description: 'Data tidak valid' })
  @ApiResponse({ status: 401, description: 'Token tidak valid' })
  @ApiResponse({ status: 403, description: 'Akses ditolak, role tidak sesuai' })
  async create(@Body() createInstitutionDto: any, @CurrentUser() user: any) {
    return this.institutionsService.create(createInstitutionDto, user);
  }

  @Get()
  @ApiOperation({ summary: 'Dapatkan semua institusi kesehatan' })
  @ApiQuery({ name: 'location', required: false, description: 'Filter berdasarkan lokasi' })
  @ApiQuery({ name: 'type', required: false, description: 'Filter berdasarkan tipe institusi' })
  @ApiResponse({ status: 200, description: 'Data institusi berhasil didapat' })
  async findAll(@Query('location') location?: string, @Query('type') type?: string) {
    return this.institutionsService.findAll({ location, type });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dapatkan detail institusi berdasarkan ID' })
  @ApiParam({ name: 'id', description: 'ID institusi' })
  @ApiResponse({ status: 200, description: 'Detail institusi berhasil didapat' })
  @ApiResponse({ status: 404, description: 'Institusi tidak ditemukan' })
  async findOne(@Param('id') id: string) {
    return this.institutionsService.findOne(id);
  }

  @Get(':id/services')
  @ApiOperation({ summary: 'Dapatkan layanan dari institusi' })
  @ApiParam({ name: 'id', description: 'ID institusi' })
  @ApiResponse({ status: 200, description: 'Layanan institusi berhasil didapat' })
  @ApiResponse({ status: 404, description: 'Institusi tidak ditemukan' })
  async getServices(@Param('id') id: string) {
    return this.institutionsService.getServices(id);
  }

  @Post(':id/services')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN_FASKES)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tambah layanan ke institusi (Admin only)' })
  @ApiParam({ name: 'id', description: 'ID institusi' })
  @ApiResponse({ status: 201, description: 'Layanan berhasil ditambahkan' })
  @ApiResponse({ status: 400, description: 'Data tidak valid' })
  @ApiResponse({ status: 401, description: 'Token tidak valid' })
  @ApiResponse({ status: 403, description: 'Akses ditolak, role tidak sesuai' })
  @ApiResponse({ status: 404, description: 'Institusi tidak ditemukan' })
  async addService(
    @Param('id') id: string,
    @Body() serviceData: any,
    @CurrentUser() user: any,
  ) {
    return this.institutionsService.addService(id, serviceData, user);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN_FASKES)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update institusi (Admin only)' })
  @ApiParam({ name: 'id', description: 'ID institusi' })
  @ApiResponse({ status: 200, description: 'Institusi berhasil diupdate' })
  @ApiResponse({ status: 400, description: 'Data tidak valid' })
  @ApiResponse({ status: 401, description: 'Token tidak valid' })
  @ApiResponse({ status: 403, description: 'Akses ditolak, role tidak sesuai' })
  @ApiResponse({ status: 404, description: 'Institusi tidak ditemukan' })
  async update(
    @Param('id') id: string,
    @Body() updateInstitutionDto: any,
    @CurrentUser() user: any,
  ) {
    return this.institutionsService.update(id, updateInstitutionDto, user);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN_FASKES)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Hapus institusi (Admin only)' })
  @ApiParam({ name: 'id', description: 'ID institusi' })
  @ApiResponse({ status: 200, description: 'Institusi berhasil dihapus' })
  @ApiResponse({ status: 401, description: 'Token tidak valid' })
  @ApiResponse({ status: 403, description: 'Akses ditolak, role tidak sesuai' })
  @ApiResponse({ status: 404, description: 'Institusi tidak ditemukan' })
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.institutionsService.remove(id, user);
  }

  @Get(':id/queue/stats')
  @ApiOperation({ summary: 'Dapatkan statistik antrian institusi' })
  @ApiParam({ name: 'id', description: 'ID institusi' })
  @ApiResponse({ status: 200, description: 'Statistik antrian institusi' })
  @ApiResponse({ status: 404, description: 'Institusi tidak ditemukan' })
  async getQueueStats(@Param('id') id: string) {
    return this.institutionsService.getQueueStats(id);
  }

  @Get('search')
  @ApiOperation({ summary: 'Cari institusi berdasarkan nama atau lokasi' })
  @ApiQuery({ name: 'q', description: 'Query pencarian' })
  @ApiQuery({ name: 'limit', required: false, description: 'Limit hasil (default: 10)' })
  @ApiResponse({ status: 200, description: 'Hasil pencarian institusi' })
  async searchInstitutions(
    @Query('q') query: string,
    @Query('limit') limit: string = '10'
  ) {
    return this.institutionsService.search(query, parseInt(limit));
  }
}
