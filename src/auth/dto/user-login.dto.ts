import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UserLoginDto {
  @ApiProperty({
    example: '3204123456780001',
    description: 'Nomor Induk Kependudukan',
  })
  @IsString()
  @IsNotEmpty()
  nik: string;

  @ApiProperty({
    example: 'Budi Santoso',
    description: 'Nama lengkap pengguna sesuai KTP/BPJS',
  })
  @IsString()
  @IsNotEmpty()
  name: string;
}
