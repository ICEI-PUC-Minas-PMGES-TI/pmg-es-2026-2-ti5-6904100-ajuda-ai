/**
 * Seed das contas de DEMONSTRAÇÃO da gamificação (BL-50).
 *
 *   npm run seed:demo-gamificacao                      # banco local
 *   npm run seed:demo-gamificacao -- --compartilhado   # banco remoto (ex.: Supabase)
 *   ... -- --fixtures-teto     # só em banco local: coletas dos cenários B e C
 *   ... -- --reiniciar         # volta XP/moedas das contas ao estado-alvo
 *   ... -- --verificar         # só confere, não grava nada
 *
 * Regras:
 * - Contas em `src/dados/demo-gamificacao.ts` (e-mails `demo.` fictícios).
 * - Idempotente: usuários, participações e movimentações têm identificação
 *   estável; rodar de novo não duplica nada nem soma XP outra vez.
 * - XP e moedas passam pelo domínio (`registrarMovimentacao`, AJUSTE_ADMIN,
 *   ±200 por movimentação, chave de idempotência, carteira travada). XP alto
 *   vira trajetória em ciclos anteriores (não conta nos tetos do ciclo atual).
 *   Moedas abaixo do XP = ajuste "moedas já utilizadas" (sem resgate real).
 * - Nunca toca em quem não está na lista; nas contas demo antigas (Camila,
 *   Thiago, Lucas) só acrescenta XP e moedas, sem mexer em perfil, vínculo
 *   ou participação.
 * - Linha de `celebracoes_nivel` (se a migration já rodou): o nível atual
 *   da conta demo fica "celebrado" quando o seed muda o XP, para que a
 *   trajetória fictícia não dispare a animação de novo nível. Subidas reais
 *   depois do seed (ex.: Gabriel coletando um totem) são celebradas.
 * - Recusado com NODE_ENV=production.
 */
import { DataSource, type QueryRunner } from 'typeorm';
import { ehBancoLocal } from '../config/seguranca.js';
import {
  CICLOS_HISTORICOS_DEMO,
  CONTAS_DEMO_GAMIFICACAO,
  type ContaDemo,
  MOTIVO_REJEICAO_DEMO,
} from '../dados/demo-gamificacao.js';
import { LIMITES, nivelDe } from '../gamificacao/economia.js';
import {
  registrarMovimentacao,
  travarCarteira,
} from '../gamificacao/gamificacao.js';
import { creditarGanho } from '../gamificacao/ganhos.js';
import { ParticipacoesService } from '../participacoes/participacoes.service.js';

const MAX = LIMITES.ajusteAdmin;
const CICLO_EX = '2026/1';
const RESPONSAVEL = 'seed:demo-gamificacao';

function partes(total: number): number[] {
  const lista: number[] = [];
  for (let resto = total; resto > 0; resto -= MAX)
    lista.push(Math.min(MAX, resto));
  return lista;
}

/** Movimentações que levam a conta do zero ao estado-alvo. */
function plano(conta: ContaDemo) {
  const ciclos = conta.situacao === 'ex' ? [CICLO_EX] : CICLOS_HISTORICOS_DEMO;
  const creditos = partes(conta.xp).map((q, i) => ({
    chave: `demo:v1:${conta.email}:xp:${i}`,
    quantidade: q,
    xp: q,
    ciclo: ciclos[i % ciclos.length],
    descricao: `Demonstração: XP acumulado no ciclo ${ciclos[i % ciclos.length]}`,
  }));
  const debitos = partes(conta.xp - conta.moedas).map((q, i) => ({
    chave: `demo:v1:${conta.email}:moedas:${i}`,
    quantidade: -q,
    xp: 0,
    ciclo: null as string | null,
    descricao: 'Demonstração: moedas já utilizadas (sem resgate real)',
  }));
  return [...creditos, ...debitos];
}

async function usuario(qr: QueryRunner, s: string, conta: ContaDemo) {
  const [existe] = (await qr.query(
    `SELECT id FROM ${s}."usuarios" WHERE email = $1`,
    [conta.email],
  )) as Array<{ id: number }>;
  if (existe) return { id: existe.id, criado: false };
  if (conta.existente)
    throw new Error(
      `${conta.email} deveria existir (rode antes o npm run seed:demo).`,
    );
  const status =
    conta.situacao === 'pendente'
      ? 'pendente'
      : conta.situacao === 'rejeitado'
        ? 'rejeitado'
        : 'aprovado';
  const [novo] = (await qr.query(
    `INSERT INTO ${s}."usuarios" (nome, email, curso, periodo, interesses, tipo_participacao, status_cadastro, motivo_rejeicao, analisado_em, analisado_por) ` +
      `VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10) RETURNING id`,
    [
      conta.nome,
      conta.email,
      conta.curso,
      conta.periodo,
      JSON.stringify(conta.interesses),
      conta.papel === 'apadrinhado' ? 'apadrinhado' : 'padrinho',
      status,
      status === 'rejeitado' ? MOTIVO_REJEICAO_DEMO : null,
      status === 'pendente' ? null : new Date(),
      status === 'pendente' ? null : 'renata@pucminas.edu.br',
    ],
  )) as Array<{ id: number }>;
  return { id: novo.id, criado: true };
}

/** Participação conforme a situação; só cria (nunca altera uma existente). */
async function participacao(
  qr: QueryRunner,
  s: string,
  conta: ContaDemo,
  ciclo: string,
): Promise<boolean> {
  if (conta.existente) return false;
  const programa = conta.situacao === 'ex' ? CICLO_EX : ciclo;
  const papel =
    conta.situacao === 'ativo' || conta.situacao === 'ex'
      ? conta.papel
      : conta.papel === 'apadrinhado'
        ? 'apadrinhado'
        : 'candidato';
  const [existe] = (await qr.query(
    `SELECT id FROM ${s}."participacoes" WHERE usuario_id = $1 AND programa = $2 AND papel = $3`,
    [conta.email, programa, papel],
  )) as unknown[];
  if (existe) return false;
  const status = {
    ativo: 'em_andamento',
    // Apadrinhado aprovado vai direto para em_andamento (sem grupo = sem par);
    // padrinho aprovado fica como candidato aprovado aguardando matching.
    aguardando: papel === 'apadrinhado' ? 'em_andamento' : 'aprovado',
    pendente: 'pendente',
    rejeitado: 'nao_aprovado',
    ex: 'concluido',
  }[conta.situacao];
  const grupo = conta.situacao === 'ativo' ? (conta.grupo ?? null) : null;
  const apadrinhados =
    papel === 'padrinho' && grupo
      ? CONTAS_DEMO_GAMIFICACAO.filter(
          (c) => c.grupo === grupo && c.papel === 'apadrinhado',
        ).length
      : 0;
  const respostas: Record<string, unknown> = {
    demonstracao: true,
    interesses: conta.interesses,
    motivacao: 'Conta de demonstração do Ajuda-aí.',
  };
  if (conta.situacao === 'rejeitado')
    respostas._servidor = {
      decisao: {
        resultado: 'nao_aprovado',
        justificativa: MOTIVO_REJEICAO_DEMO,
        em: new Date().toISOString(),
        por: 'renata@pucminas.edu.br',
      },
    };
  await qr.query(
    `INSERT INTO ${s}."participacoes" (usuario_id, programa, papel, status, grupo, apadrinhados, inicio_em, termino_em, respostas) ` +
      `VALUES ($1, $2, $3, $4, $5, $6, now(), $7, $8::jsonb)`,
    [
      conta.email,
      programa,
      papel,
      status,
      grupo,
      apadrinhados,
      conta.situacao === 'rejeitado' || conta.situacao === 'ex'
        ? new Date()
        : null,
      JSON.stringify(respostas),
    ],
  );
  return true;
}

async function movimentar(
  qr: QueryRunner,
  usuarioId: number,
  m: {
    chave: string;
    quantidade: number;
    xp: number;
    ciclo: string | null;
    descricao: string;
  },
) {
  const [ja] = (await qr.query(
    `SELECT 1 FROM gamificacao.xp_movimentacoes WHERE chave_idempotencia = $1`,
    [m.chave],
  )) as unknown[];
  if (ja) return false;
  await registrarMovimentacao(qr, {
    usuarioId,
    quantidade: m.quantidade,
    xp: m.xp,
    ciclo: m.ciclo,
    tipo: 'AJUSTE_ADMIN',
    referenciaTipo: 'DEMO',
    referenciaId: RESPONSAVEL,
    descricao: m.descricao,
    chaveIdempotencia: m.chave,
  });
  return true;
}

async function estado(executor: DataSource | QueryRunner, usuarioId: number) {
  const [c] = (await executor.query(
    `SELECT saldo, xp_acumulado FROM gamificacao.xp_carteiras WHERE usuario_id = $1`,
    [usuarioId],
  )) as Array<{ saldo: number; xp_acumulado: number }>;
  return { moedas: c?.saldo ?? 0, xp: c?.xp_acumulado ?? 0 };
}

/**
 * Marca o nível atual como celebrado. `exato`: o seed acabou de mudar o XP
 * (o estado da conta é o alvo). Sem mudança, só cria a linha se faltar: uma
 * conquista real ainda não vista continua pendente.
 */
async function baselineCelebracao(
  qr: QueryRunner,
  usuarioId: number,
  exato: boolean,
) {
  const { xp } = await estado(qr, usuarioId);
  await qr.query(
    `INSERT INTO gamificacao.celebracoes_nivel (usuario_id, nivel_celebrado) VALUES ($1, $2) ` +
      (exato
        ? `ON CONFLICT (usuario_id) DO UPDATE SET nivel_celebrado = EXCLUDED.nivel_celebrado, atualizado_em = now()`
        : `ON CONFLICT (usuario_id) DO NOTHING`),
    [usuarioId, nivelDe(xp).numero],
  );
}

/** XP das fixtures de teto (cenários B/C), quando existem (só local). */
async function extraFixture(
  executor: DataSource | QueryRunner,
  usuarioId: number,
  conta: ContaDemo,
): Promise<number> {
  if (!conta.fixtureTeto) return 0;
  const [{ n }] = (await executor.query(
    `SELECT count(*)::int AS n FROM gamificacao.pucstop_coletas c JOIN mapa.pucstops p ON p.id = c.pucstop_id WHERE c.usuario_id = $1 AND p.nome LIKE '[fixture demo]%'`,
    [usuarioId],
  )) as Array<{ n: number }>;
  return n ? conta.fixtureTeto : 0;
}

/** Compensa a diferença até o estado-alvo (só com --reiniciar). */
async function reiniciar(
  qr: QueryRunner,
  usuarioId: number,
  conta: ContaDemo,
  marca: string,
) {
  const atual = await estado(qr, usuarioId);
  const extra = await extraFixture(qr, usuarioId, conta);
  const dx = conta.xp + extra - atual.xp;
  const dm = conta.moedas + extra - atual.moedas;
  const ops: Array<{ quantidade: number; xp: number }> = [];
  // XP e moedas juntos na parte em comum; o resto só em moedas.
  for (const q of partes(Math.abs(dx)))
    ops.push({ quantidade: Math.sign(dx) * q, xp: Math.sign(dx) * q });
  const resto = dm - dx;
  for (const q of partes(Math.abs(resto)))
    ops.push({ quantidade: Math.sign(resto) * q, xp: 0 });
  // Créditos de moedas antes dos débitos: o saldo nunca passa por negativo.
  ops.sort((a, b) => b.quantidade - a.quantidade);
  let n = 0;
  for (const op of ops)
    await movimentar(qr, usuarioId, {
      chave: `demo:reset:${marca}:${conta.email}:${n++}`,
      ...op,
      ciclo: null,
      descricao: 'Demonstração: reinício controlado do estado da conta',
    });
  return ops.length;
}

/** Cenários B e C: coletas reais do domínio em totens só de fixture (local). */
async function fixturesTeto(ds: DataSource, s: string, ciclo: string) {
  const alvo = Object.fromEntries(
    CONTAS_DEMO_GAMIFICACAO.filter((c) => c.fixtureTeto).map((c) => [
      c.email,
      c.fixtureTeto!,
    ]),
  );
  const valores = [50, 50, 50, 50, 50, 50, 50, 30, 20];
  const totens: string[] = [];
  for (const [i, xp] of valores.entries()) {
    const nome = `[fixture demo] Totem ${i + 1}`;
    const [t] = (await ds.query(
      `SELECT id FROM mapa.pucstops WHERE nome = $1`,
      [nome],
    )) as Array<{ id: string }>;
    totens.push(
      t?.id ??
        (
          (await ds.query(
            `INSERT INTO mapa.pucstops (nome, localizacao, raio_metros, xp, ativo) ` +
              `VALUES ($1, ST_SetSRID(ST_MakePoint(-43.9935, -19.9236), 4326), 30, $2, false) RETURNING id`,
            [nome, xp],
          )) as Array<{ id: string }>
        )[0].id,
    );
  }
  for (const [email, meta] of Object.entries(alvo)) {
    const [{ id: uid }] = (await ds.query(
      `SELECT id FROM ${s}."usuarios" WHERE email = $1`,
      [email],
    )) as Array<{ id: number }>;
    let soma = 0;
    for (const [i, xp] of valores.entries()) {
      if (soma >= meta) break;
      const valor = Math.min(xp, meta - soma);
      if (!valores.includes(valor)) continue;
      const qr = ds.createQueryRunner();
      await qr.connect();
      await qr.startTransaction();
      try {
        await travarCarteira(qr, uid);
        const [ja] = (await qr.query(
          `SELECT xp FROM gamificacao.pucstop_coletas WHERE usuario_id = $1 AND pucstop_id = $2 AND ciclo = $3`,
          [uid, totens[i], ciclo],
        )) as Array<{ xp: number }>;
        if (!ja) {
          const g = await creditarGanho(qr, {
            usuarioId: uid,
            fonte: 'TOTEM',
            xp: valor,
            ciclo,
            referenciaTipo: 'pucstop',
            referenciaId: totens[i],
            descricao: 'Fixture demo: coleta de totem',
            chaveIdempotencia: `pucstop:${totens[i]}:usuario:${uid}:ciclo:${ciclo}`,
          });
          await qr.query(
            `INSERT INTO gamificacao.pucstop_coletas (usuario_id, pucstop_id, movimentacao_id, xp, xp_configurado, ciclo) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              uid,
              totens[i],
              g.movimentacao?.movimentacaoId ?? null,
              g.xp,
              valor,
              ciclo,
            ],
          );
          soma += g.xp;
        } else soma += ja.xp;
        await qr.commitTransaction();
      } catch (e) {
        await qr.rollbackTransaction();
        throw e;
      } finally {
        await qr.release();
      }
    }
  }
}

async function principal() {
  const args = new Set(process.argv.slice(2));
  if (process.env.NODE_ENV === 'production') {
    console.error('seed:demo-gamificacao é recusado com NODE_ENV=production.');
    process.exit(1);
  }
  const base = (await import('../database/data-source.js')).default;
  const host = String((base.options as { host?: string }).host ?? '');
  const local = ehBancoLocal(host);
  if (!local && !args.has('--compartilhado')) {
    console.error(
      `Banco remoto (${host}). Para gravar contas demo nele, passe --compartilhado.`,
    );
    process.exit(1);
  }
  if (args.has('--fixtures-teto') && !local) {
    console.error(
      '--fixtures-teto só roda em banco local (cria coletas sem GPS).',
    );
    process.exit(1);
  }
  const ds = await base.initialize();
  const s = `"${((base.options as { schema?: string }).schema ?? 'feed').replaceAll('"', '""')}"`;
  const ciclo = ParticipacoesService.programaAtual();
  const so = args.has('--verificar');
  const marca = new Date().toISOString();
  const [{ celebracoes }] = (await ds.query(
    `SELECT to_regclass('gamificacao.celebracoes_nivel') IS NOT NULL AS celebracoes`,
  )) as Array<{ celebracoes: boolean }>;
  try {
    const ids = new Map<string, number>();
    for (const conta of CONTAS_DEMO_GAMIFICACAO) {
      if (so) {
        const [u] = (await ds.query(
          `SELECT id FROM ${s}."usuarios" WHERE email = $1`,
          [conta.email],
        )) as Array<{ id: number }>;
        if (u) ids.set(conta.email, u.id);
        continue;
      }
      const qr = ds.createQueryRunner();
      await qr.connect();
      await qr.startTransaction();
      try {
        const u = await usuario(qr, s, conta);
        ids.set(conta.email, u.id);
        const p = await participacao(qr, s, conta, ciclo);
        await travarCarteira(qr, u.id);
        let novas = 0;
        if (args.has('--reiniciar'))
          novas = await reiniciar(qr, u.id, conta, marca);
        else
          for (const m of plano(conta))
            if (await movimentar(qr, u.id, m)) novas++;
        if (celebracoes) await baselineCelebracao(qr, u.id, novas > 0);
        await qr.commitTransaction();
        console.log(
          `${conta.email}: usuário ${u.criado ? 'criado' : 'existente'}, participação ${p ? 'criada' : 'mantida'}, ${novas} movimentações novas`,
        );
      } catch (e) {
        await qr.rollbackTransaction();
        throw e;
      } finally {
        await qr.release();
      }
    }
    if (args.has('--fixtures-teto') && !so) await fixturesTeto(ds, s, ciclo);

    // Conferência do estado final.
    console.log('\nconta | XP | moedas | nível | esperado');
    let divergentes = 0;
    for (const conta of CONTAS_DEMO_GAMIFICACAO) {
      const id = ids.get(conta.email);
      if (!id) {
        console.log(`${conta.email} | (não existe)`);
        divergentes++;
        continue;
      }
      const e = await estado(ds, id);
      // Com as fixtures de teto (só local), o alvo inclui as coletas.
      const extra = await extraFixture(ds, id, conta);
      const alvoXp = conta.xp + extra;
      const alvoMoedas = conta.moedas + extra;
      const ok = e.xp === alvoXp && e.moedas === alvoMoedas;
      if (!ok) divergentes++;
      const n = nivelDe(e.xp);
      console.log(
        `${conta.email} | ${e.xp} | ${e.moedas} | ${n.numero} ${n.nome} | ${ok ? 'ok' : `alvo ${alvoXp}/${alvoMoedas} (uso posterior? use --reiniciar)`}`,
      );
    }
    const [{ n: incoerentes }] = (await ds.query(
      `SELECT count(*)::int AS n FROM gamificacao.xp_carteiras c WHERE c.saldo <> COALESCE((SELECT sum(quantidade) FROM gamificacao.xp_movimentacoes m WHERE m.usuario_id = c.usuario_id), 0) ` +
        `OR c.xp_acumulado <> COALESCE((SELECT sum(COALESCE(xp_quantidade, CASE WHEN tipo = 'RECOMPENSA' THEN 0 ELSE quantidade END)) FROM gamificacao.xp_movimentacoes m WHERE m.usuario_id = c.usuario_id), 0)`,
    )) as Array<{ n: number }>;
    console.log(
      `\ncarteiras incoerentes com o ledger: ${incoerentes}; contas fora do alvo: ${divergentes}`,
    );
  } finally {
    await ds.destroy();
  }
}

await principal();
