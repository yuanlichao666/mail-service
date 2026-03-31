import { IsEmail, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAccountDto {
  @IsEmail()
  address!: string;

  @IsString()
  @MinLength(4)
  password!: string;

  @IsOptional()
  @IsInt()
  expiresIn?: number;
}
