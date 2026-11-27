import { afterEach, describe, expect, it } from 'vitest';
import { bancoMatchingIsolado } from './helpers/matching-postgres.js';
import { ProgramaEntity } from '../src/programas/entities/programa.entity.js';
import { ParticipacaoEntity } from '../src/participacoes/entities/participacao.entity.js';
import { ChatService } from '../src/chat/chat.service.js';

describe.skipIf(
  !process.env.MATCHING_TEST_DB_URL ||
    process.env.MATCHING_TEST_DB_ISOLATED !== 'true',
)('Migração do legado em PostgreSQL real', () => {
  let banco: Awaited<ReturnType<typeof bancoMatchingIsolado>>;
  afterEach(async () => {
    await banco?.limpar();
  }, 30_000);

  it('importa a recusa anterior uma vez e conserva o motivo e a decisão original', async () => {
    banco = await bancoMatchingIsolado(false);
    const { dados, schema } = banco,
      s = `"${schema}"`;
    const programa = await dados.getRepository(ProgramaEntity).save({
      codigo: '2026/2',
      titulo: 'Recusa legada',
      etapaAtual: 'formacao',
      inscricoesAbertas: false,
    });
    const [p, a] = await dados.getRepository(ParticipacaoEntity).save(
      [
        {
          usuarioId: 'p@teste.local',
          papel: 'candidato' as const,
          status: 'aprovado' as const,
        },
        {
          usuarioId: 'a@teste.local',
          papel: 'apadrinhado' as const,
          status: 'em_andamento' as const,
        },
      ].map((v) => ({ ...v, programa: programa.codigo, respostas: {} })),
    );
    const [{ id: config }] = await dados.query(
      `INSERT INTO ${s}.matching_configuracoes(programa_id,versao,liberado,capacidade_por_padrinho,capacidade_por_apadrinhado,criterios) VALUES($1,1,true,3,1,'[]') RETURNING id`,
      [programa.id],
    );
    const [{ id: execucao }] = await dados.query(
      `INSERT INTO ${s}.matching_execucoes(programa_id,configuracao_id,status,config_snapshot,formularios_snapshot) VALUES($1,$2,'concluida','{}','{}') RETURNING id`,
      [programa.id, config],
    );
    const [{ id: sugestao }] = await dados.query(
      `INSERT INTO ${s}.matching_sugestoes(programa_id,execucao_id,padrinho_participacao_id,apadrinhado_participacao_id,status,score,explicacao,motivo_decisao) VALUES($1,$2,$3,$4,'recusada',1,'{}','Motivo resumido') RETURNING id`,
      [programa.id, execucao, p.id, a.id],
    );
    await dados.query(
      `INSERT INTO ${s}.matching_decisoes(sugestao_id,decisao,responsavel,motivo) VALUES($1,'recusada','coord@teste.local','Necessidades de acompanhamento diferentes')`,
      [sugestao],
    );
    const antes = await dados.query(`SELECT * FROM ${s}.matching_decisoes`);
    await banco.aplicarNovas();
    await banco.aplicarNovas();
    const eventos = await dados.query(
      `SELECT * FROM ${s}.matching_pares_decisoes`,
    );
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({
      programa_id: programa.id,
      padrinho_participacao_id: p.id,
      apadrinhado_participacao_id: a.id,
      acao: 'recusado',
      responsavel: 'coord@teste.local',
      motivo: 'Necessidades de acompanhamento diferentes',
      sugestao_id: sugestao,
    });
    expect(await dados.query(`SELECT * FROM ${s}.matching_decisoes`)).toEqual(
      antes,
    );
  }, 90_000);

  it('preserva múltiplos padrinhos, isola inconsistências e limita histórico fechado', async () => {
    banco = await bancoMatchingIsolado(false);
    const { dados, schema } = banco,
      s = `"${schema}"`;
    const programa = await dados.getRepository(ProgramaEntity).save({
      codigo: '2026/2',
      titulo: 'Legado',
      etapaAtual: 'andamento',
      inscricoesAbertas: false,
    });
    const pessoas = await dados.getRepository(ParticipacaoEntity).save(
      [
        { usuarioId: 'p1@teste.local', papel: 'padrinho' as const },
        { usuarioId: 'p2@teste.local', papel: 'padrinho' as const },
        { usuarioId: 'a1@teste.local', papel: 'apadrinhado' as const },
        { usuarioId: 'a2@teste.local', papel: 'apadrinhado' as const },
        { usuarioId: 'intruso@teste.local', papel: 'apadrinhado' as const },
        {
          usuarioId: 'fora@teste.local',
          papel: 'apadrinhado' as const,
          programa: '2026/1',
        },
      ].map((p) => ({
        programa: programa.codigo,
        status: 'em_andamento' as const,
        grupo: 'Grupo legado',
        respostas: { nome: p.usuarioId },
        ...p,
      })),
    );
    const [p1, p2, a1, a2, intruso, fora] = pessoas;
    const vinculo = async (p: number, a: number, ativo = true) =>
      (
        await dados.query(
          `INSERT INTO ${s}.matching_vinculos(programa_id,padrinho_participacao_id,apadrinhado_participacao_id,ativo,origem,confirmado_em,encerrado_em) VALUES($1,$2,$3,$4,'legado','2026-09-01',CASE WHEN $4 THEN NULL ELSE '2026-10-01'::timestamptz END) RETURNING id`,
          [programa.id, p, a, ativo],
        )
      )[0].id as number;
    await vinculo(p1.id, a1.id);
    await vinculo(p2.id, a1.id);
    const encerrado = await vinculo(p1.id, a2.id, false);
    const invalido = await vinculo(p1.id, fora.id);
    const [{ id: chatId }] = await dados.query(
      `INSERT INTO ${s}.chats(programa_id,matching_vinculo_id,ativo) VALUES($1,$2,false) RETURNING id`,
      [programa.id, encerrado],
    );
    await dados.query(
      `INSERT INTO ${s}.chat_participantes(chat_id,participacao_id) VALUES($1,$2)`,
      [chatId, intruso.id],
    );
    await dados.query(
      `INSERT INTO ${s}.mensagens_chat(chat_id,remetente_participacao_id,texto,estado,criada_em) VALUES($1,$2,'Histórico permitido','enviada','2026-09-15'),($1,$2,'Depois do encerramento','enviada','2026-10-02')`,
      [chatId, p1.id],
    );
    const [{ id: semOrigem }] = await dados.query(
      `INSERT INTO ${s}.chats(programa_id,titulo) VALUES($1,'Grupo legado') RETURNING id`,
      [programa.id],
    );
    await dados.query(
      `INSERT INTO ${s}.chat_participantes(chat_id,participacao_id) VALUES($1,$2)`,
      [semOrigem, a1.id],
    );

    expect(await banco.aplicarNovas()).toHaveLength(5);
    expect(await banco.aplicarNovas()).toEqual([]);
    expect(
      (
        await dados.query(
          `SELECT grupo_id FROM ${s}.matching_vinculos WHERE id=$1`,
          [invalido],
        )
      )[0].grupo_id,
    ).toBeNull();
    expect(
      (
        await dados.query(
          `SELECT apadrinhados FROM ${s}.participacoes WHERE id=$1`,
          [p1.id],
        )
      )[0].apadrinhados,
    ).toBe(1);
    expect(
      (
        await dados.query(`SELECT grupo FROM ${s}.participacoes WHERE id=$1`, [
          a1.id,
        ])
      )[0].grupo,
    ).toBeNull();
    expect(
      (
        await dados.query(
          `SELECT count(*)::int AS n FROM ${s}.matching_vinculos WHERE ativo AND apadrinhado_participacao_id=$1 AND grupo_id IS NOT NULL`,
          [a1.id],
        )
      )[0].n,
    ).toBe(2);
    expect(
      (
        await dados.query(
          `SELECT ativo FROM ${s}.matching_vinculos WHERE id=$1`,
          [encerrado],
        )
      )[0].ativo,
    ).toBe(false);
    expect(
      (
        await dados.query(
          `SELECT count(*)::int AS n FROM ${s}.chat_periodos WHERE chat_id=$1 AND participacao_id=$2`,
          [chatId, intruso.id],
        )
      )[0].n,
    ).toBe(0);
    expect(
      (
        await dados.query(
          `SELECT count(*)::int AS n FROM ${s}.chat_conciliacao WHERE chat_id=$1`,
          [semOrigem],
        )
      )[0].n,
    ).toBe(1);
    const chat = new ChatService(dados);
    expect(
      (await chat.listarMensagens(chatId, a2.usuarioId)).mensagens.map(
        (m) => m.texto,
      ),
    ).toEqual(['Histórico permitido']);
    await expect(
      chat.listarMensagens(chatId, intruso.usuarioId),
    ).rejects.toThrow();
    await expect(
      chat.listarMensagens(semOrigem, a1.usuarioId),
    ).rejects.toThrow();
  }, 90_000);
});
