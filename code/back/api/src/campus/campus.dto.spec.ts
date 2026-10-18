import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { AtualizarEventoDto, CriarEventoDto } from './eventos/eventos.dto.js';
import { AtualizarRestauranteDto } from './restaurantes/restaurantes.dto.js';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
});
describe('Validação do conteúdo do campus', () => {
  for (const campo of ['titulo', 'descricao', 'inicio', 'fim']) {
    it(`PATCH evento recusa ${campo}: null antes do service`, async () => {
      await expect(
        pipe.transform(
          { [campo]: null },
          {
            type: 'body',
            metatype: AtualizarEventoDto,
          },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  }
  for (const campo of ['nome', 'descricao', 'local', 'horarios']) {
    it(`PATCH restaurante recusa ${campo}: null antes do service`, async () => {
      await expect(
        pipe.transform(
          { [campo]: null },
          {
            type: 'body',
            metatype: AtualizarRestauranteDto,
          },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  }
  for (const metatype of [CriarEventoDto, AtualizarEventoDto]) {
    it(`${metatype.name} recusa data impossível que Date normaliza`, async () => {
      await expect(
        pipe.transform(
          {
            titulo: 'Feira',
            inicio: '2026-02-30T10:00:00-03:00',
            fim: '2026-03-03T10:00:00-03:00',
          },
          { type: 'body', metatype },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  }
  it('preserva local: null para remover o local do evento', async () => {
    await expect(
      pipe.transform(
        { local: null },
        {
          type: 'body',
          metatype: AtualizarEventoDto,
        },
      ),
    ).resolves.toEqual({ local: null });
  });
  it('aceita data real em ano bissexto e horário com precisão de minutos', async () => {
    const dados = {
      titulo: 'Feira',
      inicio: '2028-02-29T10:00-03:00',
      fim: '2028-02-29T12:00-03:00',
    };
    await expect(
      pipe.transform(dados, {
        type: 'body',
        metatype: CriarEventoDto,
      }),
    ).resolves.toMatchObject(dados);
  });
});
