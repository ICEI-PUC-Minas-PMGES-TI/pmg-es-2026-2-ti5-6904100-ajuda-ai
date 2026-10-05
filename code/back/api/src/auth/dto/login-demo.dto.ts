import { IsEmail, IsNotEmpty } from 'class-validator';

export class LoginDemoDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}
