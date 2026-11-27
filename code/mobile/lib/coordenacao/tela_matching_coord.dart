import 'package:flutter/material.dart';

import '../models/preferencia_genero.dart';
import 'resumo_matching.dart';
import 'pares_recusados_matching.dart';
import 'grupos_matching.dart';
import 'painel_coord.dart';
import 'tela_matching_manual_coord.dart';

import '../services/coordenacao_api.dart';
import '../services/api_config.dart';
import '../theme/colors.dart';
import 'componentes_coord.dart';

const _statusSugestoes = <String, String>{
  'pendente': 'Pendentes',
  'aprovada': 'Aprovadas',
  'recusada': 'Recusadas',
  'obsoleta': 'Desatualizadas',
};

Map<String, dynamic> _mapa(Object? valor) =>
    valor is Map ? Map<String, dynamic>.from(valor) : <String, dynamic>{};

List<Map<String, dynamic>> _mapas(Object? valor) => valor is List
    ? valor
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList()
    : <Map<String, dynamic>>[];

String _nome(Map<String, dynamic> pessoa) =>
    '${pessoa['nome'] ?? _mapa(pessoa['respostas'])['nome'] ?? pessoa['usuarioId'] ?? 'Participante'}';

String _percentual(Object? valor) => percentualMatching(valor);

/// Fluxo F11/F12 de matching da coordenação para o ciclo selecionado no shell.
class TelaMatchingCoord extends StatefulWidget {
  const TelaMatchingCoord({
    super.key,
    required this.api,
    required this.programa,
  });

  final CoordenacaoApi api;
  final String programa;

  @override
  State<TelaMatchingCoord> createState() => _TelaMatchingCoordState();
}

class _TelaMatchingCoordState extends State<TelaMatchingCoord> {
  Map<String, dynamic>? _visao;
  List<Map<String, dynamic>> _execucoes = const [];
  List<Map<String, dynamic>> _sugestoes = const [];
  String _status = 'pendente';
  String _aba = 'operacao';
  String? _erro;
  bool _carregando = true;
  bool _alterando = false;
  int _sequencia = 0;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  @override
  void didUpdateWidget(covariant TelaMatchingCoord oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.programa != widget.programa || oldWidget.api != widget.api) {
      _visao = null;
      _execucoes = const [];
      _sugestoes = const [];
      _status = 'pendente';
      _alterando = false;
      _carregar();
    }
  }

  Future<void> _carregar() async {
    final pedido = ++_sequencia;
    final programa = widget.programa;
    setState(() {
      _carregando = true;
      _erro = null;
    });
    try {
      final resultados = await Future.wait<Object>([
        widget.api.matchingVisao(programa),
        widget.api.execucoesMatching(programa),
        widget.api.sugestoesMatching(programa, status: _status),
      ]);
      if (!mounted || pedido != _sequencia || programa != widget.programa) {
        return;
      }
      setState(() {
        _visao = _mapa(resultados[0]);
        _execucoes = _mapas(resultados[1]);
        _sugestoes = _mapas(resultados[2]);
        _carregando = false;
      });
    } catch (erro) {
      if (!mounted || pedido != _sequencia || programa != widget.programa) {
        return;
      }
      setState(() {
        _erro = mensagemDeErro(erro);
        _carregando = false;
      });
    }
  }

  Future<void> _selecionarStatus(String status) async {
    if (_status == status) return;
    setState(() => _status = status);
    await _carregar();
  }

  Future<void> _configurar() async {
    final visao = _visao;
    if (visao == null) return;
    final programa = widget.programa;
    final salvo = await showModalBottomSheet<Object?>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Colors.white,
      builder: (_) => _EditorMatching(
        api: widget.api,
        programa: programa,
        configuracao: _mapa(visao['configuracao']),
        criteriosDisponiveis: _mapas(visao['criteriosDisponiveis']),
        criteriosCadastro: _mapas(visao['criteriosCadastroDisponiveis']),
      ),
    );
    if ((salvo == true || salvo == 'conflito') &&
        mounted &&
        programa == widget.programa) {
      mostrarMensagemCoord(
        context,
        salvo == true
            ? 'Configuração de matching salva.'
            : 'Carregando a configuração atual. Revise antes de salvar.',
      );
      await _carregar();
    }
  }

  Future<void> _abrirCatalogo() async {
    final alterou = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => TelaCatalogoCriteriosMatching(api: widget.api),
      ),
    );
    if (alterou == true && mounted) await _carregar();
  }

  Future<void> _executar() async {
    if (_visao?['podeExecutar'] != true || _alterando) return;
    final programa = widget.programa;
    final confirmou = await confirmarAcaoCoord(
      context,
      titulo: 'Gerar nova rodada?',
      mensagem:
          'Sugestões pendentes anteriores ficarão desatualizadas. Decisões e '
          'vínculos confirmados serão preservados.',
      confirmar: 'Executar matching',
    );
    if (!confirmou || !mounted || programa != widget.programa) return;
    setState(() {
      _alterando = true;
      _erro = null;
    });
    try {
      final resultado = await widget.api.executarMatching(programa);
      if (!mounted || programa != widget.programa) return;
      setState(() => _status = 'pendente');
      mostrarMensagemCoord(
        context,
        'Execução concluída: ${resultado['totalSugestoes'] ?? 0} sugestão(ões).',
      );
      await _carregar();
    } catch (erro) {
      if (mounted && programa == widget.programa) {
        setState(() => _erro = mensagemDeErro(erro));
      }
    } finally {
      if (mounted && programa == widget.programa) {
        setState(() => _alterando = false);
      }
    }
  }

  Future<void> _abrirSugestao(Map<String, dynamic> sugestao) async {
    final id = idDe(sugestao);
    if (id == null) return;
    final alterou = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => TelaComparacaoMatching(api: widget.api, id: id),
      ),
    );
    if (alterou == true && mounted) await _carregar();
  }

  @override
  Widget build(BuildContext context) {
    final visao = _visao;
    final bloqueios = (visao?['bloqueios'] as List? ?? const []);
    final configuracao = _mapa(visao?['configuracao']);
    final chat = _mapa(visao?['chat']);
    final preparacao = Column(
      children: [
        _CardConfiguracao(
          configuracao: configuracao,
          alterando: _alterando,
          onConfigurar: _configurar,
        ),
        DiagnosticoDadosMatching(dados: _mapa(visao?['diagnosticoDados'])),
        if (_execucoes.isNotEmpty &&
            _mapa(_mapa(_execucoes.first['configSnapshot'])['relatorio'])
                .isNotEmpty)
          CartaoPainelCoord(
            child: ExpansionTile(
              tilePadding: EdgeInsets.zero,
              title: const Text(
                'Relatório da última rodada',
                style: TextStyle(
                  fontSize: 14,
                  color: AppColors.ink,
                  fontWeight: FontWeight.w600,
                ),
              ),
              children: [
                RelatorioRodadaMatching(
                  relatorio: _mapa(
                    _mapa(_execucoes.first['configSnapshot'])['relatorio'],
                  ),
                ),
              ],
            ),
          ),
        if (chat.isNotEmpty)
          CartaoPainelCoord(
            child: ExpansionTile(
              tilePadding: EdgeInsets.zero,
              title: const Text(
                'Conversas do programa',
                style: TextStyle(fontSize: 14, color: AppColors.ink),
              ),
              children: [
                Text(
                  chat['disponivel'] == true
                      ? 'Chat integrado. As conversas ficam disponíveis após a confirmação do vínculo.'
                      : '${chat['mensagem'] ?? 'A integração do chat está pendente.'}',
                  style: const TextStyle(
                    fontSize: 12,
                    color: corTextoSecundarioCoord,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
    final sugestoes = CartaoPainelCoord(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _CabecalhoSugestoes(
            execucao: _execucoes.isEmpty ? null : _execucoes.first,
          ),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final item in _statusSugestoes.entries)
                ChoiceChip(
                  label: Text(item.value),
                  selected: _status == item.key,
                  onSelected: _alterando
                      ? null
                      : (_) => _selecionarStatus(item.key),
                  selectedColor: const Color(0xFFEDE5FA),
                  labelStyle: TextStyle(
                    fontSize: 12,
                    color: _status == item.key
                        ? AppColors.primary
                        : corTextoSecundarioCoord,
                  ),
                  showCheckmark: false,
                ),
            ],
          ),
          const SizedBox(height: 16),
          if (_carregando)
            const Center(
              child: CircularProgressIndicator(color: AppColors.primary),
            )
          else if (_sugestoes.isEmpty)
            _VazioMatching(
              status: _status,
              podeExecutar: visao?['podeExecutar'] == true,
            )
          else
            for (final sugestao in _sugestoes)
              _CardSugestao(
                sugestao: sugestao,
                onAbrir: () => _abrirSugestao(sugestao),
              ),
        ],
      ),
    );
    return Scaffold(
      backgroundColor: corFundoCoord,
      body: SafeArea(
        child: RefreshIndicator(
          color: AppColors.primary,
          onRefresh: _carregar,
          child: ListView(
            padding: const EdgeInsets.only(bottom: 28),
            children: [
              CabecalhoCoord(
                voltar: true,
                titulo: 'Matching',
                subtitulo: 'Encontre bons pares. Revise as sugestões e transforme afinidades em vínculos.',
                acao: IconButton(
                  tooltip: 'Atualizar matching',
                  onPressed: _alterando ? null : _carregar,
                  icon: const Icon(Icons.refresh, color: AppColors.primary),
                ),
              ),
              if (_aba == 'operacao')
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                  child: Wrap(
                    spacing: 10,
                    runSpacing: 8,
                    children: [
                      OutlinedButton.icon(
                        onPressed: () async {
                          final programa = widget.programa;
                          await Navigator.of(context).push(
                            MaterialPageRoute<void>(
                              builder: (_) => TelaMatchingManualCoord(
                                api: widget.api,
                                programa: programa,
                              ),
                            ),
                          );
                          if (mounted && programa == widget.programa) {
                            await _carregar();
                          }
                        },
                        icon: const Icon(Icons.link, size: 17),
                        label: const Text('Vínculo manual'),
                      ),
                      FilledButton.icon(
                        onPressed: visao?['podeExecutar'] == true && !_alterando
                            ? _executar
                            : null,
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          foregroundColor: Colors.white,
                        ),
                        icon: const Icon(Icons.auto_awesome, size: 17),
                        label: Text(
                          _alterando ? 'Executando…' : 'Gerar sugestões',
                        ),
                      ),
                    ],
                  ),
                ),
              AbasPainelCoord(
                itens: const [
                  (
                    valor: 'operacao',
                    titulo: 'Visão geral',
                    icone: Icons.auto_awesome_outlined,
                  ),
                  (
                    valor: 'grupos',
                    titulo: 'Grupos e transferências',
                    icone: Icons.groups_outlined,
                  ),
                  (
                    valor: 'recusados',
                    titulo: 'Pares recusados',
                    icone: Icons.history,
                  ),
                  (
                    valor: 'criterios',
                    titulo: 'Critérios de matching',
                    icone: Icons.tune,
                  ),
                ],
                selecionada: _aba,
                onSelecionar: (valor) => setState(() => _aba = valor),
              ),
              if (_erro != null)
                _Aviso(
                  icone: Icons.error_outline,
                  cor: corErroCoord,
                  titulo: _erro!,
                  acao: TextButton(
                    onPressed: _carregar,
                    child: const Text('Tentar novamente'),
                  ),
                ),
              if (_carregando && visao == null)
                const Padding(
                  padding: EdgeInsets.all(40),
                  child: Center(
                    child: CircularProgressIndicator(color: AppColors.primary),
                  ),
                ),
              if (_aba == 'criterios')
                CartaoPainelCoord(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const TituloPainelCoord(
                        titulo: 'Critérios de matching',
                        descricao: 'Gerencie o catálogo e use os critérios nos formulários de padrinhos e apadrinhados.',
                      ),
                      FilledButton.icon(
                        onPressed: _abrirCatalogo,
                        icon: const Icon(Icons.library_books_outlined),
                        label: const Text('Abrir catálogo de critérios'),
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          foregroundColor: Colors.white,
                        ),
                      ),
                    ],
                  ),
                ),
              if (_aba == 'grupos')
                GruposMatchingCoord(
                  api: widget.api,
                  programa: widget.programa,
                  revisao: visao,
                  onAlterado: _carregar,
                ),
              if (_aba == 'recusados')
                ParesRecusadosMatching(
                  api: widget.api,
                  programa: widget.programa,
                  revisao: visao,
                  onAlterado: _carregar,
                ),
              if (_aba == 'operacao' && visao != null) ...[
                _Aviso(
                  icone: visao['podeExecutar'] == true
                      ? Icons.check_circle_outline
                      : Icons.info_outline,
                  cor: visao['podeExecutar'] == true
                      ? const Color(0xFF176C4B)
                      : const Color(0xFF87531C),
                  titulo: visao['podeExecutar'] == true
                      ? 'Tudo pronto para gerar sugestões'
                      : 'A geração de sugestões está bloqueada',
                  descricao: visao['podeExecutar'] == true
                      ? 'Inscrições encerradas, etapa liberada e candidatos elegíveis disponíveis.'
                      : bloqueios.join('\n'),
                ),
                _ResumoMatching(totais: _mapa(visao['totais'])),
                const SizedBox(height: 16),
                LayoutBuilder(
                  builder: (context, constraints) =>
                      constraints.maxWidth >= 1000
                      ? Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(child: sugestoes),
                            SizedBox(width: 350, child: preparacao),
                          ],
                        )
                      : Column(children: [sugestoes, preparacao]),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _VazioMatching extends StatelessWidget {
  const _VazioMatching({required this.status, required this.podeExecutar});
  final String status;
  final bool podeExecutar;
  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 32),
    decoration: BoxDecoration(
      color: const Color(0xFFFCFAFF),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Column(
      children: [
        Container(
          padding: const EdgeInsets.all(17),
          decoration: BoxDecoration(
            color: const Color(0xFFEDE5FA),
            borderRadius: BorderRadius.circular(18),
          ),
          child: const Icon(
            Icons.person_search_outlined,
            size: 30,
            color: AppColors.primary,
          ),
        ),
        const SizedBox(height: 18),
        Text(
          switch (status) {
            'aprovada' => 'Nenhuma sugestão aprovada',
            'recusada' => 'Nenhuma sugestão recusada',
            'obsoleta' => 'Nenhuma sugestão desatualizada',
            _ => 'Nenhuma sugestão pendente',
          },
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: AppColors.ink,
            fontWeight: FontWeight.w700,
            fontSize: 15,
          ),
        ),
        const SizedBox(height: 10),
        Text(
          status != 'pendente'
              ? 'Os pares aparecerão aqui quando houver uma decisão neste estado.'
              : podeExecutar
              ? 'Gere uma rodada para encontrar pares entre os participantes elegíveis.'
              : 'As sugestões aparecerão aqui após a liberação e a execução do matching.',
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: corTextoSecundarioCoord,
            fontSize: 12,
            height: 1.6,
          ),
        ),
      ],
    ),
  );
}

class _Aviso extends StatelessWidget {
  const _Aviso({
    required this.icone,
    required this.cor,
    required this.titulo,
    this.descricao,
    this.acao,
  });

  final IconData icone;
  final Color cor;
  final String titulo;
  final String? descricao;
  final Widget? acao;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.fromLTRB(16, 4, 16, 10),
    padding: const EdgeInsets.all(13),
    decoration: BoxDecoration(
      color: cor == const Color(0xFF87531C)
          ? const Color(0xFFFFF8ED)
          : cor.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(13),
      border: Border.all(color: cor.withValues(alpha: 0.25)),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icone, color: cor, size: 21),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                titulo,
                style: TextStyle(fontWeight: FontWeight.w700, color: cor),
              ),
              if (descricao?.isNotEmpty == true)
                Text(
                  descricao!,
                  style: const TextStyle(
                    fontSize: 12,
                    color: corTextoSecundarioCoord,
                  ),
                ),
            ],
          ),
        ),
        ?acao,
      ],
    ),
  );
}

class _ResumoMatching extends StatelessWidget {
  const _ResumoMatching({required this.totais});
  final Map<String, dynamic> totais;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 16),
    child: IndicadoresPainelCoord(
      itens: [
        IndicadorPainelCoord(
          'Pessoas elegíveis',
          '${(totais['padrinhosElegiveis'] as num? ?? 0) + (totais['apadrinhadosElegiveis'] as num? ?? 0)}',
          '${totais['padrinhosElegiveis'] ?? 0} padrinhos · ${totais['apadrinhadosElegiveis'] ?? 0} apadrinhados',
          Icons.groups_outlined,
        ),
        IndicadorPainelCoord(
          'Sugestões pendentes',
          '${totais['sugestoesPendentes'] ?? 0}',
          'Aguardando sua revisão',
          Icons.auto_awesome_outlined,
        ),
        IndicadorPainelCoord(
          'Vínculos confirmados',
          '${totais['vinculos'] ?? 0}',
          'Pares já aprovados',
          Icons.link,
        ),
        IndicadorPainelCoord(
          'Pessoas sem vínculo',
          '${totais['pessoasSemVinculo'] ?? 0}',
          'Ainda aguardando um par',
          Icons.person_outline,
        ),
      ],
    ),
  );
}

class _CardConfiguracao extends StatelessWidget {
  const _CardConfiguracao({
    required this.configuracao,
    required this.alterando,
    required this.onConfigurar,
  });
  final Map<String, dynamic> configuracao;
  final bool alterando;
  final VoidCallback onConfigurar;
  @override
  Widget build(BuildContext context) => CartaoPainelCoord(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const TituloPainelCoord(titulo: 'Critérios e capacidades'),
        Text(
          '${(configuracao['criterios'] as List? ?? []).length} critério(s) de compatibilidade em uso.',
          style: const TextStyle(color: corTextoSecundarioCoord, fontSize: 12),
        ),
        const SizedBox(height: 16),
        for (final item in [
          ('Apadrinhados por padrinho', configuracao['capacidadePorPadrinho']),
          (
            'Padrinhos por apadrinhado',
            configuracao['capacidadePorApadrinhado'],
          ),
        ])
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    item.$1,
                    style: const TextStyle(
                      fontSize: 12,
                      color: corTextoSecundarioCoord,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                SeloPainelCoord('Até ${item.$2 ?? '—'}'),
              ],
            ),
          ),
        const ExpansionTile(
          tilePadding: EdgeInsets.zero,
          title: Text(
            'Como configurar os critérios',
            style: TextStyle(fontSize: 12, color: AppColors.primary),
          ),
          children: [
            Text(
              'Os dados do cadastro já estão disponíveis. Critérios adicionais são geridos na aba Critérios de matching e inseridos nos formulários com Adicionar pergunta de matching.',
              style: TextStyle(
                fontSize: 12,
                color: corTextoSecundarioCoord,
                height: 1.5,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: alterando ? null : onConfigurar,
            icon: const Icon(Icons.tune, size: 17),
            label: Text(
              configuracao.isEmpty ? 'Configurar' : 'Editar configuração',
            ),
          ),
        ),
      ],
    ),
  );
}

class _CabecalhoSugestoes extends StatelessWidget {
  const _CabecalhoSugestoes({required this.execucao});

  final Map<String, dynamic>? execucao;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Sugestões de matching',
          style: TextStyle(
            fontFamily: 'Poppins',
            fontWeight: FontWeight.w800,
            fontSize: 18,
          ),
        ),
        Text(
          execucao == null
              ? 'Nenhuma execução registrada.'
              : 'Última execução: ${execucao!['status']}'
                    '${formatarDataCoord(execucao!['criadoEm']).isEmpty ? '' : ' · ${formatarDataCoord(execucao!['criadoEm'])}'}.',
          style: const TextStyle(fontSize: 12, color: corTextoSecundarioCoord),
        ),
      ],
    ),
  );
}

class _CardSugestao extends StatelessWidget {
  const _CardSugestao({required this.sugestao, required this.onAbrir});

  final Map<String, dynamic> sugestao;
  final VoidCallback onAbrir;

  @override
  Widget build(BuildContext context) {
    final padrinho = _mapa(sugestao['padrinho']);
    final apadrinhado = _mapa(sugestao['apadrinhado']);
    return Card(
      margin: const EdgeInsets.fromLTRB(16, 9, 16, 0),
      color: Colors.white,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onAbrir,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '${_nome(padrinho)} ↔ ${_nome(apadrinhado)}',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                  Text(
                    _percentual(
                      _mapa(sugestao['explicacao'])['score'] ??
                          sugestao['score'],
                    ),
                    style: const TextStyle(
                      color: AppColors.primary,
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                    ),
                  ),
                ],
              ),
              Text(
                '${padrinho['curso'] ?? 'Curso não informado'} · '
                '${apadrinhado['curso'] ?? 'Curso não informado'}',
                style: const TextStyle(
                  fontSize: 12,
                  color: corTextoSecundarioCoord,
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Chip(
                    label: Text('${sugestao['status']}'),
                    visualDensity: VisualDensity.compact,
                  ),
                  const Spacer(),
                  const Text(
                    'Comparar',
                    style: TextStyle(
                      color: AppColors.primary,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const Icon(Icons.chevron_right, color: AppColors.primary),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EditorMatching extends StatefulWidget {
  const _EditorMatching({
    required this.api,
    required this.programa,
    required this.configuracao,
    required this.criteriosDisponiveis,
    required this.criteriosCadastro,
  });

  final CoordenacaoApi api;
  final String programa;
  final Map<String, dynamic> configuracao;
  final List<Map<String, dynamic>> criteriosDisponiveis;
  final List<Map<String, dynamic>> criteriosCadastro;

  @override
  State<_EditorMatching> createState() => _EditorMatchingState();
}

class _EditorMatchingState extends State<_EditorMatching> {
  bool _conflito = false;
  late int _capacidadeP =
      (widget.configuracao['capacidadePorPadrinho'] as num?)?.toInt() ?? 3;
  late int _capacidadeA =
      (widget.configuracao['capacidadePorApadrinhado'] as num?)?.toInt() ?? 1;
  late final List<Map<String, dynamic>> _criterios = [
    for (final item in _mapas(widget.configuracao['criterios']))
      if (item['campoCadastro'] != null ||
          (item['criterioPadrinhoId'] != null &&
              item['criterioApadrinhadoId'] != null))
        {
          if (item['campoCadastro'] != null)
            'campoCadastro': item['campoCadastro'],
          if (item['campoCadastro'] == null) ...{
            'criterioPadrinhoId': (item['criterioPadrinhoId'] as num).toInt(),
            'criterioApadrinhadoId': (item['criterioApadrinhadoId'] as num)
                .toInt(),
          },
          'operacao': '${item['operacao'] ?? 'igualdade'}',
          'peso': (item['peso'] as num?)?.toInt() ?? 10,
          if (item['obrigatorio'] is bool) 'obrigatorio': item['obrigatorio'],
        },
  ];
  bool _salvando = false;
  String? _erro;

  List<Map<String, dynamic>> get _opcoes {
    final habilitaveis = widget.criteriosDisponiveis
        .where((c) => c['habilitavel'] == true)
        .toList();
    final base = habilitaveis.isNotEmpty
        ? habilitaveis
        : widget.criteriosDisponiveis;
    return base.where((c) => c['ativo'] != false).toList();
  }

  void _adicionar() {
    if (_opcoes.isEmpty) return;
    final primeiro = _opcoes.first;
    final id = (primeiro['id'] as num).toInt();
    setState(() {
      _criterios.add({
        'criterioPadrinhoId': id,
        'criterioApadrinhadoId': id,
        'operacao': primeiro['tipo'] == 'multipla_escolha'
            ? 'intersecao'
            : 'igualdade',
        'peso': 10,
      });
    });
  }

  Widget _campoObrigatorio(Map<String, dynamic> criterio) => CheckboxListTile(
    contentPadding: EdgeInsets.zero,
    title: const Text(
      'Correspondência obrigatória',
      style: TextStyle(fontSize: 13, color: AppColors.ink),
    ),
    controlAffinity: ListTileControlAffinity.leading,
    activeColor: AppColors.primary,
    subtitle: Text(
      criterio['campoCadastro'] == 'areas'
          ? 'Exige ao menos uma área de apoio em comum.'
          : criterio['campoCadastro'] == 'disponibilidade'
          ? 'Exige ao menos um horário em comum; online é modalidade.'
          : 'Sem correspondência ou com dados insuficientes, o par não será sugerido.',
    ),
    value: criterio['obrigatorio'] == true,
    onChanged: _salvando
        ? null
        : (valor) => setState(() => criterio['obrigatorio'] = valor == true),
  );

  Future<void> _salvar() async {
    if (_salvando || _conflito) return;
    if (_criterios.any(
      (c) =>
          c['peso'] is! int ||
          (c['peso'] as int) < 1 ||
          (c['peso'] as int) > 100,
    )) {
      setState(() => _erro = 'Informe pesos inteiros entre 1 e 100.');
      return;
    }
    if (_criterios.isEmpty) {
      setState(() => _erro = 'Adicione ao menos um par de critérios.');
      return;
    }
    setState(() {
      _salvando = true;
      _erro = null;
    });
    try {
      await widget.api.salvarMatchingConfiguracao(
        programa: widget.programa,
        versaoBase: (widget.configuracao['versao'] as num?)?.toInt() ?? 0,
        liberado: widget.configuracao['liberado'] == true,
        capacidadePorPadrinho: _capacidadeP,
        capacidadePorApadrinhado: _capacidadeA,
        criterios: _criterios,
      );
      if (mounted) Navigator.pop(context, true);
    } catch (erro) {
      if (mounted) {
        setState(() {
          _salvando = false;
          _erro = mensagemDeErro(erro);
          _conflito = erro is ApiException && erro.statusCode == 409;
        });
      }
    }
  }

  Widget _fonteCadastro(Map<String, dynamic> fonte) {
    final selecionados = _criterios.where(
      (c) => c['campoCadastro'] == fonte['campo'],
    );
    final criterio = selecionados.isEmpty ? null : selecionados.first;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: criterio == null ? Colors.white : AppColors.lavender,
        border: Border.all(
          color: criterio == null
              ? const Color(0xFFE4DFF0)
              : const Color(0xFFBAA2DB),
        ),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Material(
        color: Colors.transparent,
        child: Column(
          children: [
            CheckboxListTile(
              value: criterio != null,
              activeColor: AppColors.primary,
              controlAffinity: ListTileControlAffinity.leading,
              contentPadding: const EdgeInsets.symmetric(horizontal: 10),
              title: Text(
                '${fonte['nome']}',
                style: const TextStyle(
                  fontSize: 13,
                  color: AppColors.ink,
                  fontWeight: FontWeight.w600,
                ),
              ),
              onChanged: _salvando
                  ? null
                  : (valor) => setState(() {
                      if (valor == true) {
                        _criterios.add({
                          'campoCadastro': fonte['campo'],
                          'operacao': fonte['operacao'],
                          'peso': 10,
                        });
                      } else {
                        _criterios.removeWhere(
                          (c) => c['campoCadastro'] == fonte['campo'],
                        );
                      }
                    }),
            ),
            if (criterio != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
                child: Column(
                  children: [
                    TextFormField(
                      key: ObjectKey(criterio),
                      initialValue: '${criterio['peso']}',
                      enabled: !_salvando,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Peso (1 a 100)',
                        filled: true,
                        fillColor: Colors.white,
                        border: OutlineInputBorder(),
                      ),
                      onChanged: (valor) =>
                          criterio['peso'] = int.tryParse(valor) ?? 0,
                    ),
                    if (fonte['permiteObrigatorio'] == true)
                      _campoObrigatorio(criterio),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _cardCatalogo(Map<String, dynamic> criterio) {
    final indice = _criterios.indexOf(criterio);
    final ids = {
      for (final c in widget.criteriosDisponiveis) (c['id'] as num).toInt(): c,
    };
    return Card(
      color: Colors.white,
      shape: RoundedRectangleBorder(
        side: const BorderSide(color: Color(0xFFE4DFF0)),
        borderRadius: BorderRadius.circular(12),
      ),
      key: ObjectKey(criterio),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    '${ids[criterio['criterioPadrinhoId']]?['nome'] ?? 'Critério do catálogo'}',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                IconButton(
                  tooltip: 'Remover critério',
                  onPressed: () => setState(() => _criterios.removeAt(indice)),
                  icon: const Icon(Icons.delete_outline),
                ),
              ],
            ),
            DropdownButtonFormField<int>(
              isExpanded: true,
              initialValue: criterio['criterioPadrinhoId'] as int?,
              decoration: const InputDecoration(
                labelText: 'Critério do padrinho',
              ),
              items: [
                for (final c in widget.criteriosDisponiveis)
                  DropdownMenuItem(
                    value: (c['id'] as num).toInt(),
                    child: Text(
                      '${c['nome']}'
                      '${c['habilitavel'] == true ? '' : ' (parcial)'}',
                    ),
                  ),
              ],
              onChanged: (valor) {
                if (valor == null) return;
                setState(() {
                  criterio['criterioPadrinhoId'] = valor;
                  criterio['criterioApadrinhadoId'] = valor;
                  final meta = ids[valor];
                  criterio['operacao'] = meta?['tipo'] == 'multipla_escolha'
                      ? 'intersecao'
                      : 'igualdade';
                });
              },
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<int>(
              isExpanded: true,
              initialValue: criterio['criterioApadrinhadoId'] as int?,
              decoration: const InputDecoration(
                labelText: 'Critério do apadrinhado',
              ),
              items: [
                for (final c in widget.criteriosDisponiveis.where(
                  (c) => c['id'] == criterio['criterioPadrinhoId'],
                ))
                  DropdownMenuItem(
                    value: (c['id'] as num).toInt(),
                    child: Text(
                      '${c['nome']}'
                      '${c['habilitavel'] == true ? '' : ' (parcial)'}',
                    ),
                  ),
              ],
              onChanged: (valor) =>
                  setState(() => criterio['criterioApadrinhadoId'] = valor),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              isExpanded: true,
              initialValue: '${criterio['operacao'] ?? 'igualdade'}',
              decoration: const InputDecoration(labelText: 'Comparação'),
              items: const [
                DropdownMenuItem(value: 'igualdade', child: Text('Igualdade')),
                DropdownMenuItem(
                  value: 'intersecao',
                  child: Text('Interseção'),
                ),
                DropdownMenuItem(value: 'diferenca', child: Text('Diferença')),
              ],
              onChanged: (valor) =>
                  setState(() => criterio['operacao'] = valor),
            ),
            const SizedBox(height: 8),
            _campoObrigatorio(criterio),
            TextFormField(
              initialValue: '${criterio['peso'] ?? 10}',
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Peso (1 a 100)'),
              onChanged: (valor) {
                final peso = int.tryParse(valor);
                criterio['peso'] = peso ?? 0;
              },
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final altura =
        (MediaQuery.sizeOf(context).height * 0.88 -
                MediaQuery.viewInsetsOf(context).bottom)
            .clamp(220.0, 850.0);
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        child: SizedBox(
          height: altura,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 12, 14),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Configurar matching',
                            style: TextStyle(
                              fontFamily: 'Poppins',
                              fontSize: 19,
                              fontWeight: FontWeight.w800,
                              color: AppColors.ink,
                            ),
                          ),
                          SizedBox(height: 6),
                          Text(
                            'Defina a capacidade dos vínculos e o que considerar ao sugerir cada par.',
                            style: TextStyle(
                              fontSize: 12,
                              color: corTextoSecundarioCoord,
                              height: 1.5,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      tooltip: 'Fechar',
                      onPressed: _salvando
                          ? null
                          : () => Navigator.pop(context, false),
                      icon: const Icon(Icons.close, color: AppColors.primary),
                    ),
                  ],
                ),
              ),
              const Divider(height: 1),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(20),
                  children: [
                    const TituloPainelCoord(
                      numero: '01',
                      titulo: 'Capacidade dos vínculos',
                      descricao: 'Quantas conexões cada participante pode ter?',
                    ),
                    DropdownButtonFormField<int>(
                      initialValue: _capacidadeP,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'Apadrinhados por padrinho',
                        border: OutlineInputBorder(),
                      ),
                      items: [
                        for (var i = 1; i <= 20; i++)
                          DropdownMenuItem(value: i, child: Text('Até $i')),
                      ],
                      onChanged: _salvando
                          ? null
                          : (valor) => setState(
                              () => _capacidadeP = valor ?? _capacidadeP,
                            ),
                    ),
                    const SizedBox(height: 14),
                    DropdownButtonFormField<int>(
                      initialValue: _capacidadeA,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'Padrinhos por apadrinhado',
                        border: OutlineInputBorder(),
                      ),
                      items: [
                        for (var i = 1; i <= 20; i++)
                          DropdownMenuItem(value: i, child: Text('Até $i')),
                      ],
                      onChanged: _salvando
                          ? null
                          : (valor) => setState(
                              () => _capacidadeA = valor ?? _capacidadeA,
                            ),
                    ),
                    const SizedBox(height: 28),
                    const TituloPainelCoord(
                      numero: '02',
                      titulo: 'Dados do cadastro',
                      descricao: 'Selecione os dados que entram na comparação. Um peso maior dá mais importância ao critério.',
                    ),
                    for (final fonte in widget.criteriosCadastro)
                      _fonteCadastro(fonte),
                    if (widget.criteriosCadastro.isEmpty)
                      const Text(
                        'Nenhum dado do cadastro disponível neste programa.',
                        style: TextStyle(
                          color: corTextoSecundarioCoord,
                          fontSize: 12,
                        ),
                      ),
                    const ExpansionTile(
                      tilePadding: EdgeInsets.zero,
                      title: Text(
                        'Como esses dados são considerados',
                        style: TextStyle(
                          color: AppColors.primary,
                          fontSize: 12,
                        ),
                      ),
                      children: [
                        Text(
                          'Preferência de gênero tem peso nos dois sentidos. ProUni e mudança de cidade valorizam a vivência compartilhada. Dados não informados continuam desconhecidos.',
                          style: TextStyle(
                            fontSize: 12,
                            color: corTextoSecundarioCoord,
                            height: 1.5,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),
                    const TituloPainelCoord(
                      numero: '03',
                      titulo: 'Pares de critérios',
                      descricao: 'Compare as respostas dos formulários de padrinhos e apadrinhados.',
                    ),
                    Align(
                      alignment: Alignment.centerRight,
                      child: OutlinedButton.icon(
                        onPressed: _opcoes.isEmpty || _salvando
                            ? null
                            : _adicionar,
                        icon: const Icon(Icons.add, size: 17),
                        label: const Text('Adicionar critério'),
                      ),
                    ),
                    const SizedBox(height: 12),
                    for (final criterio in _criterios.where(
                      (c) => c['campoCadastro'] == null,
                    ))
                      _cardCatalogo(criterio),
                    if (_opcoes.isEmpty)
                      const Text(
                        'Nenhum critério disponível. Cadastre no catálogo e adicione perguntas de matching nos formulários.',
                        style: TextStyle(
                          fontSize: 12,
                          color: corTextoSecundarioCoord,
                          height: 1.5,
                        ),
                      ),
                    const SizedBox(height: 12),
                    const Text(
                      'Critérios obrigatórios sem resposta ou sem correspondência impedem a sugestão do par.',
                      style: TextStyle(
                        fontSize: 12,
                        color: corTextoSecundarioCoord,
                        height: 1.5,
                      ),
                    ),
                  ],
                ),
              ),
              if (_erro != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
                  child: Text(
                    _erro!,
                    style: const TextStyle(color: corErroCoord),
                  ),
                ),
              if (_conflito)
                TextButton(
                  onPressed: () => Navigator.pop(context, 'conflito'),
                  child: const Text('Carregar configuração atual'),
                ),
              const Divider(height: 1),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _salvando
                            ? null
                            : () => Navigator.pop(context, false),
                        child: const Text('Cancelar'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      flex: 2,
                      child: FilledButton(
                        onPressed: _salvando || _conflito || _criterios.isEmpty
                            ? null
                            : _salvar,
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          foregroundColor: Colors.white,
                        ),
                        child: Text(
                          _salvando ? 'Salvando…' : 'Salvar configuração',
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class TelaCatalogoCriteriosMatching extends StatefulWidget {
  const TelaCatalogoCriteriosMatching({super.key, required this.api});

  final CoordenacaoApi api;

  @override
  State<TelaCatalogoCriteriosMatching> createState() =>
      _TelaCatalogoCriteriosMatchingState();
}

class _TelaCatalogoCriteriosMatchingState
    extends State<TelaCatalogoCriteriosMatching> {
  List<Map<String, dynamic>> _lista = const [];
  final _busca = TextEditingController();
  bool _carregando = true;
  bool _alterou = false;
  String? _erro;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  @override
  void dispose() {
    _busca.dispose();
    super.dispose();
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _erro = null;
    });
    try {
      final lista = await widget.api.criteriosMatching(
        busca: _busca.text.trim().isEmpty ? null : _busca.text.trim(),
      );
      if (!mounted) return;
      setState(() {
        _lista = lista;
        _carregando = false;
      });
    } catch (erro) {
      if (!mounted) return;
      setState(() {
        _erro = mensagemDeErro(erro);
        _carregando = false;
      });
    }
  }

  Future<void> _editar([Map<String, dynamic>? item]) async {
    Map<String, dynamic>? inicial = item;
    if (item != null) {
      try {
        inicial = await widget.api.criterioMatching(
          (item['id'] as num).toInt(),
        );
      } catch (erro) {
        if (mounted) {
          mostrarMensagemCoord(context, mensagemDeErro(erro));
        }
        return;
      }
    }
    if (!mounted) return;
    final salvo = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Colors.white,
      builder: (_) =>
          _EditorCriterioCatalogo(api: widget.api, inicial: inicial),
    );
    if (salvo == true && mounted) {
      _alterou = true;
      await _carregar();
    }
  }

  Future<void> _alternar(Map<String, dynamic> item) async {
    try {
      await widget.api.ativarCriterioMatching(
        (item['id'] as num).toInt(),
        item['ativo'] != true,
      );
      _alterou = true;
      if (mounted) {
        mostrarMensagemCoord(
          context,
          item['ativo'] == true ? 'Critério desativado.' : 'Critério ativado.',
        );
        await _carregar();
      }
    } catch (erro) {
      if (mounted) mostrarMensagemCoord(context, mensagemDeErro(erro));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: corFundoCoord,
      appBar: AppBar(
        title: const Text('Catálogo de critérios'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.pop(context, _alterou),
        ),
        actions: [
          IconButton(
            tooltip: 'Novo critério',
            onPressed: () => _editar(),
            icon: const Icon(Icons.add),
          ),
        ],
      ),
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: _carregar,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
          children: [
            TextField(
              controller: _busca,
              decoration: InputDecoration(
                labelText: 'Buscar',
                suffixIcon: IconButton(
                  onPressed: _carregar,
                  icon: const Icon(Icons.search),
                ),
              ),
              onSubmitted: (_) => _carregar(),
            ),
            if (_erro != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(
                  _erro!,
                  style: const TextStyle(color: corErroCoord),
                ),
              ),
            if (_carregando)
              const Padding(
                padding: EdgeInsets.all(40),
                child: Center(
                  child: CircularProgressIndicator(color: AppColors.primary),
                ),
              )
            else if (_lista.isEmpty)
              const Padding(
                padding: EdgeInsets.all(28),
                child: Text(
                  'Nenhum critério no catálogo. Crie o primeiro para usar '
                  'em Formulários e na configuração.',
                  textAlign: TextAlign.center,
                ),
              )
            else
              for (final item in _lista)
                Card(
                  margin: const EdgeInsets.only(top: 10),
                  child: ListTile(
                    title: Text('${item['nome']}'),
                    subtitle: Text(
                      '${item['ativo'] == true ? 'Ativo' : 'Inativo'}'
                      ' · ${_mapa(item['versao'])['tipo'] ?? '—'}'
                      ' · usos: ${_mapas(_mapa(item['usos'])['formularios']).length}'
                      ' form(s), ${_mapa(item['usos'])['configuracoes'] ?? 0} config(s)',
                    ),
                    isThreeLine: true,
                    trailing: PopupMenuButton<String>(
                      onSelected: (valor) {
                        if (valor == 'editar') _editar(item);
                        if (valor == 'ativo') _alternar(item);
                      },
                      itemBuilder: (_) => [
                        const PopupMenuItem(
                          value: 'editar',
                          child: Text('Editar'),
                        ),
                        PopupMenuItem(
                          value: 'ativo',
                          child: Text(
                            item['ativo'] == true ? 'Desativar' : 'Ativar',
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
          ],
        ),
      ),
    );
  }
}

class _EditorCriterioCatalogo extends StatefulWidget {
  const _EditorCriterioCatalogo({required this.api, this.inicial});

  final CoordenacaoApi api;
  final Map<String, dynamic>? inicial;

  @override
  State<_EditorCriterioCatalogo> createState() =>
      _EditorCriterioCatalogoState();
}

class _EditorCriterioCatalogoState extends State<_EditorCriterioCatalogo> {
  late final _nome = TextEditingController(
    text: '${widget.inicial?['nome'] ?? ''}',
  );
  late final _descricao = TextEditingController(
    text: '${widget.inicial?['descricao'] ?? ''}',
  );
  late final _enunciado = TextEditingController(
    text: '${_mapa(widget.inicial?['versao'])['enunciadoPadrao'] ?? ''}',
  );
  late String _tipo =
      '${_mapa(widget.inicial?['versao'])['tipo'] ?? 'escolha_unica'}';
  late bool _ativo = widget.inicial?['ativo'] != false;
  late final List<TextEditingController> _alternativas = [
    for (final alt in _mapas(_mapa(widget.inicial?['versao'])['alternativas']))
      TextEditingController(text: '${alt['rotulo'] ?? ''}'),
    if (_mapas(_mapa(widget.inicial?['versao'])['alternativas']).isEmpty &&
        _tipo != 'sim_nao')
      TextEditingController(),
  ];
  bool _salvando = false;
  String? _erro;
  final Map<TextEditingController, String> _idsAlternativas = {};
  List<Map<String, dynamic>> _semelhantes = const [];

  @override
  void initState() {
    super.initState();
    final anteriores = _mapas(_mapa(widget.inicial?['versao'])['alternativas']);
    for (var i = 0; i < anteriores.length; i++) {
      _idsAlternativas[_alternativas[i]] = '${anteriores[i]['id']}';
    }
    _nome.addListener(_atualizarSemelhantes);
  }

  Future<void> _atualizarSemelhantes() async {
    final nome = _nome.text.trim();
    if (nome.length < 3) {
      if (_semelhantes.isNotEmpty) setState(() => _semelhantes = const []);
      return;
    }
    try {
      final lista = await widget.api.criteriosMatchingSemelhantes(
        nome,
        excetoId: (widget.inicial?['id'] as num?)?.toInt(),
      );
      if (mounted) setState(() => _semelhantes = lista);
    } catch (_) {
      if (mounted) setState(() => _semelhantes = const []);
    }
  }

  @override
  void dispose() {
    _nome.removeListener(_atualizarSemelhantes);
    _nome.dispose();
    _descricao.dispose();
    _enunciado.dispose();
    for (final c in _alternativas) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _salvar() async {
    if (_salvando) return;
    setState(() {
      _salvando = true;
      _erro = null;
    });
    final corpo = <String, dynamic>{
      'nome': _nome.text.trim(),
      'descricao': _descricao.text.trim().isEmpty
          ? null
          : _descricao.text.trim(),
      'enunciadoPadrao': _enunciado.text.trim(),
      'tipo': _tipo,
      'ativo': _ativo,
      if (_tipo != 'sim_nao')
        'alternativas': [
          for (final c in _alternativas)
            if (c.text.trim().isNotEmpty)
              {
                if (_idsAlternativas[c] != null) 'id': _idsAlternativas[c],
                'rotulo': c.text.trim(),
              },
        ],
    };
    try {
      final id = (widget.inicial?['id'] as num?)?.toInt();
      if (id == null) {
        await widget.api.criarCriterioMatching(corpo);
      } else {
        await widget.api.atualizarCriterioMatching(id, corpo);
      }
      if (mounted) Navigator.pop(context, true);
    } catch (erro) {
      if (mounted) {
        setState(() {
          _salvando = false;
          _erro = mensagemDeErro(erro);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          0,
          20,
          MediaQuery.viewInsetsOf(context).bottom + 20,
        ),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                widget.inicial == null ? 'Novo critério' : 'Editar critério',
                style: const TextStyle(
                  fontFamily: 'Poppins',
                  fontWeight: FontWeight.w800,
                  fontSize: 20,
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _nome,
                decoration: const InputDecoration(labelText: 'Nome'),
              ),
              if (_semelhantes.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  'Definições semelhantes (não serão fundidas): '
                  '${_semelhantes.map((s) => s['nome']).join('; ')}.',
                  style: TextStyle(color: Colors.orange.shade800, fontSize: 13),
                ),
              ],
              TextField(
                controller: _descricao,
                decoration: const InputDecoration(labelText: 'Descrição'),
              ),
              TextField(
                controller: _enunciado,
                decoration: const InputDecoration(
                  labelText: 'Enunciado padrão',
                ),
              ),
              DropdownButtonFormField<String>(
                initialValue: _tipo,
                decoration: const InputDecoration(labelText: 'Tipo'),
                items: const [
                  DropdownMenuItem(value: 'sim_nao', child: Text('Sim / Não')),
                  DropdownMenuItem(
                    value: 'escolha_unica',
                    child: Text('Escolha única'),
                  ),
                  DropdownMenuItem(
                    value: 'multipla_escolha',
                    child: Text('Múltipla escolha'),
                  ),
                ],
                onChanged: (valor) => setState(() {
                  _tipo = valor ?? _tipo;
                  if (_tipo == 'sim_nao') {
                    for (final c in _alternativas) {
                      c.dispose();
                    }
                    _alternativas.clear();
                  } else if (_alternativas.isEmpty) {
                    _alternativas.add(TextEditingController());
                  }
                }),
              ),
              if (_tipo != 'sim_nao') ...[
                const SizedBox(height: 8),
                const Text(
                  'Alternativas',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
                for (final (i, c) in _alternativas.indexed)
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: c,
                          decoration: InputDecoration(
                            labelText: 'Alternativa ${i + 1}',
                          ),
                        ),
                      ),
                      IconButton(
                        onPressed: _alternativas.length <= 1
                            ? null
                            : () => setState(() {
                                _alternativas.removeAt(i).dispose();
                              }),
                        icon: const Icon(Icons.delete_outline),
                      ),
                    ],
                  ),
                TextButton.icon(
                  onPressed: () => setState(
                    () => _alternativas.add(TextEditingController()),
                  ),
                  icon: const Icon(Icons.add),
                  label: const Text('Alternativa'),
                ),
              ],
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _ativo,
                title: const Text('Critério ativo'),
                onChanged: (v) => setState(() => _ativo = v),
              ),
              if (_erro != null)
                Text(_erro!, style: const TextStyle(color: corErroCoord)),
              const SizedBox(height: 8),
              FilledButton(
                onPressed: _salvando ? null : _salvar,
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  minimumSize: const Size.fromHeight(48),
                ),
                child: Text(_salvando ? 'Salvando…' : 'Salvar'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class TelaComparacaoMatching extends StatefulWidget {
  const TelaComparacaoMatching({
    super.key,
    required this.api,
    required this.id,
  });

  final CoordenacaoApi api;
  final int id;

  @override
  State<TelaComparacaoMatching> createState() => _TelaComparacaoMatchingState();
}

class _TelaComparacaoMatchingState extends State<TelaComparacaoMatching> {
  Map<String, dynamic>? _dados;
  String? _erro;
  bool _carregando = true;
  bool _decidindo = false;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  Future<void> _carregar() async {
    try {
      final dados = await widget.api.sugestaoMatching(widget.id);
      if (mounted) {
        setState(() {
          _dados = dados;
          _erro = null;
          _carregando = false;
        });
      }
    } catch (erro) {
      if (mounted) {
        setState(() {
          _erro = mensagemDeErro(erro);
          _carregando = false;
        });
      }
    }
  }

  Future<void> _aprovar() async {
    final dados = _dados;
    if (dados == null) return;
    final padrinho = _mapa(dados['padrinho']);
    final apadrinhado = _mapa(dados['apadrinhado']);
    final confirmou = await confirmarAcaoCoord(
      context,
      titulo: 'Confirmar este match?',
      mensagem:
          'Será criado o vínculo entre ${_nome(padrinho)} e '
          '${_nome(apadrinhado)}. O servidor revalidará elegibilidade e capacidade.',
      confirmar: 'Confirmar match',
    );
    if (!confirmou || !mounted) return;
    setState(() => _decidindo = true);
    try {
      final resposta = await widget.api.aprovarSugestaoMatching(widget.id);
      if (!mounted) return;
      final chat = _mapa(resposta['chat']);
      mostrarMensagemCoord(
        context,
        chat['criado'] == true
            ? 'Match aprovado. Conversa privada criada.'
            : 'Match aprovado.',
      );
      Navigator.pop(context, true);
    } catch (erro) {
      if (mounted) {
        setState(() {
          _erro = mensagemDeErro(erro);
          _decidindo = false;
        });
        await _carregar();
      }
    }
  }

  Future<void> _recusar() async {
    var motivo = '';
    final confirmou = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Recusar sugestão?'),
          content: TextField(
            maxLength: 1000,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'Motivo administrativo (opcional)',
              helperText: 'O par ficará fora das rodadas até uma reconsideração explícita.',
              helperMaxLines: 3,
            ),
            onChanged: (valor) => motivo = valor,
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: corErroCoord),
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Confirmar recusa'),
            ),
          ],
        ),
      ),
    );
    if (confirmou != true || !mounted) return;
    setState(() => _decidindo = true);
    try {
      await widget.api.recusarSugestaoMatching(
        widget.id,
        motivo: motivo.trim().isEmpty ? null : motivo.trim(),
      );
      if (!mounted) return;
      mostrarMensagemCoord(context, 'Sugestão recusada.');
      Navigator.pop(context, true);
    } catch (erro) {
      if (mounted) {
        setState(() {
          _erro = mensagemDeErro(erro);
          _decidindo = false;
        });
        await _carregar();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final dados = _dados;
    return Scaffold(
      backgroundColor: corFundoCoord,
      appBar: AppBar(
        title: const Text('Comparar candidatos'),
        backgroundColor: Colors.white,
      ),
      body: _carregando
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.primary),
            )
          : dados == null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(_erro ?? 'Não foi possível abrir a sugestão.'),
                    FilledButton(
                      onPressed: _carregar,
                      child: const Text('Tentar novamente'),
                    ),
                  ],
                ),
              ),
            )
          : _conteudo(dados),
    );
  }

  Widget _conteudo(Map<String, dynamic> dados) {
    final padrinho = _mapa(dados['padrinho']);
    final apadrinhado = _mapa(dados['apadrinhado']);
    final capacidade = _mapa(dados['capacidade']);
    final capP = _mapa(capacidade['padrinho']);
    final capA = _mapa(capacidade['apadrinhado']);
    final explicacao = _mapa(dados['explicacao']);
    final criterios = _mapas(explicacao['criterios']);
    final pendente =
        dados['status'] == 'pendente' && dados['podeAprovar'] != false;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: _PessoaMatching(titulo: 'Padrinho', pessoa: padrinho),
            ),
            const Padding(
              padding: EdgeInsets.only(top: 42),
              child: Icon(Icons.link, color: AppColors.primary),
            ),
            Expanded(
              child: _PessoaMatching(
                titulo: 'Apadrinhado',
                pessoa: apadrinhado,
              ),
            ),
          ],
        ),
        ValidadeSugestaoMatching(dados: dados),
        HistoricoParMatching(eventos: _mapas(dados['historicoPar'])),
        Card(
          color: Colors.white,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${explicacao['politicaVersao'] == null ? 'Compatibilidade' : 'Aderência comprovada'} ${_percentual(explicacao['score'] ?? dados['score'])}',
                  style: const TextStyle(
                    fontFamily: 'Poppins',
                    fontWeight: FontWeight.w800,
                    fontSize: 17,
                  ),
                ),
                const Text(
                  'O score descreve o cálculo configurado; não é probabilidade de sucesso.',
                  style: TextStyle(
                    fontSize: 12,
                    color: corTextoSecundarioCoord,
                  ),
                ),
                IndicadoresCompatibilidade(explicacao: explicacao),
                const Divider(),
                Text(
                  'Capacidade: padrinho ${capP['restante'] ?? '—'}/${capP['limite'] ?? '—'} restante(s) · '
                  'apadrinhado ${capA['restante'] ?? '—'}/${capA['limite'] ?? '—'} restante(s).',
                ),
                for (final criterio in criterios) ...[
                  const Divider(),
                  Text(
                    '${criterio['rotuloPadrinho'] ?? criterio['nomePadrinho'] ?? criterio['campoPadrinho']} '
                    '↔ ${criterio['rotuloApadrinhado'] ?? criterio['nomeApadrinhado'] ?? criterio['campoApadrinhado']}',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  Text(
                    criterio['considerado'] != true
                        ? (criterio['motivo'] == 'sem_preferencia'
                              ? 'Sem preferência declarada.'
                              : criterio['motivo'] == 'vivencia_nao_aplicavel'
                              ? 'Vivência não aplicável ao par.'
                              : 'Não considerado: dados insuficientes.')
                        : '${(criterio['atendimento'] as num? ?? 0) > 0 && (criterio['atendimento'] as num? ?? 1) < 1
                                  ? 'Parcialmente atendida'
                                  : criterio['compativel'] == true
                                  ? 'Compatível'
                                  : (criterio['fator'] as num? ?? 0) > 0
                                  ? 'Parcialmente atendida'
                                  : 'Sem correspondência'} · '
                              'contribuição ${criterio['contribuicao']}/${criterio['peso']}${criterio['obrigatorio'] == true ? ' · Correspondência obrigatória' : ''}',
                    style: TextStyle(
                      color: criterio['compativel'] == true
                          ? AppAccents.success
                          : corTextoSecundarioCoord,
                    ),
                  ),
                  if (criterio['considerado'] == true)
                    Text(
                      'Padrinho: ${_valorCriterio(criterio['valorPadrinho'])} · '
                      'Apadrinhado: ${_valorCriterio(criterio['valorApadrinhado'])}',
                      style: const TextStyle(fontSize: 11),
                    ),
                ],
              ],
            ),
          ),
        ),
        _Aviso(
          icone: Icons.chat_bubble_outline,
          cor: AppAccents.iconeLaranja,
          titulo: 'Conversa privada',
          descricao: dados['status'] == 'aprovada'
              ? 'A conversa privada do vínculo foi criada.'
              : 'A conversa privada será criada junto com a aprovação do vínculo.',
        ),
        if (dados['status'] != 'pendente' && dados['status'] != 'obsoleta')
          _Aviso(
            icone: Icons.fact_check_outlined,
            cor: AppColors.primary,
            titulo: 'Decisão: ${dados['status']}',
            descricao:
                'Por ${dados['decididaPor'] ?? '—'}'
                '${dados['motivoDecisao'] == null ? '' : ' · ${dados['motivoDecisao']}'}',
          ),
        if (_erro != null)
          Text(_erro!, style: const TextStyle(color: corErroCoord)),
        if (pendente)
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _decidindo ? null : _recusar,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: corErroCoord,
                  ),
                  child: const Text('Recusar'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton(
                  onPressed: _decidindo ? null : _aprovar,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                  ),
                  child: Text(_decidindo ? 'Registrando…' : 'Aprovar match'),
                ),
              ),
            ],
          ),
      ],
    );
  }

  String _valorCriterio(Object? valor) {
    final preferencia = PreferenciaGenero.fromJson(valor);
    if (preferencia != null) return preferencia.descricao;
    if (valor is bool) return valor ? 'Sim' : 'Não';
    return valor is List ? valor.join(', ') : '${valor ?? 'Não informado'}';
  }
}

class _PessoaMatching extends StatelessWidget {
  const _PessoaMatching({required this.titulo, required this.pessoa});

  final String titulo;
  final Map<String, dynamic> pessoa;

  @override
  Widget build(BuildContext context) {
    final respostas = _mapa(pessoa['respostas']);
    return Card(
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              titulo.toUpperCase(),
              style: const TextStyle(
                color: AppColors.primary,
                fontSize: 10,
                fontWeight: FontWeight.w700,
              ),
            ),
            Text(
              _nome(pessoa),
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            Text(
              '${pessoa['curso'] ?? respostas['curso'] ?? 'Curso não informado'}',
              style: const TextStyle(fontSize: 11),
            ),
            Text(
              'Período ${pessoa['periodo'] ?? respostas['periodo'] ?? '—'}',
              style: const TextStyle(fontSize: 11),
            ),
            Text(
              'Candidatura: ${pessoa['status'] ?? '—'}',
              style: const TextStyle(fontSize: 11),
            ),
            Text(
              'Programa: ${pessoa['programa'] ?? '—'}',
              style: const TextStyle(fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }
}
