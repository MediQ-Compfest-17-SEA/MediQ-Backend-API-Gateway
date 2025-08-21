import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { UserLoginDto } from './dto/user-login.dto';
import { CurrentUser } from './decorators/current-user.decorator';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login/admin')
  @ApiOperation({ 
    summary: 'Login admin dengan email dan password',
    description: `
Login untuk administrator dengan credential email dan password.

**Contoh Request:**
\`\`\`json
{
  "email": "admin@mediq.com",
  "password": "admin123"
}
\`\`\`

**Contoh Response Success:**
\`\`\`json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "admin-123",
    "email": "admin@mediq.com", 
    "role": "ADMIN_FASKES",
    "nama": "Administrator"
  },
  "expires_in": 900
}
\`\`\`
    `
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Login berhasil - Mengembalikan access token dan refresh token',
    schema: {
      type: 'object',
      properties: {
        access_token: { type: 'string', description: 'JWT access token (15 menit)', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
        refresh_token: { type: 'string', description: 'JWT refresh token (7 hari)', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'admin-123' },
            email: { type: 'string', example: 'admin@mediq.com' },
            role: { type: 'string', example: 'ADMIN_FASKES' },
            nama: { type: 'string', example: 'Administrator' }
          }
        },
        expires_in: { type: 'number', description: 'Token expiry dalam detik', example: 900 }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Email atau password salah',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'Email atau password salah' },
        error: { type: 'string', example: 'Unauthorized' }
      }
    }
  })
  async loginAdmin(@Body() loginDto: AdminLoginDto) {
    return this.authService.loginAdmin(loginDto);
  }

  @Post('login/user')
  @ApiOperation({ 
    summary: 'Login pengguna dengan NIK dan nama',
    description: `
Login untuk pasien/user dengan NIK dan nama sesuai KTP.

**Contoh Request:**
\`\`\`json
{
  "nik": "1234567890123456",
  "nama": "SULISTYONO"
}
\`\`\`

**Contoh Response Success:**
\`\`\`json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-456",
    "nik": "1234567890123456",
    "nama": "SULISTYONO",
    "role": "PASIEN",
    "tempat_lahir": "KEDIRI",
    "tgl_lahir": "1966-02-26"
  },
  "expires_in": 900
}
\`\`\`
    `
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Login berhasil - Mengembalikan user data lengkap dengan token',
    schema: {
      type: 'object',
      properties: {
        access_token: { type: 'string', description: 'JWT access token (15 menit)' },
        refresh_token: { type: 'string', description: 'JWT refresh token (7 hari)' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'user-456' },
            nik: { type: 'string', example: '1234567890123456' },
            nama: { type: 'string', example: 'SULISTYONO' },
            role: { type: 'string', example: 'PASIEN' },
            tempat_lahir: { type: 'string', example: 'KEDIRI' },
            tgl_lahir: { type: 'string', example: '1966-02-26' }
          }
        },
        expires_in: { type: 'number', example: 900 }
      }
    }
  })
  @ApiResponse({ 
    status: 401, 
    description: 'NIK atau nama tidak sesuai dengan data yang terdaftar',
    schema: {
      type: 'object', 
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'NIK atau nama tidak sesuai' }
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Pengguna dengan NIK tersebut tidak ditemukan di database',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'Pengguna tidak ditemukan' }
      }
    }
  })
  async loginUser(@Body() loginDto: UserLoginDto) {
    return this.authService.loginUser(loginDto);
  }

  @Get('refresh')
  @UseGuards(AuthGuard('jwt-refresh'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Refresh access token menggunakan refresh token' })
  @ApiResponse({ status: 200, description: 'Token berhasil diperbarui' })
  @ApiResponse({ status: 401, description: 'Refresh token tidak valid' })
  async refresh(@CurrentUser() user: any) {
    return this.authService.refresh(user);
  }

  @Get('logout')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout pengguna' })
  @ApiResponse({ status: 200, description: 'Logout berhasil' })
  @ApiResponse({ status: 401, description: 'Token tidak valid' })
  async logout(@CurrentUser() user: any) {
    return this.authService.logout(user.id);
  }
}
