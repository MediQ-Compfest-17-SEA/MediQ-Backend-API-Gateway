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
  @ApiOperation({ summary: 'Buat pengguna baru' })
  @ApiResponse({ status: 201, description: 'Pengguna berhasil dibuat' })
  @ApiResponse({ status: 400, description: 'Data tidak valid' })
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
