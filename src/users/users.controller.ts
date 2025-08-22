import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, HttpException, Put } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import axios from 'axios';
import { Request } from 'express';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateRoleDto } from '../auth/dto/update-role.dto';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../auth/guards/roles/roles.guard';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({
    summary: 'Buat pengguna baru dengan data KTP lengkap',
    description: `
Registrasi pengguna baru dengan data KTP lengkap dari hasil OCR atau input manual.

**Contoh Request:**
\`\`\`json
{
  "nik": "1234567890123456",
  "nama": "SULISTYONO",
  "tempat_lahir": "KEDIRI",
  "tgl_lahir": "1966-02-26",
  "jenis_kelamin": "LAKI-LAKI",
  "alamat": "JL.RAYA - DSN PURWOKERTO",
  "rt_rw": "002/003",
  "kel_desa": "PURWOKERTO",
  "kecamatan": "NGADILUWIH",
  "agama": "ISLAM",
  "status_perkawinan": "KAWIN",
  "pekerjaan": "GURU",
  "kewarganegaraan": "WNI"
}
\`\`\`

**Auto-triggers:**
- 🔔 Registration success notification
- 📧 Welcome email/SMS (jika configured)
    `
  })
  @ApiResponse({
    status: 201,
    description: 'Pengguna berhasil dibuat dengan notification otomatis',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'user-789' },
        nik: { type: 'string', example: '1234567890123456' },
        nama: { type: 'string', example: 'SULISTYONO' },
        role: { type: 'string', example: 'PASIEN' },
        created_at: { type: 'string', example: '2024-01-20T10:30:00.000Z' },
        notification_sent: { type: 'boolean', example: true }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Data tidak valid atau NIK sudah terdaftar',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'array', items: { type: 'string' }, example: ['NIK harus 16 digit', 'Nama wajib diisi'] },
        error: { type: 'string', example: 'Bad Request' }
      }
    }
  })
  async create(@Body() createUserDto: CreateUserDto, @Req() req: Request) {
    try {
      return await this.usersService.create(createUserDto);
    } catch (e: any) {
      try {
        const base = process.env.USER_HTTP_URL || process.env.USER_SERVICE_HTTP_URL || 'http://127.0.0.1:8602';
        const resp = await axios.post(`${base}/users`, createUserDto, {
          headers: { Authorization: (req.headers['authorization'] as string) || '' },
          timeout: 8000,
        });
        return resp.data;
      } catch (err: any) {
        const status = err?.response?.status || 500;
        const data = err?.response?.data || { message: 'Upstream User Service error' };
        throw new HttpException(data, status);
      }
    }
  }

  @Get('check-nik/:nik')
  @ApiOperation({ summary: 'Cek apakah NIK sudah terdaftar' })
  @ApiParam({ name: 'nik', description: 'Nomor Induk Kependudukan' })
  @ApiResponse({ status: 200, description: 'Status NIK berhasil dicek' })
  async checkNik(@Param('nik') nik: string) {
    return this.usersService.checkNik(nik);
  }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dapatkan profil pengguna yang sedang login (legacy passthrough dari JWT payload)' })
  @ApiResponse({ status: 200, description: 'Profil pengguna berhasil didapat (payload JWT)' })
  @ApiResponse({ status: 401, description: 'Token tidak valid' })
  async getProfile(@CurrentUser() user: any) {
    return this.usersService.getProfile(user);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dapatkan data user lengkap dari JWT token (ambil dari database berdasarkan sub)' })
  @ApiResponse({ status: 200, description: 'Data lengkap pengguna berhasil didapat' })
  @ApiResponse({ status: 401, description: 'Token tidak valid' })
  async getMe(@CurrentUser() user: any) {
    try {
      const data = await this.usersService.getMeFromJwt(user);
      return { success: true, data };
    } catch (error: any) {
      // Do not propagate as 500 - return structured payload for external callers
      return { success: false, error: error?.message || 'failed_to_resolve_user_from_jwt' };
    }
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dapatkan data user lengkap berdasarkan user id' })
  @ApiParam({ name: 'id', description: 'ID pengguna (UUID)' })
  @ApiResponse({ status: 200, description: 'Data lengkap pengguna berhasil didapat' })
  @ApiResponse({ status: 401, description: 'Token tidak valid' })
  async getById(@Param('id') id: string) {
    try {
      const data = await this.usersService.getUserById(id);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error?.message || 'failed_to_fetch_user_by_id' };
    }
  }

  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN_FASKES)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dapatkan semua pengguna (Admin only)' })
  @ApiResponse({ status: 200, description: 'Data pengguna berhasil didapat' })
  @ApiResponse({ status: 401, description: 'Token tidak valid' })
  @ApiResponse({ status: 403, description: 'Akses ditolak, role tidak sesuai' })
  async findAll(@Req() req: Request) {
    try {
      return await this.usersService.findAll();
    } catch (e: any) {
      try {
        const base = process.env.USER_HTTP_URL || process.env.USER_SERVICE_HTTP_URL || 'http://127.0.0.1:8602';
        const resp = await axios.get(`${base}/users`, {
          headers: { Authorization: (req.headers['authorization'] as string) || '' },
          timeout: 8000,
        });
        return resp.data;
      } catch (err: any) {
        const status = err?.response?.status || 500;
        const data = err?.response?.data || { message: 'Upstream User Service error' };
        throw new HttpException(data, status);
      }
    }
  }

  @Patch(':id/role')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN_FASKES)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update role pengguna (Admin only)' })
  @ApiParam({ name: 'id', description: 'ID pengguna' })
  @ApiResponse({ status: 200, description: 'Role berhasil diupdate' })
  @ApiResponse({ status: 401, description: 'Token tidak valid' })
  @ApiResponse({ status: 403, description: 'Akses ditolak, role tidak sesuai' })
  @ApiResponse({ status: 404, description: 'Pengguna tidak ditemukan' })
  async updateRole(
    @Param('id') id: string,
    @Body() updateRoleDto: UpdateRoleDto,
    @Req() req: Request,
  ) {
    try {
      return await this.usersService.updateRole(id, updateRoleDto);
    } catch (e: any) {
      try {
        const base = process.env.USER_HTTP_URL || process.env.USER_SERVICE_HTTP_URL || 'http://127.0.0.1:8602';
        const resp = await axios.patch(`${base}/users/${encodeURIComponent(id)}/role`, updateRoleDto, {
          headers: { Authorization: (req.headers['authorization'] as string) || '' },
          timeout: 8000,
        });
        return resp.data;
      } catch (err: any) {
        const status = err?.response?.status || 500;
        const data = err?.response?.data || { message: 'Upstream User Service error' };
        throw new HttpException(data, status);
      }
    }
  }

  @Put(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN_FASKES)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update data pengguna (Admin only)' })
  @ApiParam({ name: 'id', description: 'ID pengguna' })
  @ApiResponse({ status: 200, description: 'Data pengguna berhasil diupdate' })
  @ApiResponse({ status: 401, description: 'Token tidak valid' })
  @ApiResponse({ status: 403, description: 'Akses ditolak' })
  @ApiResponse({ status: 404, description: 'Pengguna tidak ditemukan' })
  async updateUser(
    @Param('id') id: string,
    @Body() updateDto: any,
    @Req() req: Request,
  ) {
    try {
      // Prefer internal transport if available
      // Not implemented in UsersService; fall back to HTTP directly
      const base = process.env.USER_HTTP_URL || process.env.USER_SERVICE_HTTP_URL || 'http://127.0.0.1:8602';
      const resp = await axios.put(`${base}/users/${encodeURIComponent(id)}`, updateDto, {
        headers: { Authorization: (req.headers['authorization'] as string) || '' },
        timeout: 8000,
      });
      return resp.data;
    } catch (err: any) {
      const status = err?.response?.status || 500;
      const data = err?.response?.data || { message: 'Upstream User Service error' };
      throw new HttpException(data, status);
    }
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN_FASKES)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Hapus pengguna (Admin only)' })
  @ApiParam({ name: 'id', description: 'ID pengguna' })
  @ApiResponse({ status: 200, description: 'Pengguna berhasil dihapus' })
  @ApiResponse({ status: 401, description: 'Token tidak valid' })
  @ApiResponse({ status: 403, description: 'Akses ditolak, role tidak sesuai' })
  @ApiResponse({ status: 404, description: 'Pengguna tidak ditemukan' })
  async remove(@Param('id') id: string, @Req() req: Request) {
    try {
      return await this.usersService.delete(id);
    } catch (e: any) {
      try {
        const base = process.env.USER_HTTP_URL || process.env.USER_SERVICE_HTTP_URL || 'http://127.0.0.1:8602';
        const resp = await axios.delete(`${base}/users/${encodeURIComponent(id)}`, {
          headers: { Authorization: (req.headers['authorization'] as string) || '' },
          timeout: 8000,
        });
        return resp.data;
      } catch (err: any) {
        const status = err?.response?.status || 500;
        const data = err?.response?.data || { message: 'Upstream User Service error' };
        throw new HttpException(data, status);
      }
    }
  }
}
