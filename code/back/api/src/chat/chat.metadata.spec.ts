import { DataSource } from 'typeorm';
import { ENTIDADES_CHAT } from './chat.module.js';
import { ENTIDADES_MATCHING } from '../matching/matching.module.js';
import { ProgramaEntity } from '../programas/entities/programa.entity.js';
import { ParticipacaoEntity } from '../participacoes/entities/participacao.entity.js';
import {
  ChatEntity,
  ChatPeriodoEntity,
  ChatDestinatarioEntity,
  MensagemChatEntity,
} from './entities/chat.entity.js';

it('resolve os relacionamentos e índices de chat sem conectar ao banco', async () => {
  const ds = new DataSource({
    type: 'postgres',
    entities: [
      ...new Set([
        ProgramaEntity,
        ParticipacaoEntity,
        ...ENTIDADES_MATCHING,
        ...ENTIDADES_CHAT,
      ]),
    ],
    synchronize: false,
  });
  await Reflect.get(ds, 'buildMetadatas').call(ds);
  expect(
    ds
      .getMetadata(ChatEntity)
      .indices.some(
        (i) =>
          i.isUnique && i.columns.some((c) => c.propertyName === 'grupoId'),
      ),
  ).toBe(true);
  expect(
    ds
      .getMetadata(ChatPeriodoEntity)
      .indices.some((i) => i.isUnique && i.where?.includes('ate_mensagem_id')),
  ).toBe(true);
  expect(
    ds
      .getMetadata(ChatDestinatarioEntity)
      .uniques.some(
        (i) =>
          i.columns.map((c) => c.propertyName).join(',') ===
          'mensagemId,participacaoId',
      ),
  ).toBe(true);
  expect(
    ds
      .getMetadata(MensagemChatEntity)
      .indices.some(
        (i) =>
          i.isUnique && i.columns.some((c) => c.propertyName === 'clientId'),
      ),
  ).toBe(true);
  expect(ds.isInitialized).toBe(false);
});
