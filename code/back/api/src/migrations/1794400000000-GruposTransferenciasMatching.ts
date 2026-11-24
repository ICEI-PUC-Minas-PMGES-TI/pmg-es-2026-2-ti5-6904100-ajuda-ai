import type { MigrationInterface, QueryRunner } from 'typeorm';

export class GruposTransferenciasMatching1794400000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    const s = `"${((qr.connection.options as { schema?: string }).schema ?? 'feed').replaceAll('"', '""')}"`;
    await qr.query(`CREATE TABLE ${s}.matching_grupos (
      id SERIAL PRIMARY KEY,
      programa_id INTEGER NOT NULL REFERENCES ${s}.programas(id) ON DELETE RESTRICT,
      padrinho_participacao_id INTEGER NOT NULL REFERENCES ${s}.participacoes(id) ON DELETE RESTRICT,
      nome VARCHAR(120) NOT NULL,
      nome_legado TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT uq_matching_grupo_padrinho_ciclo UNIQUE (programa_id, padrinho_participacao_id)
    )`);
    await qr.query(
      `ALTER TABLE ${s}.matching_vinculos ADD COLUMN grupo_id INTEGER REFERENCES ${s}.matching_grupos(id) ON DELETE RESTRICT`,
    );
    await qr.query(`CREATE TABLE ${s}.matching_vinculos_eventos (
      id SERIAL PRIMARY KEY, operacao_id UUID NOT NULL,
      programa_id INTEGER NOT NULL REFERENCES ${s}.programas(id) ON DELETE RESTRICT,
      acao VARCHAR(20) NOT NULL CHECK (acao IN ('criado','encerrado','transferido')),
      vinculo_origem_id INTEGER REFERENCES ${s}.matching_vinculos(id) ON DELETE RESTRICT,
      vinculo_destino_id INTEGER REFERENCES ${s}.matching_vinculos(id) ON DELETE RESTRICT,
      responsavel VARCHAR(120) NOT NULL, motivo TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT ck_matching_movimentacao_referencias CHECK ((acao = 'criado' AND vinculo_origem_id IS NULL AND vinculo_destino_id IS NOT NULL) OR (acao = 'encerrado' AND vinculo_origem_id IS NOT NULL AND vinculo_destino_id IS NULL) OR (acao = 'transferido' AND vinculo_origem_id IS NOT NULL AND vinculo_destino_id IS NOT NULL AND vinculo_origem_id <> vinculo_destino_id AND length(btrim(motivo)) > 0 AND motivo IS NOT NULL))
    )`);
    await qr.query(
      `CREATE UNIQUE INDEX uq_matching_vinculo_operacao ON ${s}.matching_vinculos_eventos(operacao_id)`,
    );
    await qr.query(
      `CREATE INDEX idx_matching_vinculo_evento_ciclo ON ${s}.matching_vinculos_eventos(programa_id,id)`,
    );
    // Relatório preserva a fotografia anterior à atualização das projeções.
    await qr.query(`CREATE TABLE ${s}.matching_grupos_conciliacao (
      id SERIAL PRIMARY KEY, tipo VARCHAR(40) NOT NULL, referencia_id INTEGER NOT NULL,
      dados JSONB NOT NULL, criada_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await qr.query(`INSERT INTO ${s}.matching_grupos_conciliacao(tipo, referencia_id, dados)
      SELECT 'projecao_legada', p.id, jsonb_build_object('programa',p.programa,'papel',p.papel,'status',p.status,'grupo',p.grupo,'apadrinhados',p.apadrinhados,
        'vinculos', COALESCE((SELECT jsonb_agg(v.id ORDER BY v.id) FROM ${s}.matching_vinculos v WHERE v.ativo AND (v.padrinho_participacao_id=p.id OR v.apadrinhado_participacao_id=p.id)), '[]'::jsonb))
      FROM ${s}.participacoes p WHERE NULLIF(btrim(p.grupo),'') IS NOT NULL OR EXISTS (SELECT 1 FROM ${s}.matching_vinculos v WHERE v.padrinho_participacao_id=p.id OR v.apadrinhado_participacao_id=p.id)`);
    await qr.query(`INSERT INTO ${s}.matching_grupos_conciliacao(tipo, referencia_id, dados)
      SELECT 'vinculo_fora_ciclo',v.id,to_jsonb(v) FROM ${s}.matching_vinculos v
      JOIN ${s}.programas c ON c.id=v.programa_id
      JOIN ${s}.participacoes p ON p.id=v.padrinho_participacao_id
      JOIN ${s}.participacoes a ON a.id=v.apadrinhado_participacao_id
      WHERE p.programa<>c.codigo OR a.programa<>c.codigo OR p.usuario_id=a.usuario_id`);
    await qr.query(`INSERT INTO ${s}.matching_grupos(programa_id,padrinho_participacao_id,nome,nome_legado)
      SELECT DISTINCT v.programa_id,p.id,'Grupo-'||p.id,p.grupo
      FROM ${s}.matching_vinculos v JOIN ${s}.programas c ON c.id=v.programa_id
      JOIN ${s}.participacoes p ON p.id=v.padrinho_participacao_id
      JOIN ${s}.participacoes a ON a.id=v.apadrinhado_participacao_id
      WHERE p.programa=c.codigo AND a.programa=c.codigo AND p.usuario_id<>a.usuario_id`);
    await qr.query(`UPDATE ${s}.matching_vinculos v SET grupo_id=g.id FROM ${s}.matching_grupos g, ${s}.programas c, ${s}.participacoes a, ${s}.participacoes p
      WHERE v.programa_id=g.programa_id AND v.padrinho_participacao_id=g.padrinho_participacao_id AND c.id=v.programa_id AND a.id=v.apadrinhado_participacao_id AND a.programa=c.codigo AND p.id=v.padrinho_participacao_id AND p.usuario_id<>a.usuario_id`);
    await qr.query(`UPDATE ${s}.participacoes p SET grupo=(SELECT g.nome FROM ${s}.matching_grupos g WHERE g.padrinho_participacao_id=p.id),
      apadrinhados=(SELECT count(DISTINCT v.apadrinhado_participacao_id) FROM ${s}.matching_vinculos v WHERE v.padrinho_participacao_id=p.id AND v.ativo AND v.grupo_id IS NOT NULL)
      WHERE p.papel IN ('padrinho','candidato') AND p.status IN ('em_andamento','aprovado') AND EXISTS (SELECT 1 FROM ${s}.matching_vinculos v WHERE v.padrinho_participacao_id=p.id AND v.grupo_id IS NOT NULL)`);
    await qr.query(
      `UPDATE ${s}.participacoes p SET papel='padrinho',status='em_andamento',inicio_em=COALESCE(p.inicio_em,(SELECT min(v.confirmado_em) FROM ${s}.matching_vinculos v WHERE v.padrinho_participacao_id=p.id AND v.ativo)) WHERE p.papel='candidato' AND p.status='aprovado' AND p.apadrinhados>0 AND EXISTS (SELECT 1 FROM ${s}.matching_grupos g WHERE g.padrinho_participacao_id=p.id)`,
    );
    await qr.query(`UPDATE ${s}.participacoes p SET papel='candidato',status='aprovado',grupo=NULL,inicio_em=NULL
      WHERE p.papel='padrinho' AND p.status='em_andamento' AND p.apadrinhados=0 AND EXISTS (SELECT 1 FROM ${s}.matching_grupos g WHERE g.padrinho_participacao_id=p.id)`);
    await qr.query(`UPDATE ${s}.participacoes a SET grupo=(SELECT CASE WHEN count(DISTINCT v.grupo_id)=1 THEN max(g.nome) ELSE NULL END
      FROM ${s}.matching_vinculos v JOIN ${s}.matching_grupos g ON g.id=v.grupo_id WHERE v.apadrinhado_participacao_id=a.id AND v.ativo)
      WHERE a.papel='apadrinhado' AND EXISTS (SELECT 1 FROM ${s}.matching_vinculos v WHERE v.apadrinhado_participacao_id=a.id AND v.grupo_id IS NOT NULL)`);
    // Não transforma strings de grupo em vínculos novos nem reativa vínculos encerrados.
  }

  async down(_qr: QueryRunner): Promise<void> {
    throw new Error(
      'Reversão exige recuperação planejada de backup: as projeções legadas e o histórico de movimentações não podem ser apagados automaticamente.',
    );
  }
}
