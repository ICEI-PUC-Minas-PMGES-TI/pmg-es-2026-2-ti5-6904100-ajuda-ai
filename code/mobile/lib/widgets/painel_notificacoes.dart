import 'package:flutter/material.dart';

import '../models/notificacao.dart';
import '../models/situacao_participacao.dart';
import '../services/lojinha_api.dart';
import '../services/notificacoes_api.dart';
import '../sessao_usuario.dart';
import '../status_participacao.dart';
import '../tela_padrinho_definido.dart';
import '../tela_resgates.dart';
import '../tela_status_candidatura.dart';
import '../theme/colors.dart';
import 'app_bottom_navigation.dart';
import 'navegacao_app.dart';

/// Notificações usadas quando a API de avisos não responde.
const avisosOffline = [
  Aviso(
    titulo: 'Cadastro recebido',
    descricao:
        'Seu cadastro foi registrado. Avisaremos por aqui quando o seu '
        'padrinho for definido.',
  ),
  Aviso(
    titulo: 'Materiais de apoio',
    descricao: 'Consulte o guia do calouro no feed do campus.',
  ),
];

/// Aba do app para o link da notificação. `/dupla` cai no Início, onde o
/// padrinho vê os apadrinhados; o apadrinhado abre a tela do padrinho.
AppDestination? abaDaNotificacao(String? link) => switch (link) {
  '/missoes' => AppDestination.missoes,
  '/perfil' => AppDestination.perfil,
  '/dupla' => AppDestination.inicio,
  _ => null,
};

class _Notificacao {
  const _Notificacao({
    required this.aviso,
    this.icone = Icons.campaign_outlined,
    this.destaque = false,
    this.vinculo = false,
    this.onTap,
  });

  final Aviso aviso;
  final IconData icone;
  final bool destaque;

  /// Cartão local do padrinho definido; some quando o aviso da API chega.
  final bool vinculo;
  final VoidCallback? onTap;
}

/// Abre o painel de notificações (bottom sheet) para o [publico]
/// (`apadrinhados` ou `padrinhos`) usando `GET /avisos`.
Future<void> mostrarNotificacoes(
  BuildContext context, {
  String publico = 'apadrinhados',
}) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    builder: (_) => _PainelNotificacoes(publico: publico, contextoPai: context),
  );
}

class _PainelNotificacoes extends StatefulWidget {
  const _PainelNotificacoes({required this.publico, required this.contextoPai});

  final String publico;
  final BuildContext contextoPai;

  @override
  State<_PainelNotificacoes> createState() => _PainelNotificacoesState();
}

class _PainelNotificacoesState extends State<_PainelNotificacoes> {
  late final Future<List<_Notificacao>> _carregamento = Future(_carregar);
  bool _offline = false;

  @override
  void initState() {
    super.initState();
    Future.microtask(CentralNotificacoes.atual.atualizar);
  }

  Future<List<_Notificacao>> _carregar() async {
    final sessao = SessaoUsuario.atual;
    await sessao.sincronizarSituacao();
    List<Aviso> avisos;
    try {
      avisos = await sessao.participacoesApi.avisos(widget.publico);
    } catch (_) {
      _offline = true;
      avisos = avisosOffline;
    }

    final padrinho = sessao.padrinho;
    return [
      if (sessao.status == StatusParticipacao.apadrinhadoAtivo)
        _Notificacao(
          aviso: Aviso(
            titulo: 'Seu padrinho foi definido!',
            descricao: padrinho == null
                ? 'Toque para conhecer seu padrinho.'
                : '${padrinho.nome} é o seu padrinho'
                      '${sessao.grupo == null ? '' : ' no ${sessao.grupo}'}. '
                      'Toque para conhecer.',
          ),
          icone: Icons.handshake_outlined,
          destaque: true,
          vinculo: true,
          onTap: _abrirPadrinho,
        ),
      for (final aviso in avisos) _Notificacao(aviso: aviso),
    ];
  }

  void _abrir(Notificacao notificacao) {
    CentralNotificacoes.atual.marcarLida(notificacao.id);
    final pai = widget.contextoPai;
    final link = notificacao.link;
    if (link == '/dupla' &&
        SessaoUsuario.atual.status == StatusParticipacao.apadrinhadoAtivo) {
      _abrirPadrinho();
      return;
    }
    if (link == '/candidatura') {
      Navigator.of(context).pop();
      if (pai.mounted) {
        Navigator.of(pai).push(
          MaterialPageRoute(builder: (_) => const StatusCandidaturaPage()),
        );
      }
      return;
    }
    final aba = abaDaNotificacao(link);
    if (aba != null && SessaoUsuario.atual.destinos.contains(aba)) {
      Navigator.of(context).pop();
      if (pai.mounted) {
        navegarDestino(
          pai,
          aba,
          atual: AppShell.of(pai)?.atual ?? AppDestination.inicio,
        );
      }
      return;
    }
    if (notificacao.link?.startsWith('/lojinha/resgates') == true) {
      Navigator.of(context).pop();
      if (pai.mounted) {
        Navigator.of(pai).push(
          MaterialPageRoute(
            builder: (_) => TelaMeusResgates(api: LojinhaApi()),
          ),
        );
      }
    }
  }

  void _abrirPadrinho() {
    Navigator.of(context).pop();
    Navigator.of(widget.contextoPai)
        .push(MaterialPageRoute(builder: (_) => const PadrinhoDefinidoPage()));
  }

  String _data(DateTime data) =>
      '${data.day.toString().padLeft(2, '0')}/'
      '${data.month.toString().padLeft(2, '0')}/${data.year}';

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.75,
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ValueListenableBuilder<Notificacoes>(
                valueListenable: CentralNotificacoes.atual.estado,
                builder: (context, dados, _) => Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Notificações',
                        style: TextStyle(
                          color: AppColors.ink,
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    if (dados.naoLidas > 0)
                      TextButton(
                        key: const Key('notificacoes-marcar-todas'),
                        onPressed: CentralNotificacoes.atual.marcarTodas,
                        child: const Text(
                          'Marcar todas como lidas',
                          style: TextStyle(
                            fontFamily: 'Inter',
                            color: AppColors.primary,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              Flexible(
                child: FutureBuilder<List<_Notificacao>>(
                  future: _carregamento,
                  builder: (context, snapshot) {
                    if (!snapshot.hasData) {
                      return const Padding(
                        padding: EdgeInsets.all(32),
                        child: Center(
                          child: CircularProgressIndicator(
                            color: AppColors.primary,
                          ),
                        ),
                      );
                    }
                    final itens = snapshot.data!;
                    return ListView(
                      shrinkWrap: true,
                      children: [
                        ValueListenableBuilder<Notificacoes>(
                          valueListenable: CentralNotificacoes.atual.estado,
                          builder: (context, dados, _) => Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              for (final n in dados.itens)
                                _ItemNotificacao(
                                  notificacao: n,
                                  onTap: () => _abrir(n),
                                ),
                              if (dados.temMais)
                                TextButton(
                                  key: const Key('notificacoes-carregar-mais'),
                                  onPressed:
                                      CentralNotificacoes.atual.carregarMais,
                                  child: const Text(
                                    'Ver notificações anteriores',
                                    style: TextStyle(
                                      fontFamily: 'Inter',
                                      color: AppColors.primary,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                              if (dados.itens.isEmpty && itens.isEmpty)
                                const Padding(
                                  key: Key('notificacoes-vazio'),
                                  padding: EdgeInsets.symmetric(vertical: 24),
                                  child: Text(
                                    'Nenhuma notificação por enquanto.',
                                    style: TextStyle(color: AppColors.muted),
                                  ),
                                ),
                            ],
                          ),
                        ),
                        if (_offline)
                          const Padding(
                            padding: EdgeInsets.only(bottom: 8),
                            child: Text(
                              'Sem conexão: mostrando avisos salvos.',
                              style: TextStyle(
                                fontFamily: 'Inter',
                                color: AppColors.muted,
                                fontSize: 12,
                              ),
                            ),
                          ),
                        ValueListenableBuilder<Notificacoes>(
                          valueListenable: CentralNotificacoes.atual.estado,
                          builder: (context, dados, _) {
                            // O aviso do vínculo já veio da API: não repete o cartão local.
                            final temVinculo = dados.itens.any(
                              (n) => n.tipo == 'VINCULO_CONFIRMADO',
                            );
                            return Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                for (final item in itens)
                                  if (!(item.vinculo && temVinculo))
                                    Padding(
                                      padding: const EdgeInsets.only(bottom: 8),
                                      child: Material(
                                        color: item.destaque
                                            ? AppAccents.successBg
                                            : AppAccents.cardBg,
                                        clipBehavior: Clip.antiAlias,
                                        shape: RoundedRectangleBorder(
                                          borderRadius: BorderRadius.circular(
                                            12,
                                          ),
                                          side: BorderSide(
                                            color: item.destaque
                                                ? AppAccents.success.withValues(
                                                    alpha: 0.3,
                                                  )
                                                : AppAccents.cardBorder,
                                          ),
                                        ),
                                        child: ListTile(
                                          onTap: item.onTap,
                                          leading: Icon(
                                            item.icone,
                                            color: item.destaque
                                                ? AppAccents.success
                                                : AppColors.primary,
                                          ),
                                          title: Text(
                                            item.aviso.titulo,
                                            style: const TextStyle(
                                              fontFamily: 'Inter',
                                              color: AppColors.ink,
                                              fontSize: 14,
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                          subtitle: Text(
                                            [
                                              item.aviso.descricao,
                                              if (item.aviso.data != null)
                                                _data(item.aviso.data!),
                                            ].join('\n'),
                                            style: const TextStyle(
                                              fontFamily: 'Inter',
                                              color: AppColors.muted,
                                              fontSize: 12,
                                              height: 1.35,
                                            ),
                                          ),
                                          trailing: item.onTap == null
                                              ? null
                                              : const Icon(
                                                  Icons.chevron_right,
                                                  color: AppColors.muted,
                                                ),
                                        ),
                                      ),
                                    ),
                              ],
                            );
                          },
                        ),
                      ],
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ItemNotificacao extends StatelessWidget {
  const _ItemNotificacao({required this.notificacao, required this.onTap});

  final Notificacao notificacao;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final (icone, fundo, cor) = switch (notificacao.tipo) {
      'MISSAO_NOVA' => (
        Icons.hexagon_outlined,
        AppAccents.tileLilas,
        AppColors.primary,
      ),
      'NIVEL_SUBIU' => (
        Icons.emoji_events_outlined,
        AppAccents.tileVerde,
        AppAccents.iconeVerde,
      ),
      'RESGATE_ENTREGUE' => (
        Icons.card_giftcard_rounded,
        AppAccents.tileLaranja,
        AppAccents.iconeLaranja,
      ),
      'RESGATE_CANCELADO' => (
        Icons.undo_rounded,
        AppAccents.tileLaranja,
        AppAccents.iconeLaranja,
      ),
      'CANDIDATURA_APROVADA' => (
        Icons.verified_outlined,
        AppAccents.tileVerde,
        AppAccents.iconeVerde,
      ),
      'CANDIDATURA_NAO_APROVADA' => (
        Icons.info_outline_rounded,
        AppAccents.tileAzul,
        AppAccents.iconeAzul,
      ),
      'VINCULO_CONFIRMADO' => (
        Icons.handshake_outlined,
        AppAccents.tileVerde,
        AppAccents.iconeVerde,
      ),
      _ => (
        Icons.notifications_none_rounded,
        AppAccents.tileAzul,
        AppAccents.iconeAzul,
      ),
    };
    final naoLida = !notificacao.lida;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: naoLida ? AppColors.lavender : Colors.white,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          key: Key('notificacao-${notificacao.id}'),
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: fundo,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(icone, color: cor),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        notificacao.titulo,
                        style: const TextStyle(
                          fontFamily: 'Inter',
                          color: AppColors.ink,
                          fontSize: 14.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        notificacao.mensagem,
                        style: const TextStyle(
                          fontFamily: 'Inter',
                          color: AppColors.muted,
                          fontSize: 13,
                          height: 1.35,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        tempoRelativo(notificacao.criadoEm),
                        style: const TextStyle(
                          fontFamily: 'Inter',
                          color: AppColors.muted,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                if (naoLida)
                  Semantics(
                    label: 'Não lida',
                    child: Container(
                      key: Key('notificacao-nao-lida-${notificacao.id}'),
                      width: 8,
                      height: 8,
                      margin: const EdgeInsets.only(top: 6, left: 8),
                      decoration: const BoxDecoration(
                        color: AppColors.primary,
                        shape: BoxShape.circle,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
