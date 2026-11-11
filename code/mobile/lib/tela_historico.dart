import 'package:flutter/material.dart';

import 'models/ciclo_participacao.dart';
import 'sessao_usuario.dart';
import 'services/participacoes_api.dart';
import 'theme/colors.dart';
import 'widgets/cabecalho_logos.dart';

export 'models/ciclo_participacao.dart';

class HistoricoParticipacaoPage extends StatefulWidget {
  const HistoricoParticipacaoPage({
    super.key,
    this.ciclos,
    this.api,
  });

  /// Quando informado, usa estes ciclos (útil em testes) sem chamar a API.
  final List<CicloParticipacao>? ciclos;
  final ParticipacoesApi? api;

  @override
  State<HistoricoParticipacaoPage> createState() =>
      _HistoricoParticipacaoPageState();
}

class _HistoricoParticipacaoPageState extends State<HistoricoParticipacaoPage> {
  late final ParticipacoesApi _api;
  List<CicloParticipacao> _ciclos = const [];
  bool _carregando = true;
  String? _erro;

  @override
  void initState() {
    super.initState();
    _api = widget.api ?? SessaoUsuario.atual.participacoesApi;
    if (widget.ciclos != null) {
      _ciclos = _ordenar(widget.ciclos!);
      _carregando = false;
    } else {
      _carregar();
    }
  }

  List<CicloParticipacao> _ordenar(List<CicloParticipacao> ciclos) {
    final copia = [...ciclos];
    copia.sort((a, b) => b.semestre.compareTo(a.semestre));
    return copia;
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _erro = null;
    });

    final usuarioId = SessaoUsuario.atual.usuarioIdHistorico;
    try {
      final remotos = await _api.listar(usuarioId);
      if (!mounted) return;
      setState(() {
        _ciclos = _ordenar(remotos);
        _carregando = false;
      });
      SessaoUsuario.atual.atualizarHistorico(_ciclos);
    } catch (_) {
      if (!mounted) return;
      final cache = SessaoUsuario.atual.historicoParticipacoes;
      setState(() {
        _ciclos = _ordenar(cache);
        _carregando = false;
        _erro = cache.isEmpty
            ? 'Não foi possível carregar o histórico agora.'
            : null;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: RefreshIndicator(
          color: AppColors.primary,
          onRefresh: widget.ciclos != null ? () async {} : _carregar,
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const CabecalhoLogos(),
                const SizedBox(height: 16),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Image.asset(
                      'assets/images/historico.png',
                      width: 72,
                      height: 72,
                      fit: BoxFit.contain,
                      errorBuilder: (_, _, _) => const SizedBox.shrink(),
                    ),
                    const SizedBox(width: 14),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Histórico de participação',
                            style: TextStyle(
                              color: AppColors.ink,
                              fontSize: 24,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.4,
                            ),
                          ),
                          SizedBox(height: 4),
                          Text(
                            'Veja sua evolução no programa e seus papéis em cada ciclo.',
                            style: TextStyle(
                              fontFamily: 'Inter',
                              color: AppColors.muted,
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                if (_carregando)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 40),
                    child: Center(
                      child: CircularProgressIndicator(color: AppColors.primary),
                    ),
                  )
                else if (_erro != null && _ciclos.isEmpty)
                  _EstadoVazio(mensagem: _erro!, acao: _carregar)
                else if (_ciclos.isEmpty)
                  const _EstadoVazio(
                    mensagem:
                        'Você ainda não possui participações registradas '
                        'no programa.',
                  )
                else ...[
                  for (final (i, ciclo) in _ciclos.indexed)
                    _CardCiclo(
                      ciclo: ciclo,
                      ultimo: i == _ciclos.length - 1,
                    ),
                  if (_ciclos.length == 1) ...[
                    const SizedBox(height: 8),
                    Text(
                      'Essa é sua primeira participação no programa.',
                      style: TextStyle(
                        fontFamily: 'Inter',
                        color: AppColors.muted.withValues(alpha: 0.95),
                        fontSize: 13,
                        height: 1.4,
                      ),
                    ),
                  ],
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _EstadoVazio extends StatelessWidget {
  const _EstadoVazio({required this.mensagem, this.acao});

  final String mensagem;
  final Future<void> Function()? acao;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.lavender.withValues(alpha: 0.45),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppAccents.cardBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            mensagem,
            style: const TextStyle(
              fontFamily: 'Inter',
              color: AppColors.muted,
              fontSize: 13,
              height: 1.4,
            ),
          ),
          if (acao != null) ...[
            const SizedBox(height: 10),
            TextButton(
              onPressed: () => acao!(),
              style: TextButton.styleFrom(
                foregroundColor: AppColors.primary,
                padding: EdgeInsets.zero,
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: const Text(
                'Tentar novamente',
                style: TextStyle(
                  fontFamily: 'Inter',
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _CardCiclo extends StatelessWidget {
  const _CardCiclo({required this.ciclo, required this.ultimo});

  final CicloParticipacao ciclo;
  final bool ultimo;

  @override
  Widget build(BuildContext context) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 18,
            child: Column(
              children: [
                const SizedBox(height: 20),
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: ciclo.status.corPonto,
                    shape: BoxShape.circle,
                  ),
                ),
                if (!ultimo)
                  Expanded(
                    child: Container(
                      width: 2,
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      color: AppAccents.cardBorder,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppAccents.cardBorder),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Programa ${ciclo.semestre}',
                          style: const TextStyle(
                            fontFamily: 'Inter',
                            color: AppColors.muted,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: ciclo.status.fundoSelo,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          ciclo.status.rotulo,
                          style: TextStyle(
                            fontFamily: 'Inter',
                            color: ciclo.status.corSelo,
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    ciclo.titulo,
                    style: const TextStyle(
                      color: AppColors.ink,
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    ciclo.descricao,
                    style: const TextStyle(
                      fontFamily: 'Inter',
                      color: AppColors.muted,
                      fontSize: 12,
                      height: 1.35,
                    ),
                  ),
                  if (ciclo.detalhes.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    const Divider(height: 1, color: AppAccents.cardBorder),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 16,
                      runSpacing: 8,
                      children: [
                        for (final (rotulo, valor) in ciclo.detalhes)
                          ConstrainedBox(
                            constraints: const BoxConstraints(minWidth: 90),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  rotulo,
                                  style: const TextStyle(
                                    fontFamily: 'Inter',
                                    color: AppColors.muted,
                                    fontSize: 11,
                                  ),
                                ),
                                Text(
                                  valor,
                                  style: const TextStyle(
                                    fontFamily: 'Inter',
                                    color: AppColors.ink,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
