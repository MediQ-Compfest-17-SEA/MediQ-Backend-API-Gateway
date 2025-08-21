import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
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
  async create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
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
  @ApiOperation({ summary: 'Dapatkan profil pengguna yang sedang login' })
  @ApiResponse({ status: 200, description: 'Profil pengguna berhasil didapat' })
  @ApiResponse({ status: 401, description: 'Token tidak valid' })
  async getProfile(@CurrentUser() user: any) {
    return this.usersService.getProfile(user);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN_FASKES)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dapatkan semua pengguna (Admin only)' })
  @ApiResponse({ status: 200, description: 'Data pengguna berhasil didapat' })
  @ApiResponse({ status: 401, description: 'Token tidak valid' })
  @ApiResponse({ status: 403, description: 'Akses ditolak, role tidak sesuai' })
  async findAll() {
    return this.usersService.findAll();
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
  ) {
    return this.usersService.updateRole(id, updateRoleDto);
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
  async remove(@Param('id') id: string) {
    return this.usersService.delete(id);
  }
}
