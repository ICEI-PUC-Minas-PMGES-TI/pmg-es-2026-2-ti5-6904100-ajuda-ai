import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

/** E-mail institucional presente no ID token v2 (sem inventar claim). */
export function emailDaIdentidadeMicrosoft(
  payload: JWTPayload,
): string | undefined {
  for (const claim of ['preferred_username', 'email', 'upn'] as const) {
    const valor = payload[claim];
    if (typeof valor === 'string' && valor.includes('@')) return valor;
  }
  return undefined;
}

export interface MicrosoftIdentity {
  subject: string;
  email: string;
  name?: string;
}

@Injectable()
export class MicrosoftTokenVerifier {
  async verificar(idToken: string): Promise<MicrosoftIdentity> {
    const tenantId = process.env.MICROSOFT_TENANT_ID;
    const clientId = process.env.MICROSOFT_CLIENT_ID;

    if (!tenantId || !clientId) {
      throw new ServiceUnavailableException(
        'Autenticação Microsoft não configurada no servidor.',
      );
    }

    const issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;
    const jwks = createRemoteJWKSet(
      new URL(
        `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
      ),
    );

    try {
      const { payload } = await jwtVerify(idToken, jwks, {
        audience: clientId,
        issuer,
      });
      if (typeof payload.tid === 'string' && payload.tid !== tenantId) {
        throw new UnauthorizedException(
          'O token Microsoft é de outro diretório.',
        );
      }

      const email = emailDaIdentidadeMicrosoft(payload);

      if (!payload.sub || !email) {
        throw new UnauthorizedException(
          'O token Microsoft não contém a identidade necessária.',
        );
      }

      return {
        subject: payload.sub,
        email,
        name: typeof payload.name === 'string' ? payload.name : undefined,
      };
    } catch (erro) {
      if (erro instanceof UnauthorizedException) {
        throw erro;
      }
      throw new UnauthorizedException('Token Microsoft inválido ou expirado.');
    }
  }
}
