import { IsEmail, IsString, MinLength } from 'class-validator';

export class TokenDto {
  @IsEmail()
  address!: string;

  @IsString()
  @MinLength(4)
  password!: string;
}
