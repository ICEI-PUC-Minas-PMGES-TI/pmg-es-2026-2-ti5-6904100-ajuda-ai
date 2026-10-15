import { describe, expect, it } from 'vitest';
import type { JWTPayload } from 'jose';
import { emailDaIdentidadeMicrosoft } from './microsoft-token.verifier.js';

describe('emailDaIdentidadeMicrosoft', () => {
  it('prefere preferred_username, depois email e upn', () => {
    expect(
      emailDaIdentidadeMicrosoft({
        preferred_username: 'ana@pucminas.edu.br',
        email: 'outro@pucminas.edu.br',
      }),
    ).toBe('ana@pucminas.edu.br');
    expect(
      emailDaIdentidadeMicrosoft({ email: 'ana@pucminas.edu.br' } as JWTPayload),
    ).toBe('ana@pucminas.edu.br');
    expect(
      emailDaIdentidadeMicrosoft({ upn: 'ana@pucminas.edu.br' } as JWTPayload),
    ).toBe('ana@pucminas.edu.br');
  });

  it('ignora claim que não é e-mail', () => {
    expect(
      emailDaIdentidadeMicrosoft({
        preferred_username: 'nao-e-email',
        upn: 'ana@pucminas.edu.br',
      } as JWTPayload),
    ).toBe('ana@pucminas.edu.br');
    expect(emailDaIdentidadeMicrosoft({})).toBeUndefined();
  });
});
