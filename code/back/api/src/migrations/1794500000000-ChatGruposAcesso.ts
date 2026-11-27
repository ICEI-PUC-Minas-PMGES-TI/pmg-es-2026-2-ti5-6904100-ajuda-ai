import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ChatGruposAcesso1794500000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    const s = `"${((qr.connection.options as { schema?: string }).schema ?? 'feed').replaceAll('"', '""')}"`;
    await qr.query(
      `ALTER TABLE ${s}.chats ADD COLUMN tipo VARCHAR(20) NOT NULL DEFAULT 'legado', ADD COLUMN grupo_id INTEGER REFERENCES ${s}.matching_grupos(id) ON DELETE RESTRICT, ADD COLUMN revisao INTEGER NOT NULL DEFAULT 0`,
    );
    await qr.query(
      `CREATE UNIQUE INDEX uq_chat_grupo ON ${s}.chats(grupo_id) WHERE grupo_id IS NOT NULL`,
    );
    await qr.query(
      `ALTER TABLE ${s}.mensagens_chat ADD COLUMN client_id UUID, ADD COLUMN remetente_nome VARCHAR(160)`,
    );
    await qr.query(
      `CREATE UNIQUE INDEX uq_chat_mensagem_cliente ON ${s}.mensagens_chat(chat_id,remetente_participacao_id,client_id) WHERE client_id IS NOT NULL`,
    );
    await qr.query(`CREATE TABLE ${s}.chat_periodos (
      id SERIAL PRIMARY KEY, chat_id INTEGER NOT NULL REFERENCES ${s}.chats(id) ON DELETE RESTRICT,
      participacao_id INTEGER NOT NULL REFERENCES ${s}.participacoes(id) ON DELETE RESTRICT,
      apos_mensagem_id INTEGER NOT NULL DEFAULT 0, ate_mensagem_id INTEGER,
      entrou_em TIMESTAMPTZ NOT NULL DEFAULT now(), saiu_em TIMESTAMPTZ,
      CONSTRAINT ck_chat_periodo_limites CHECK (apos_mensagem_id>=0 AND (ate_mensagem_id IS NULL OR ate_mensagem_id>=apos_mensagem_id)),
      CONSTRAINT ck_chat_periodo_saida CHECK ((ate_mensagem_id IS NULL)=(saiu_em IS NULL))
    )`);
    await qr.query(
      `CREATE UNIQUE INDEX uq_chat_periodo_aberto ON ${s}.chat_periodos(chat_id,participacao_id) WHERE ate_mensagem_id IS NULL`,
    );
    await qr.query(
      `CREATE INDEX idx_chat_periodo_pessoa ON ${s}.chat_periodos(participacao_id,chat_id)`,
    );
    await qr.query(`CREATE TABLE ${s}.chat_destinatarios (
      id SERIAL PRIMARY KEY, chat_id INTEGER NOT NULL REFERENCES ${s}.chats(id) ON DELETE RESTRICT,
      mensagem_id INTEGER NOT NULL REFERENCES ${s}.mensagens_chat(id) ON DELETE RESTRICT,
      participacao_id INTEGER NOT NULL REFERENCES ${s}.participacoes(id) ON DELETE RESTRICT,
      entregue_em TIMESTAMPTZ, lida_em TIMESTAMPTZ,
      CONSTRAINT uq_chat_destinatario UNIQUE(mensagem_id,participacao_id)
    )`);
    await qr.query(
      `CREATE INDEX idx_chat_destinatario_pessoa ON ${s}.chat_destinatarios(participacao_id,mensagem_id)`,
    );
    await qr.query(
      `CREATE INDEX idx_chat_destinatario_pendente ON ${s}.chat_destinatarios(chat_id,participacao_id) WHERE lida_em IS NULL`,
    );
    // Só vinculação canônica coerente autoriza a importação do privado.
    // O legado desativava o chat ao encerrar o vínculo. O registro volta a ser
    // consultável; os períodos abaixo continuam impedindo novos envios e acesso futuro.
    await qr.query(`UPDATE ${s}.chats c SET tipo='privado',ativo=true FROM ${s}.matching_vinculos v, ${s}.programas ciclo, ${s}.participacoes p, ${s}.participacoes a
      WHERE c.matching_vinculo_id=v.id AND c.programa_id=v.programa_id AND ciclo.id=v.programa_id
      AND p.id=v.padrinho_participacao_id AND a.id=v.apadrinhado_participacao_id
      AND p.programa=ciclo.codigo AND a.programa=ciclo.codigo AND p.usuario_id<>a.usuario_id`);
    await qr.query(`INSERT INTO ${s}.chats(programa_id,matching_vinculo_id,tipo,ativo)
      SELECT v.programa_id,v.id,'privado',true FROM ${s}.matching_vinculos v
      JOIN ${s}.programas ciclo ON ciclo.id=v.programa_id JOIN ${s}.participacoes p ON p.id=v.padrinho_participacao_id JOIN ${s}.participacoes a ON a.id=v.apadrinhado_participacao_id
      WHERE v.ativo AND v.grupo_id IS NOT NULL AND p.programa=ciclo.codigo AND a.programa=ciclo.codigo AND p.usuario_id<>a.usuario_id
      AND p.papel='padrinho' AND a.papel='apadrinhado' AND p.status='em_andamento' AND a.status='em_andamento'
      AND NOT EXISTS(SELECT 1 FROM ${s}.chats c WHERE c.matching_vinculo_id=v.id)`);
    await qr.query(`INSERT INTO ${s}.chat_participantes(chat_id,participacao_id)
      SELECT c.id,pares.participacao_id FROM ${s}.chats c JOIN ${s}.matching_vinculos v ON v.id=c.matching_vinculo_id
      CROSS JOIN LATERAL (VALUES(v.padrinho_participacao_id),(v.apadrinhado_participacao_id)) pares(participacao_id)
      WHERE c.tipo='privado' ON CONFLICT(chat_id,participacao_id) DO NOTHING`);
    await qr.query(`INSERT INTO ${s}.chat_periodos(chat_id,participacao_id,apos_mensagem_id,ate_mensagem_id,entrou_em,saiu_em)
      SELECT c.id,pares.participacao_id,0,
        CASE WHEN v.ativo AND ciclo.etapa_atual IN ('formacao','andamento') THEN NULL ELSE COALESCE((SELECT max(m.id) FROM ${s}.mensagens_chat m WHERE m.chat_id=c.id AND (v.encerrado_em IS NULL OR m.criada_em<=v.encerrado_em)),0) END,
        c.criado_em, CASE WHEN v.ativo AND ciclo.etapa_atual IN ('formacao','andamento') THEN NULL ELSE COALESCE(v.encerrado_em,now()) END
      FROM ${s}.chats c JOIN ${s}.matching_vinculos v ON v.id=c.matching_vinculo_id JOIN ${s}.programas ciclo ON ciclo.id=v.programa_id
      CROSS JOIN LATERAL (VALUES(v.padrinho_participacao_id),(v.apadrinhado_participacao_id)) pares(participacao_id)
      WHERE c.tipo='privado'`);
    // O estado global anterior é migrado apenas para privados, com o destinatário correto.
    await qr.query(`INSERT INTO ${s}.chat_destinatarios(chat_id,mensagem_id,participacao_id,entregue_em,lida_em)
      SELECT m.chat_id,m.id,p.participacao_id,m.entregue_em,m.lida_em FROM ${s}.mensagens_chat m
      JOIN ${s}.chats c ON c.id=m.chat_id JOIN ${s}.chat_periodos p ON p.chat_id=c.id
      WHERE c.tipo='privado' AND p.participacao_id<>m.remetente_participacao_id
      AND m.id>p.apos_mensagem_id AND (p.ate_mensagem_id IS NULL OR m.id<=p.ate_mensagem_id)`);
    await qr.query(`INSERT INTO ${s}.chats(programa_id,grupo_id,tipo,titulo,ativo)
      SELECT g.programa_id,g.id,'coletivo',g.nome,true FROM ${s}.matching_grupos g JOIN ${s}.programas ciclo ON ciclo.id=g.programa_id
      WHERE ciclo.etapa_atual IN ('formacao','andamento') AND NOT ciclo.inscricoes_abertas
      AND EXISTS(SELECT 1 FROM ${s}.matching_vinculos v JOIN ${s}.participacoes p ON p.id=v.padrinho_participacao_id JOIN ${s}.participacoes a ON a.id=v.apadrinhado_participacao_id
        WHERE v.grupo_id=g.id AND v.ativo AND p.id=g.padrinho_participacao_id AND p.programa=ciclo.codigo AND a.programa=ciclo.codigo AND p.usuario_id<>a.usuario_id AND p.papel='padrinho' AND a.papel='apadrinhado' AND p.status='em_andamento' AND a.status='em_andamento' AND p.termino_em IS NULL AND a.termino_em IS NULL)`);
    await qr.query(`INSERT INTO ${s}.chat_participantes(chat_id,participacao_id)
      SELECT DISTINCT c.id,pares.participacao_id FROM ${s}.chats c JOIN ${s}.matching_grupos g ON g.id=c.grupo_id JOIN ${s}.programas ciclo ON ciclo.id=c.programa_id
      JOIN ${s}.matching_vinculos v ON v.grupo_id=g.id AND v.ativo JOIN ${s}.participacoes p ON p.id=v.padrinho_participacao_id JOIN ${s}.participacoes a ON a.id=v.apadrinhado_participacao_id
      CROSS JOIN LATERAL (VALUES(p.id),(a.id)) pares(participacao_id)
      WHERE c.tipo='coletivo' AND p.id=g.padrinho_participacao_id AND p.programa=ciclo.codigo AND a.programa=ciclo.codigo AND p.usuario_id<>a.usuario_id
      AND p.papel='padrinho' AND a.papel='apadrinhado' AND p.status='em_andamento' AND a.status='em_andamento' AND p.termino_em IS NULL AND a.termino_em IS NULL
      ON CONFLICT(chat_id,participacao_id) DO NOTHING`);
    await qr.query(`INSERT INTO ${s}.chat_periodos(chat_id,participacao_id,apos_mensagem_id,entrou_em)
      SELECT m.chat_id,m.participacao_id,0,now() FROM ${s}.chat_participantes m JOIN ${s}.chats c ON c.id=m.chat_id WHERE c.tipo='coletivo'`);
    await qr.query(
      `ALTER TABLE ${s}.chats ADD CONSTRAINT ck_chat_tipo_origem CHECK (tipo='legado' OR (tipo='privado' AND matching_vinculo_id IS NOT NULL AND grupo_id IS NULL) OR (tipo='coletivo' AND grupo_id IS NOT NULL AND matching_vinculo_id IS NULL))`,
    );
    await qr.query(
      `CREATE TABLE ${s}.chat_conciliacao AS SELECT id AS chat_id,programa_id,matching_vinculo_id,titulo,'Sem origem canônica validada; nenhum acesso foi concedido por nome ou JWT.'::text AS motivo FROM ${s}.chats WHERE tipo='legado'`,
    );
  }

  async down(_qr: QueryRunner): Promise<void> {
    throw new Error(
      'Reversão exige backup e plano de recuperação: períodos e recibos não podem ser apagados automaticamente.',
    );
  }
}
