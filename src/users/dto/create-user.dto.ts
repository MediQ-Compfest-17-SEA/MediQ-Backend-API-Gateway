import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({
    example: '3204123456780001',
    description: 'Nomor Induk Kependudukan',
  })
  @IsString()
  @IsNotEmpty()
  nik: string;

  @ApiProperty({ example: 'John Doe', description: 'Nama lengkap pengguna' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: 'JohnDoe@Example.com',
    description: 'Email pengguna unik',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: 'password123',
    description: 'Password pengguna, minimal 6 karakter',
  })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;
}
