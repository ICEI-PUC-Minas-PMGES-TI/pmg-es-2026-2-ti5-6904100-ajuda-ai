import type { Request } from 'express';
import type { Perfil } from '../dados/dados.js';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  perfil?: Perfil;
  /** `acesso` entra no sistema. `onboarding` só conclui o primeiro cadastro. */
  escopo?: 'acesso' | 'onboarding';
  nome?: string;
}

export interface AuthenticatedRequest extends Request {
  user: AccessTokenPayload;
}
