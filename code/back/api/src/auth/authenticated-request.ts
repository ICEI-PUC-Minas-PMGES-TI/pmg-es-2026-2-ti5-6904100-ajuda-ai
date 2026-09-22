import type { Request } from 'express';
import type { Perfil } from '../dados/dados.js';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  perfil: Perfil;
}

export interface AuthenticatedRequest extends Request {
  user: AccessTokenPayload;
}
