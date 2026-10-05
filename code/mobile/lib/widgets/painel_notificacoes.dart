import 'package:flutter/material.dart';

import '../models/situacao_participacao.dart';
import '../sessao_usuario.dart';
import '../status_participacao.dart';
import '../tela_padrinho_definido.dart';
import '../theme/colors.dart';

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

class _Notificacao {
  const _Notificacao({
    required this.aviso,
    this.icone = Icons.campaign_outlined,
    this.destaque = false,
    this.onTap,
  });

  final Aviso aviso;
  final IconData icone;
  final bool destaque;
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
  late final Future<List<_Notificacao>> _carregamento = _carregar();
  bool _offline = false;

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
          onTap: _abrirPadrinho,
        ),
      for (final aviso in avisos) _Notificacao(aviso: aviso),
    ];
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
              const Text(
                'Notificações',
                style: TextStyle(
                  color: AppColors.ink,
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
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
                        if (itens.isEmpty)
                          const Padding(
                            padding: EdgeInsets.symmetric(vertical: 24),
                            child: Text(
                              'Nenhuma notificação por enquanto.',
                              style: TextStyle(color: AppColors.muted),
                            ),
                          ),
                        for (final item in itens)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: Material(
                              color: item.destaque
                                  ? AppAccents.successBg
                                  : AppAccents.cardBg,
                              clipBehavior: Clip.antiAlias,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
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
              ),
            ],
          ),
        ),
      ),
    );
  }
}
