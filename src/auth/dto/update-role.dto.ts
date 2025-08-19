import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { Role } from '../guards/roles/roles.guard';

export class UpdateRoleDto {
  @ApiProperty({ enum: Role, example: Role.OPERATOR })
  @IsEnum(Role)
  @IsNotEmpty()
  role: Role;
}
