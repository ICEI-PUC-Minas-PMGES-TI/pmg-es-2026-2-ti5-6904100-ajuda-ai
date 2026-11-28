import { randomUUID } from 'node:crypto';
import { vi, afterEach } from 'vitest';
import { cenarioMatching } from '../../test/helpers/matching-cenario.js';

const autor = 'coord@pucminas.edu.br';
const cenario = (alunos = 3) =>
  cenarioMatching({ chatReal: true, padrinhos: 2, alunos });
const email = (c: ReturnType<typeof cenario>, id: number) =>
  c.participantes.find((p) => p.id === id)!.usuarioId;
const grupo = (c: ReturnType<typeof cenario>, padrinho = 1) =>
  c.conversas.find(
    (chat) =>
      chat.tipo === 'coletivo' &&
      chat.grupoId ===
        c.grupos.find((g) => g.padrinhoParticipacaoId === padrinho)!.id,
  )!;
const privado = (c: ReturnType<typeof cenario>, aluno = 100) =>
  c.conversas.find(
    (chat) =>
      chat.matchingVinculoId ===
      c.vinculos.find((v) => v.apadrinhadoParticipacaoId === aluno)!.id,
  )!;
const enviar = (
  c: ReturnType<typeof cenario>,
  chat: number,
  autorId: number,
  texto: string,
) => c.servicoChat.enviarMensagem(chat, email(c, autorId), texto, randomUUID());
afterEach(() => vi.useRealTimers());

describe('Chat integrado ao domínio de vínculos', () => {
  it('recibos de mensagens antigas avançam por revisão, sem repetir o histórico', async () => {
    const c = cenario();
    await c.operacoes.vincular(100, 1, autor);
    await c.operacoes.vincular(101, 1, autor);
    const chat = grupo(c).id;
    const m = await enviar(c, chat, 1, 'Mensagem antiga');
    await c.servicoChat.listarMensagens(chat, email(c, 100));
    const a = await c.servicoChat.listarRecibos(chat, email(c, 1), 0, m.id);
    expect(a.recibos).toEqual([
      expect.objectContaining({
        id: m.id,
        recibos: { total: 2, entregues: 1, lidas: 1 },
      }),
    ]);
    expect(a.recibos[0]).not.toHaveProperty('texto');
    expect(
      (
        await c.servicoChat.listarRecibos(
          chat,
          email(c, 1),
          a.recibosRevisao,
          m.id,
        )
      ).recibos,
    ).toEqual([]);
    await c.servicoChat.listarMensagens(chat, email(c, 101));
    const b = await c.servicoChat.listarRecibos(
      chat,
      email(c, 1),
      a.recibosRevisao,
      m.id,
    );
    expect(b.recibos[0].recibos.lidas).toBe(2);
    expect(b.recibosRevisao).toBeGreaterThan(a.recibosRevisao);
    await expect(
      c.servicoChat.listarRecibos(chat, 'fora@teste.local', 0, m.id),
    ).rejects.toThrow(/encontrada/);
  });

  it('entrega atrasada não apaga a leitura confirmada em outra sessão', async () => {
    const c = cenario();
    await c.operacoes.vincular(100, 1, autor);
    const chat = privado(c).id;
    await enviar(c, chat, 1, 'Leitura concorrente');
    const repo = c.repos.ChatDestinatarioEntity,
      buscar = repo.find.bind(repo);
    const leituraConfirmada = new Date();
    let simular = true;
    vi.spyOn(repo, 'find').mockImplementation(async (opcoes: any) => {
      const copia = structuredClone(await buscar(opcoes));
      if (simular && opcoes?.where?.chatId === chat && !opcoes.where.lidaEm) {
        simular = false;
        c.recibos[0].lidaEm = leituraConfirmada;
        c.recibos[0].entregueEm = leituraConfirmada;
      }
      return copia;
    });
    const lista = await c.servicoChat.listar(email(c, 100));
    expect(c.recibos[0].lidaEm).toEqual(leituraConfirmada);
    expect(lista.find((c) => c.id === chat)?.naoLidas).toBe(0);
  });
  it('cria privado e coletivo na mesma transação, sem duplicar ao entrar outro aluno', async () => {
    const c = cenario();
    await c.operacoes.vincular(100, 1, autor);
    await c.operacoes.vincular(101, 1, autor);
    await c.operacoes.vincular(100, 1, autor);
    expect(c.conversas.filter((c) => c.tipo === 'privado')).toHaveLength(2);
    expect(c.conversas.filter((c) => c.tipo === 'coletivo')).toHaveLength(1);
    expect(
      c.periodos.filter(
        (p) => p.chatId === grupo(c).id && p.ateMensagemId == null,
      ),
    ).toHaveLength(3);
    expect(
      (await c.servicoChat.listar(email(c, 100), '2026/2'))
        .map((c) => c.tipo)
        .sort(),
    ).toEqual(['coletivo', 'privado']);
  });
  it('não cria conversa para vínculo inexistente, inativo ou participantes inelegíveis', async () => {
    const c = cenario();
    await expect(
      c.servicoChat.criarParaVinculo(c.dados.manager, 999),
    ).rejects.toThrow(/não encontrado/);
    await c.operacoes.vincular(100, 1, autor);
    c.vinculos[0].ativo = false;
    await expect(
      c.servicoChat.criarParaVinculo(c.dados.manager, c.vinculos[0].id),
    ).rejects.toThrow(/não encontrado/);
    c.vinculos[0].ativo = true;
    c.participantes[0].status = 'nao_aprovado';
    await expect(
      c.servicoChat.criarParaVinculo(c.dados.manager, c.vinculos[0].id),
    ).rejects.toThrow(/ativos/);
  });
  it('falha ao criar o coletivo desfaz privado, vínculo e períodos de acesso', async () => {
    const c = cenario();
    const repo = c.repos.ChatEntity,
      save = repo.save.bind(repo);
    vi.spyOn(repo, 'save').mockImplementation((async (v: any) => {
      if (v.tipo === 'coletivo') throw new Error('Falha coletivo');
      return save(v);
    }) as any);
    await expect(c.operacoes.vincular(100, 1, autor)).rejects.toThrow(
      /coletivo/,
    );
    expect(c.vinculos).toHaveLength(0);
    expect(c.conversas).toHaveLength(0);
    expect(c.periodos).toHaveLength(0);
  });
  it('pessoa que entra não recebe o histórico anterior do coletivo', async () => {
    const c = cenario();
    await c.operacoes.vincular(100, 1, autor);
    const chat = grupo(c).id;
    await enviar(c, chat, 1, 'Antes da entrada');
    await c.operacoes.vincular(101, 1, autor);
    expect(
      (await c.servicoChat.listarMensagens(chat, email(c, 101))).mensagens,
    ).toEqual([]);
    await enviar(c, chat, 100, 'Depois da entrada');
    expect(
      (await c.servicoChat.listarMensagens(chat, email(c, 101))).mensagens.map(
        (m) => m.texto,
      ),
    ).toEqual(['Depois da entrada']);
  });
  it('transferência corta mensagens novas e preserva apenas o histórico permitido', async () => {
    const c = cenario();
    await c.operacoes.vincular(100, 1, autor);
    await c.operacoes.vincular(101, 1, autor);
    const origem = grupo(c).id,
      privadoOrigem = privado(c).id;
    await enviar(c, origem, 1, 'Antes da saída');
    await enviar(c, privadoOrigem, 100, 'Privado anterior');
    await c.operacoes.transferir(
      c.vinculos.find((v) => v.apadrinhadoParticipacaoId === 100)!.id,
      {
        padrinhoDestinoId: 2,
        motivo: 'Acompanhamento',
        operacaoId: randomUUID(),
      },
      autor,
    );
    await enviar(c, origem, 101, 'Mensagem futura do grupo anterior');
    expect(
      (
        await c.servicoChat.listarMensagens(origem, email(c, 100))
      ).mensagens.map((m) => m.texto),
    ).toEqual(['Antes da saída']);
    expect(
      (await c.servicoChat.listarMensagens(privadoOrigem, email(c, 100)))
        .podeEnviar,
    ).toBe(false);
    await expect(
      enviar(c, privadoOrigem, 100, 'Não permitido'),
    ).rejects.toThrow(/encerrada/);
    expect(
      (await c.servicoChat.listar(email(c, 100))).filter((c) => c.podeEnviar),
    ).toHaveLength(2);
    expect(
      await c.servicoChat.buscarParticipantes(origem, email(c, 100)),
    ).toEqual([]);
  });
  it('voltar ao grupo preserva os períodos anteriores e não abre o intervalo ausente', async () => {
    const c = cenario();
    await c.operacoes.vincular(100, 1, autor);
    await c.operacoes.vincular(101, 1, autor);
    const chat = grupo(c).id;
    await enviar(c, chat, 1, 'Primeiro período');
    const mov = await c.operacoes.transferir(
      c.vinculos[0].id,
      { padrinhoDestinoId: 2, motivo: 'Mudança', operacaoId: randomUUID() },
      autor,
    );
    await enviar(c, chat, 101, 'Intervalo ausente');
    await c.operacoes.transferir(
      mov.destino.id,
      { padrinhoDestinoId: 1, motivo: 'Retorno', operacaoId: randomUUID() },
      autor,
    );
    await enviar(c, chat, 1, 'Segundo período');
    expect(
      (await c.servicoChat.listarMensagens(chat, email(c, 100))).mensagens.map(
        (m) => m.texto,
      ),
    ).toEqual(['Primeiro período', 'Segundo período']);
    expect(
      c.periodos.filter((p) => p.chatId === chat && p.participacaoId === 100),
    ).toHaveLength(2);
  });
  it('revogação de status tira o acesso mesmo com JWT e cadastro de membro antigos', async () => {
    const c = cenario();
    await c.operacoes.vincular(100, 1, autor);
    c.participantes.find((p) => p.id === 100)!.status = 'nao_aprovado';
    await expect(
      c.servicoChat.listarMensagens(grupo(c).id, email(c, 100)),
    ).rejects.toThrow(/não encontrada/);
    await expect(enviar(c, privado(c).id, 100, 'Negado')).rejects.toThrow(
      /não encontrada/,
    );
    expect(await c.servicoChat.listar(email(c, 100))).toEqual([]);
  });
  it('ciclo encerrado mantém consulta e impede novos envios', async () => {
    const c = cenario();
    await c.operacoes.vincular(100, 1, autor);
    await enviar(c, grupo(c).id, 1, 'Registro do ciclo');
    c.programas[0].etapaAtual = 'encerramento';
    const resposta = await c.servicoChat.listarMensagens(
      grupo(c).id,
      email(c, 100),
    );
    expect(resposta.mensagens).toHaveLength(1);
    expect(resposta.podeEnviar).toBe(false);
    c.participantes.forEach((p) => {
      if (p.papel === 'padrinho' || p.papel === 'apadrinhado')
        p.status = 'concluido';
    });
    expect(
      (await c.servicoChat.listarMensagens(grupo(c).id, email(c, 100)))
        .mensagens,
    ).toHaveLength(1);
    await expect(enviar(c, grupo(c).id, 100, 'Negado')).rejects.toThrow(
      /ciclo foi encerrado/,
    );
  });
  it('ler no coletivo só confirma o recibo de quem leu', async () => {
    const c = cenario();
    await c.operacoes.vincular(100, 1, autor);
    await c.operacoes.vincular(101, 1, autor);
    const chat = grupo(c).id;
    await enviar(c, chat, 1, 'Mensagem para duas pessoas');
    await c.servicoChat.listarMensagens(chat, email(c, 100));
    const m = (await c.servicoChat.listarMensagens(chat, email(c, 1)))
      .mensagens[0];
    expect(m.estado).not.toBe('lida');
    expect(m.recibos).toMatchObject({ total: 2, lidas: 1 });
    expect(
      (await c.servicoChat.listar(email(c, 101))).find((c) => c.id === chat)
        ?.naoLidas,
    ).toBe(1);
    await c.servicoChat.listarMensagens(chat, email(c, 101));
    expect(
      (await c.servicoChat.listarMensagens(chat, email(c, 1))).mensagens[0],
    ).toMatchObject({ estado: 'lida', recibos: { lidas: 2 } });
  });
  it('paginação não marca como lidas mensagens que não foram buscadas', async () => {
    const c = cenario();
    await c.operacoes.vincular(100, 1, autor);
    const chat = grupo(c).id;
    for (let i = 0; i < 55; i++) await enviar(c, chat, 1, `Mensagem ${i}`);
    const primeira = await c.servicoChat.listarMensagens(chat, email(c, 100));
    expect(primeira.mensagens).toHaveLength(50);
    expect(primeira.temMais).toBe(true);
    expect(
      c.recibos.filter((r) => r.chatId === chat && r.lidaEm == null),
    ).toHaveLength(5);
    const antiga = await c.servicoChat.listarMensagens(
      chat,
      email(c, 100),
      primeira.mensagens[0].id,
    );
    expect(antiga.mensagens).toHaveLength(5);
    expect(antiga.temMais).toBe(false);
  });
  it('recupera mensagens após cursor em páginas sem duplicação', async () => {
    const c = cenario();
    await c.operacoes.vincular(100, 1, autor);
    const chat = grupo(c).id;
    const marco = await enviar(c, chat, 1, 'Marco');
    for (let i = 0; i < 55; i++) await enviar(c, chat, 1, `Nova ${i}`);
    const a = await c.servicoChat.listarMensagens(
      chat,
      email(c, 100),
      undefined,
      marco.id,
    );
    const b = await c.servicoChat.listarMensagens(
      chat,
      email(c, 100),
      undefined,
      a.mensagens.at(-1)!.id,
    );
    expect(a.temMais).toBe(true);
    expect(b.temMais).toBe(false);
    expect(
      new Set([...a.mensagens, ...b.mensagens].map((m) => m.id)).size,
    ).toBe(55);
  });
  it('repetir o envio após timeout não duplica mensagem ou destinatários', async () => {
    const c = cenario();
    await c.operacoes.vincular(100, 1, autor);
    const chat = privado(c).id,
      id = randomUUID();
    const a = await c.servicoChat.enviarMensagem(
      chat,
      email(c, 100),
      'Mensagem',
      id,
    );
    const b = await c.servicoChat.enviarMensagem(
      chat,
      email(c, 100),
      'Mensagem',
      id,
    );
    expect(b.id).toBe(a.id);
    expect(c.mensagens).toHaveLength(1);
    expect(c.recibos).toHaveLength(1);
    await expect(
      c.servicoChat.enviarMensagem(chat, email(c, 100), 'Outra intenção', id),
    ).rejects.toThrow(/identificador/);
  });
  it('mensagens de outro grupo não aparecem por nome igual ou por ID conhecido', async () => {
    const c = cenario();
    await c.operacoes.vincular(100, 1, autor);
    await c.operacoes.vincular(101, 2, autor);
    c.grupos[1].nome = c.grupos[0].nome;
    await enviar(c, grupo(c, 2).id, 2, 'Reservado');
    await expect(
      c.servicoChat.listarMensagens(grupo(c, 2).id, email(c, 100)),
    ).rejects.toThrow(/não encontrada/);
    expect(await c.servicoChat.listar(email(c, 100), '2027/1')).toEqual([]);
  });
  it('cadastro de participante sem período de acesso não autoriza conversa', async () => {
    const c = cenario();
    await c.operacoes.vincular(100, 1, autor);
    c.membros.push({
      id: 999,
      chatId: grupo(c).id,
      participacaoId: 101,
    } as any);
    await expect(
      c.servicoChat.listarMensagens(grupo(c).id, email(c, 101)),
    ).rejects.toThrow(/não encontrada/);
  });
  it('intervalo aberto divergente não autoriza mensagens após encerramento externo do vínculo', async () => {
    const c = cenario();
    await c.operacoes.vincular(100, 1, autor);
    c.vinculos[0].ativo = false;
    c.mensagens.push({
      id: 1,
      chatId: grupo(c).id,
      remetenteParticipacaoId: 1,
      texto: 'Registro fora da participação',
    } as any);
    expect(
      (await c.servicoChat.listarMensagens(grupo(c).id, email(c, 100)))
        .mensagens,
    ).toEqual([]);
    expect(
      (await c.servicoChat.listarMensagens(grupo(c).id, email(c, 100)))
        .podeEnviar,
    ).toBe(false);
    c.programas[0].etapaAtual = 'encerramento';
    expect(
      (await c.servicoChat.listarMensagens(grupo(c).id, email(c, 100)))
        .mensagens,
    ).toEqual([]);
  });
  it('heartbeat revalida saída e encerra conexão já aberta sem enviar mensagens futuras', async () => {
    vi.useFakeTimers();
    const c = cenario();
    await c.operacoes.vincular(100, 1, autor);
    await c.operacoes.vincular(101, 1, autor);
    const chat = grupo(c).id,
      eventos: any[] = [];
    let encerrou = false;
    const stream = await c.servicoChat.observarMensagens(
      chat,
      email(c, 100),
      Date.now() + 60000,
    );
    const sub = stream.subscribe({
      next: (e) => eventos.push(e),
      complete: () => {
        encerrou = true;
      },
    });
    await vi.advanceTimersByTimeAsync(10);
    await c.operacoes.transferir(
      c.vinculos[0].id,
      { padrinhoDestinoId: 2, motivo: 'Mudança', operacaoId: randomUUID() },
      autor,
    );
    await enviar(c, chat, 101, 'Segredo posterior à saída');
    await vi.advanceTimersByTimeAsync(2100);
    expect(encerrou).toBe(true);
    expect(eventos.at(-1).type).toBe('chat.access');
    expect(JSON.stringify(eventos)).not.toContain('Segredo');
    sub.unsubscribe();
  });
  it('a conexão encerra quando o token expira e libera os timers', async () => {
    vi.useFakeTimers();
    const c = cenario();
    await c.operacoes.vincular(100, 1, autor);
    let encerrou = false;
    const stream = await c.servicoChat.observarMensagens(
      grupo(c).id,
      email(c, 100),
      Date.now() + 100,
    );
    stream.subscribe({
      complete: () => {
        encerrou = true;
      },
    });
    await vi.advanceTimersByTimeAsync(150);
    expect(encerrou).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('locks da conversa começam pelo programa, na mesma ordem do matching', async () => {
    const c = cenario();
    await c.operacoes.vincular(100, 1, autor);
    c.locks.length = 0;
    await enviar(c, grupo(c).id, 100, 'Ordem');
    expect(c.locks[1]).toBe('ProgramaEntity:pessimistic_write');
  });
  it('recusa texto vazio, excesso e cursores conflitantes', async () => {
    const c = cenario();
    await c.operacoes.vincular(100, 1, autor);
    const chat = grupo(c).id;
    await expect(enviar(c, chat, 1, '   ')).rejects.toThrow(/4000/);
    await expect(enviar(c, chat, 1, 'a'.repeat(4001))).rejects.toThrow(/4000/);
    await expect(
      c.servicoChat.listarMensagens(chat, email(c, 100), 1, 2),
    ).rejects.toThrow(/Cursor/);
  });
  it('envia imagens verificadas ao armazenamento privado e cria recibos', async () => {
    const c = cenario();
    await c.operacoes.vincular(100, 1, autor);
    const chat = grupo(c).id;
    const imagem = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const enviarBlob = vi.spyOn(c.armazenamento, 'enviar');

    const enviada = await c.servicoChat.enviarImagem(
      chat,
      email(c, 100),
      imagem,
    );

    expect(enviarBlob).toHaveBeenCalledWith(
      'chat',
      expect.stringMatching(new RegExp(`^chats/${chat}/.+\\.png$`)),
      imagem,
      'image/png',
      { cacheControl: 'private, no-store' },
    );
    expect(c.mensagens[0].imagemChave).toMatch(
      new RegExp(`^chat/chats/${chat}/.+\\.png$`),
    );
    expect(enviada.imagemUrl).toContain(`https://storage.test/chat/chats/${chat}/`);
    expect(enviada).not.toHaveProperty('imagemChave');
    expect(c.recibos).toHaveLength(1);
  });

  it('recusa conteúdo que não seja PNG, JPEG ou WebP antes do upload', async () => {
    const c = cenario();
    const enviarBlob = vi.spyOn(c.armazenamento, 'enviar');

    await expect(
      c.servicoChat.enviarImagem(1, email(c, 100), Buffer.from('not an image')),
    ).rejects.toThrow(/PNG, JPEG ou WebP/);
    expect(enviarBlob).not.toHaveBeenCalled();
  });
});
