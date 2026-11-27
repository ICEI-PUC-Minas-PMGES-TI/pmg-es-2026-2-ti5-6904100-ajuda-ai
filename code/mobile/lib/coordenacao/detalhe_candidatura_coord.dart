import 'package:flutter/material.dart';

import '../models/preferencia_genero.dart';

import '../services/coordenacao_api.dart';
import '../theme/colors.dart';
import 'componentes_coord.dart';

/// Abre o detalhe completo (p24, bottom sheet) de uma candidatura ou de um
/// apadrinhado. Retorna `true` se algo foi alterado (para recarregar a lista).
Future<bool> mostrarDetalheCandidatura(
  BuildContext context, {
  required CoordenacaoApi api,
  required Map<String, dynamic> item,
  String? programa,
}) async {
  var alterado = false;
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    backgroundColor: Colors.white,
    builder: (_) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.9,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (context, controller) => _DetalheCandidatura(
        api: api,
        resumo: item,
        programa: programa,
        controller: controller,
        onAlterado: () => alterado = true,
      ),
    ),
  );
  return alterado;
}

class _DetalheCandidatura extends StatefulWidget {
  const _DetalheCandidatura({
    required this.api,
    required this.resumo,
    required this.controller,
    required this.onAlterado,
    this.programa,
  });

  final CoordenacaoApi api;
  final Map<String, dynamic> resumo;
  final ScrollController controller;
  final VoidCallback onAlterado;
  final String? programa;

  @override
  State<_DetalheCandidatura> createState() => _DetalheCandidaturaState();
}

class _DetalheCandidaturaState extends State<_DetalheCandidatura> {
  Map<String, dynamic>? _detalhe;
  String? _erro;
  bool _processando = false;
  final _observacoes = TextEditingController();

  int? get _id => idDe(widget.resumo);

  Map<String, dynamic> get _dados => _detalhe ?? widget.resumo;

  Map<String, dynamic> get _respostas => _dados['respostas'] is Map
      ? Map<String, dynamic>.from(_dados['respostas'] as Map)
      : const {};

  bool get _ehApadrinhado => _dados['papel'] == 'apadrinhado';
  bool get _ehCandidato => _dados['papel'] == 'candidato';

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  @override
  void dispose() {
    _observacoes.dispose();
    super.dispose();
  }

  Future<void> _carregar() async {
    final id = _id;
    if (id == null) return;
    try {
      final detalhe = await widget.api.candidatura(id);
      if (!mounted) return;
      setState(() {
        _detalhe = detalhe;
        _erro = null;
        _observacoes.text = '${detalhe['observacoes'] ?? ''}';
      });
    } catch (erro) {
      if (mounted) setState(() => _erro = mensagemDeErro(erro));
    }
  }

  Future<void> _executar(
    Future<Map<String, dynamic>> Function(int id) acao,
    String sucesso,
  ) async {
    final id = _id;
    if (id == null || _processando) return;
    setState(() => _processando = true);
    try {
      final atualizado = await acao(id);
      if (!mounted) return;
      widget.onAlterado();
      setState(() {
        if (atualizado.isNotEmpty) _detalhe = atualizado;
        _processando = false;
      });
      mostrarMensagemCoord(context, sucesso);
    } catch (erro) {
      if (!mounted) return;
      setState(() => _processando = false);
      mostrarMensagemCoord(context, mensagemDeErro(erro));
    }
  }

  Future<void> _aprovar() async {
    final ok = await confirmarAcaoCoord(
      context,
      titulo: 'Aprovar candidatura',
      mensagem:
          '${_dados['nome']} terá candidatura aprovada e aguardará matching. As atividades dependem de vínculo confirmado.',
      confirmar: 'Aprovar',
    );
    if (ok) {
      await _executar(widget.api.aprovarCandidatura, 'Candidatura aprovada.');
    }
  }

  Future<void> _rejeitar() async {
    final justificativa = await solicitarJustificativaCoord(context);
    if (justificativa == null || !mounted) return;
    await _executar(
      (id) => widget.api.rejeitarCandidatura(id, justificativa: justificativa),
      'Candidatura rejeitada.',
    );
  }

  Future<void> _salvarObservacoes() => _executar(
    (id) => widget.api.atualizarCandidatura(
      id,
      observacoes: _observacoes.text.trim(),
    ),
    'Observações salvas.',
  );

  Future<void> _definirPadrinho() async {
    final id = _id;
    if (id == null) return;
    final ok = await definirPadrinhoCoord(
      context,
      api: widget.api,
      apadrinhadoId: id,
      nomeApadrinhado: '${_dados['nome'] ?? 'o apadrinhado'}',
      programa: widget.programa ?? _dados['programa'] as String?,
    );
    if (ok) {
      widget.onAlterado();
      await _carregar();
    }
  }

  Future<void> _desvincular() async {
    final id = _id;
    if (id == null || _processando) return;
    final ok = await confirmarAcaoCoord(
      context,
      titulo: 'Desfazer vínculo?',
      mensagem:
          'O apadrinhado voltará a aguardar matching sem padrinho definido.',
      confirmar: 'Desfazer vínculo',
      destrutiva: true,
    );
    if (!ok || !mounted) return;
    setState(() => _processando = true);
    try {
      await widget.api.desvincularCandidatura(id);
      if (!mounted) return;
      widget.onAlterado();
      mostrarMensagemCoord(context, 'Vínculo desfeito.');
      await _carregar();
    } catch (erro) {
      if (!mounted) return;
      mostrarMensagemCoord(context, mensagemDeErro(erro));
    } finally {
      if (mounted) setState(() => _processando = false);
    }
  }

  static String _lista(Object? valor) =>
      valor is List && valor.isNotEmpty ? valor.join(', ') : 'Não informado';

  static String _simNao(Object? valor) => switch (valor) {
    true => 'Sim',
    false => 'Não',
    _ => 'Não informado',
  };

  static String _texto(Object? valor) =>
      valor is String && valor.trim().isNotEmpty ? valor : 'Não informado';

  List<(IconData, String, String)> _itens() {
    final r = _respostas;
    final comuns = [
      (
        Icons.schedule,
        'Disponibilidade de horários',
        _lista(r['disponibilidade']),
      ),
      (Icons.person_outline, 'Gênero', _texto(r['genero'])),
      (
        Icons.person_outline,
        'Preferência de gênero',
        PreferenciaGenero.fromJson(r['preferenciaGenero'])?.descricao ??
            'Não informado',
      ),
      (
        Icons.school_outlined,
        'É bolsista ProUni?',
        _simNao(r['bolsistaProuni']),
      ),
      (Icons.home_outlined, 'É de outra cidade?', _simNao(r['deOutraCidade'])),
    ];
    if (_ehApadrinhado) {
      return [
        (
          Icons.chat_bubble_outline,
          'O que espera do padrinho',
          _texto(r['expectativa']),
        ),
        (Icons.layers_outlined, 'Áreas em que quer apoio', _lista(r['areas'])),
        ...comuns,
        (
          Icons.description_outlined,
          'Outras informações',
          _texto(r['outrasInformacoes']),
        ),
        (Icons.groups_outlined, 'Grupo', '${_dados['grupo'] ?? 'Sem vínculo'}'),
      ];
    }
    return [
      (
        Icons.chat_bubble_outline,
        'Motivo para ser padrinho',
        _texto(r['motivacao']),
      ),
      (
        Icons.work_outline,
        'Experiências relevantes',
        _texto(r['experiencias']),
      ),
      (Icons.layers_outlined, 'Áreas em que pode ajudar', _lista(r['areas'])),
      ...comuns,
    ];
  }

  @override
  Widget build(BuildContext context) {
    final dados = _dados;
    final extras = _respostas['extras'] is Map
        ? Map<String, dynamic>.from(_respostas['extras'] as Map)
        : const <String, dynamic>{};
    final historico = (dados['historico'] as List? ?? const [])
        .whereType<Map>()
        .toList();
    final aprovado =
        dados['status'] == 'aprovado' ||
        dados['papel'] == 'padrinho' ||
        (_ehApadrinhado && dados['status'] == 'em_andamento');
    final rejeitado = dados['status'] == 'nao_aprovado';

    return Column(
      children: [
        Expanded(
          child: ListView(
            controller: widget.controller,
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AvatarCoord(item: dados, raio: 30),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${dados['nome'] ?? ''}',
                          style: const TextStyle(
                            fontFamily: 'Poppins',
                            fontWeight: FontWeight.w800,
                            fontSize: 18,
                            color: AppColors.ink,
                          ),
                        ),
                        Text(
                          [
                            if (dados['periodo'] != null)
                              '${dados['periodo']}º período',
                            '${dados['curso'] ?? ''}',
                          ].join(' • '),
                          style: const TextStyle(
                            color: corTextoSecundarioCoord,
                            fontSize: 12,
                          ),
                        ),
                        Text(
                          '${_ehApadrinhado ? 'Cadastro' : 'Candidatura'} em '
                          '${formatarDataCoord(dados['criadoEm'])}',
                          style: const TextStyle(
                            color: corTextoSecundarioCoord,
                            fontSize: 12,
                          ),
                        ),
                        const SizedBox(height: 6),
                        SeloStatusCoord(item: dados),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Fechar',
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              if (_erro != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(
                    _erro!,
                    style: const TextStyle(color: corErroCoord),
                  ),
                ),
              if (_detalhe == null && _erro == null)
                const LinearProgressIndicator(color: AppColors.primary),
              for (final (icone, titulo, valor) in _itens())
                _ItemDetalhe(icone: icone, titulo: titulo, valor: valor),
              if (_ehApadrinhado)
                _ItemDetalhe(
                  icone: Icons.verified_user_outlined,
                  titulo: 'Declaração de 1º período',
                  valor: _respostas['declaraPrimeiroPeriodo'] == true
                      ? 'Declarado'
                      : 'Envio legado — confira no sistema da faculdade',
                ),
              () {
                final form = dados['formularioRespondido'];
                if (form is! Map) {
                  return _ItemDetalhe(
                    icone: Icons.dynamic_form_outlined,
                    titulo: 'Formulário respondido',
                    valor: 'Sem versão registrada',
                  );
                }
                return _ItemDetalhe(
                  icone: Icons.dynamic_form_outlined,
                  titulo: 'Formulário respondido',
                  valor:
                      'v${form['versao'] ?? '—'} · ${form['programa'] ?? dados['programa'] ?? ''}',
                );
              }(),
              () {
                final decisao = dados['decisao'];
                if (decisao is! Map) return const SizedBox.shrink();
                return _ItemDetalhe(
                  icone: Icons.history,
                  titulo: 'Registro da verificação',
                  valor: [
                    decisao['resultado'] == 'aprovado'
                        ? 'Aprovado'
                        : 'Não aprovado',
                    if (decisao['em'] != null)
                      'em ${formatarDataCoord(decisao['em'])}',
                    if (decisao['por'] != null) 'por ${decisao['por']}',
                    if (decisao['justificativa'] != null)
                      'Justificativa: ${decisao['justificativa']}',
                  ].join(' · '),
                );
              }(),
              for (final MapEntry(:key, :value) in extras.entries)
                _ItemDetalhe(
                  icone: Icons.help_outline,
                  titulo: 'Pergunta adicional ($key)',
                  valor: value is List ? value.join(', ') : '$value',
                ),
              if (!_ehApadrinhado) ...[
                const SizedBox(height: 6),
                Text(
                  'Requisitos do ciclo ${dados['programa'] ?? ''} e declaração',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink,
                  ),
                ),
                const SizedBox(height: 4),
                RequisitosDeclaradosCoord(
                  // detalhe: foto respondida ou requisitos do ciclo DA
                  // candidatura (registros antigos)
                  requisitos:
                      (dados['requisitos'] ?? _respostas['requisitos'])
                          as List?,
                  respondidos:
                      dados['requisitosRespondidos'] == true ||
                      _respostas['requisitos'] is List,
                  legado: _respostas['declaraPreRequisitos'] == true,
                  periodo: (dados['periodo'] as num?)?.toInt(),
                ),
              ],
              if (historico.isNotEmpty ||
                  dados['jaFoiApadrinhadoEm'] != null) ...[
                const SizedBox(height: 10),
                Text(
                  [
                    if (dados['numeroCandidatura'] != null)
                      '${dados['numeroCandidatura']}ª candidatura',
                    if (dados['jaFoiApadrinhadoEm'] != null)
                      'já foi apadrinhado(a) em ${dados['jaFoiApadrinhadoEm']}',
                    for (final h in historico)
                      '${h['programa']}: ${h['statusRotulo'] ?? h['status']}',
                  ].join(' · '),
                  style: const TextStyle(
                    color: corTextoSecundarioCoord,
                    fontSize: 12,
                  ),
                ),
              ],
              if (!_ehApadrinhado) ...[
                const SizedBox(height: 14),
                const Text(
                  'Observações da coordenação',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink,
                  ),
                ),
                const SizedBox(height: 6),
                TextField(
                  controller: _observacoes,
                  minLines: 2,
                  maxLines: 4,
                  decoration: InputDecoration(
                    hintText: 'Anotações internas sobre a candidatura',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: _processando || _detalhe == null
                        ? null
                        : _salvarObservacoes,
                    child: const Text('Salvar observações'),
                  ),
                ),
              ],
            ],
          ),
        ),
        if (_ehApadrinhado || (_ehCandidato && !aprovado && !rejeitado))
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: _ehApadrinhado
                  ? Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (dados['grupo'] == null)
                          FilledButton.icon(
                            onPressed: _processando ? null : _definirPadrinho,
                            icon: const Icon(Icons.link),
                            label: const Text('Definir padrinho'),
                            style: FilledButton.styleFrom(
                              backgroundColor: AppColors.primary,
                              minimumSize: const Size.fromHeight(48),
                            ),
                          )
                        else
                          TextButton(
                            onPressed: _processando ? null : _desvincular,
                            child: const Text('Desfazer vínculo'),
                          ),
                      ],
                    )
                  : Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: _processando ? null : _rejeitar,
                            icon: const Icon(Icons.close),
                            label: const Text(
                              'Rejeitar',
                              overflow: TextOverflow.ellipsis,
                            ),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: corErroCoord,
                              side: const BorderSide(color: Color(0xFFFCA5A5)),
                              minimumSize: const Size.fromHeight(48),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: FilledButton.icon(
                            onPressed: _processando ? null : _aprovar,
                            icon: const Icon(Icons.check),
                            label: const Text(
                              'Aprovar',
                              overflow: TextOverflow.ellipsis,
                            ),
                            style: FilledButton.styleFrom(
                              backgroundColor: AppColors.primary,
                              minimumSize: const Size.fromHeight(48),
                            ),
                          ),
                        ),
                      ],
                    ),
            ),
          ),
      ],
    );
  }
}

class _ItemDetalhe extends StatelessWidget {
  const _ItemDetalhe({
    required this.icone,
    required this.titulo,
    required this.valor,
  });

  final IconData icone;
  final String titulo;
  final String valor;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppAccents.cardBorder),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 16,
            backgroundColor: AppColors.lavender,
            child: Icon(icone, size: 17, color: AppColors.primary),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  titulo,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                    color: AppColors.ink,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  valor,
                  style: const TextStyle(
                    color: corTextoSecundarioCoord,
                    fontSize: 12,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
