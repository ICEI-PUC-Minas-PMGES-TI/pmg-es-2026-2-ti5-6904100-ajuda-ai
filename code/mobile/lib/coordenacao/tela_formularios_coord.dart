import 'package:flutter/material.dart';

import '../models/formulario.dart';
import '../services/coordenacao_api.dart';
import '../theme/colors.dart';
import '../widgets/perguntas_adicionais.dart';
import 'componentes_coord.dart';

/// Gerenciador de Formulários (p01): perguntas adicionais dos formulários de
/// apadrinhado e de padrinho.
class TelaFormulariosCoord extends StatelessWidget {
  const TelaFormulariosCoord({super.key, required this.api, this.programa});

  final CoordenacaoApi api;
  final String? programa;

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        backgroundColor: corFundoCoord,
        body: SafeArea(
          child: Column(
            children: [
              const CabecalhoCoord(
                voltar: true,
                titulo: 'Gerenciador de Formulários',
                subtitulo:
                    'Configure as perguntas adicionais de cada formulário do '
                    'programa.',
              ),
              const TabBar(
                labelColor: AppColors.primary,
                indicatorColor: AppColors.primary,
                tabs: [
                  Tab(text: 'Apadrinhados'),
                  Tab(text: 'Padrinhos'),
                ],
              ),
              Expanded(
                child: TabBarView(
                  children: [
                    EditorFormularioCoord(
                      api: api,
                      tipo: 'apadrinhado',
                      programa: programa,
                    ),
                    EditorFormularioCoord(
                      api: api,
                      tipo: 'padrinho',
                      programa: programa,
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

class _PerguntaEditavel {
  _PerguntaEditavel(PerguntaFormulario pergunta)
    : id = pergunta.id,
      enunciado = TextEditingController(text: pergunta.enunciado),
      tipo = pergunta.tipo,
      tipoOriginal = pergunta.tipoOriginal,
      opcoes = [
        for (final opcao in pergunta.opcoes) TextEditingController(text: opcao),
      ],
      obrigatoria = pergunta.obrigatoria;

  final String id;
  final TextEditingController enunciado;
  TipoPergunta tipo;
  final String? tipoOriginal;
  final List<TextEditingController> opcoes;
  bool obrigatoria;

  PerguntaFormulario paraModelo() => PerguntaFormulario(
    id: id,
    enunciado: enunciado.text.trim(),
    tipo: tipo,
    tipoOriginal: tipo.suportado ? null : tipoOriginal,
    opcoes: tipo.temOpcoes
        ? [
            for (final opcao in opcoes)
              if (opcao.text.trim().isNotEmpty) opcao.text.trim(),
          ]
        : const [],
    obrigatoria: obrigatoria,
  );

  void descartar() {
    enunciado.dispose();
    for (final opcao in opcoes) {
      opcao.dispose();
    }
  }
}

class EditorFormularioCoord extends StatefulWidget {
  const EditorFormularioCoord({
    super.key,
    required this.api,
    required this.tipo,
    this.programa,
  });

  final CoordenacaoApi api;

  /// `apadrinhado` | `padrinho`.
  final String tipo;
  final String? programa;

  @override
  State<EditorFormularioCoord> createState() => _EditorFormularioCoordState();
}

class _EditorFormularioCoordState extends State<EditorFormularioCoord>
    with AutomaticKeepAliveClientMixin {
  final List<_PerguntaEditavel> _perguntas = [];
  bool _publicado = false;
  bool _salvo = true;
  String? _programa;
  bool _carregando = true;
  bool _salvando = false;
  String? _erro;

  @override
  bool get wantKeepAlive => true;

  String get _nomeTipo =>
      widget.tipo == 'padrinho' ? 'Padrinhos' : 'Apadrinhados';

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  @override
  void dispose() {
    for (final pergunta in _perguntas) {
      pergunta.descartar();
    }
    super.dispose();
  }

  void _aplicar(Formulario formulario) {
    for (final pergunta in _perguntas) {
      pergunta.descartar();
    }
    _perguntas
      ..clear()
      ..addAll(formulario.perguntas.map(_PerguntaEditavel.new));
    _publicado = formulario.publicado;
    _salvo = formulario.salvo;
    _programa = formulario.programa ?? widget.programa;
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _erro = null;
    });
    try {
      final formulario = await widget.api.formulario(
        widget.tipo,
        programa: widget.programa,
      );
      if (!mounted) return;
      setState(() {
        _aplicar(formulario);
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

  List<PerguntaFormulario> get _modelo => [
    for (final pergunta in _perguntas) pergunta.paraModelo(),
  ];

  Future<void> _salvar() async {
    if (_salvando) return;
    if (_modelo.any((p) => !p.tipo.suportado)) {
      mostrarMensagemCoord(
        context,
        'Tipo não suportado: remova ou substitua a pergunta antes de salvar ou publicar.',
      );
      return;
    }
    setState(() => _salvando = true);
    try {
      final salvo = await widget.api.salvarFormulario(
        widget.tipo,
        programa: _programa,
        publicado: _publicado,
        perguntas: _modelo,
      );
      if (!mounted) return;
      setState(() {
        _aplicar(salvo);
        _salvando = false;
      });
      mostrarMensagemCoord(
        context,
        _publicado
            ? 'Formulário salvo e publicado para os ${_nomeTipo.toLowerCase()}.'
            : 'Formulário salvo como rascunho.',
      );
    } catch (erro) {
      if (!mounted) return;
      setState(() => _salvando = false);
      mostrarMensagemCoord(context, mensagemDeErro(erro));
    }
  }

  void _adicionarPergunta() {
    setState(() {
      _perguntas.add(
        _PerguntaEditavel(
          PerguntaFormulario(
            id: 'pergunta-${DateTime.now().microsecondsSinceEpoch}',
            enunciado: '',
            tipo: TipoPergunta.textoCurto,
          ),
        ),
      );
    });
  }

  void _excluir(int indice) {
    setState(() => _perguntas.removeAt(indice).descartar());
  }

  void _mover(int indice, int delta) {
    final destino = indice + delta;
    if (destino < 0 || destino >= _perguntas.length) return;
    setState(() {
      final pergunta = _perguntas.removeAt(indice);
      _perguntas.insert(destino, pergunta);
    });
  }

  void _previa() {
    final respostas = <String, dynamic>{};
    final perguntas = _modelo
        .where((pergunta) => pergunta.enunciado.isNotEmpty)
        .toList();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Colors.white,
      builder: (context) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.8,
        builder: (context, controller) => ListView(
          controller: controller,
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          children: [
            Text(
              'Prévia — formulário de ${_nomeTipo.toLowerCase()}',
              style: const TextStyle(
                fontFamily: 'Poppins',
                fontWeight: FontWeight.w800,
                fontSize: 18,
              ),
            ),
            Text(
              _publicado
                  ? 'Assim o aluno verá as perguntas adicionais.'
                  : 'Rascunho: o aluno só verá estas perguntas após publicar.',
              style: const TextStyle(color: corTextoSecundarioCoord),
            ),
            if (_perguntas.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 24),
                child: Text('Nenhuma pergunta adicional.'),
              ),
            PerguntasAdicionais(perguntas: perguntas, respostas: respostas),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    if (_carregando) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.primary),
      );
    }
    if (_erro != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_erro!, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: _carregar,
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primary,
                ),
                child: const Text('Tentar novamente'),
              ),
            ],
          ),
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      children: [
        Text(
          'Formulário: $_nomeTipo',
          style: const TextStyle(
            fontFamily: 'Poppins',
            fontWeight: FontWeight.w800,
            fontSize: 17,
            color: AppColors.ink,
          ),
        ),
        Text(
          [
            if (_programa != null) 'Programa $_programa',
            if (!_salvo) 'sugestões padrão (ainda não salvo)',
          ].join(' · '),
          style: const TextStyle(fontSize: 12, color: corTextoSecundarioCoord),
        ),
        const SizedBox(height: 8),
        Material(
          color: _publicado ? AppAccents.successBg : Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: const BorderSide(color: AppAccents.cardBorder),
          ),
          child: SwitchListTile(
            value: _publicado,
            activeTrackColor: AppAccents.success,
            title: Text(
              _publicado ? 'Formulário publicado' : 'Rascunho (não publicado)',
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            subtitle: const Text(
              'Publicado: os alunos veem as perguntas no cadastro.',
            ),
            onChanged: (valor) => setState(() => _publicado = valor),
          ),
        ),
        const SizedBox(height: 10),
        for (final (indice, pergunta) in _perguntas.indexed)
          _CardPergunta(
            key: ObjectKey(pergunta),
            numero: indice + 1,
            pergunta: pergunta,
            primeira: indice == 0,
            ultima: indice == _perguntas.length - 1,
            onAlterado: () => setState(() {}),
            onExcluir: () => _excluir(indice),
            onSubir: () => _mover(indice, -1),
            onDescer: () => _mover(indice, 1),
          ),
        OutlinedButton.icon(
          onPressed: _adicionarPergunta,
          icon: const Icon(Icons.add),
          label: const Text('Adicionar nova pergunta'),
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.primary,
            minimumSize: const Size.fromHeight(48),
            side: const BorderSide(color: Color(0xFFB9A6EE)),
          ),
        ),
        const SizedBox(height: 14),
        FilledButton.icon(
          onPressed: _salvando ? null : _salvar,
          icon: const Icon(Icons.save_outlined),
          label: Text(_salvando ? 'Salvando...' : 'Salvar alterações'),
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.primary,
            minimumSize: const Size.fromHeight(50),
          ),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: _previa,
          icon: const Icon(Icons.visibility_outlined),
          label: const Text('Ver prévia do formulário'),
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.primary,
            minimumSize: const Size.fromHeight(48),
          ),
        ),
        TextButton(
          onPressed: _salvando ? null : _carregar,
          child: const Text('Cancelar alterações'),
        ),
        Text(
          'As alterações ficam disponíveis para os ${_nomeTipo.toLowerCase()} '
          'após salvar com o formulário publicado.',
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 12, color: corTextoSecundarioCoord),
        ),
      ],
    );
  }
}

class _CardPergunta extends StatelessWidget {
  const _CardPergunta({
    super.key,
    required this.numero,
    required this.pergunta,
    required this.primeira,
    required this.ultima,
    required this.onAlterado,
    required this.onExcluir,
    required this.onSubir,
    required this.onDescer,
  });

  final int numero;
  final _PerguntaEditavel pergunta;
  final bool primeira;
  final bool ultima;
  final VoidCallback onAlterado;
  final VoidCallback onExcluir;
  final VoidCallback onSubir;
  final VoidCallback onDescer;

  @override
  Widget build(BuildContext context) {
    final borda = OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: const BorderSide(color: AppAccents.cardBorder),
    );
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: const BorderSide(color: AppAccents.cardBorder),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 6, 6, 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Pergunta $numero',
                      style: const TextStyle(
                        color: AppColors.primary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Mover para cima',
                    onPressed: primeira ? null : onSubir,
                    icon: const Icon(Icons.arrow_upward, size: 20),
                  ),
                  IconButton(
                    tooltip: 'Mover para baixo',
                    onPressed: ultima ? null : onDescer,
                    icon: const Icon(Icons.arrow_downward, size: 20),
                  ),
                  IconButton(
                    tooltip: 'Excluir pergunta',
                    onPressed: onExcluir,
                    color: corErroCoord,
                    icon: const Icon(Icons.delete_outline, size: 20),
                  ),
                ],
              ),
              Padding(
                padding: const EdgeInsets.only(right: 6),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    TextField(
                      controller: pergunta.enunciado,
                      decoration: InputDecoration(
                        labelText: 'Enunciado',
                        isDense: true,
                        border: borda,
                        enabledBorder: borda,
                      ),
                    ),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<TipoPergunta>(
                      initialValue: pergunta.tipo.suportado
                          ? pergunta.tipo
                          : null,
                      isExpanded: true,
                      decoration: InputDecoration(
                        labelText: 'Tipo de resposta',
                        isDense: true,
                        border: borda,
                        enabledBorder: borda,
                      ),
                      items: [
                        for (final tipo in TipoPergunta.suportados)
                          DropdownMenuItem(
                            value: tipo,
                            child: Text(tipo.rotulo),
                          ),
                      ],
                      onChanged: (tipo) {
                        if (tipo == null) return;
                        pergunta.tipo = tipo;
                        if (tipo.temOpcoes && pergunta.opcoes.isEmpty) {
                          pergunta.opcoes.add(TextEditingController());
                        }
                        onAlterado();
                      },
                    ),
                    if (pergunta.tipo.temOpcoes) ...[
                      const SizedBox(height: 10),
                      const Text(
                        'Opções',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      for (final (i, opcao) in pergunta.opcoes.indexed)
                        Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Row(
                            children: [
                              Expanded(
                                child: TextField(
                                  controller: opcao,
                                  decoration: InputDecoration(
                                    hintText: 'Opção ${i + 1}',
                                    isDense: true,
                                    border: borda,
                                    enabledBorder: borda,
                                  ),
                                ),
                              ),
                              IconButton(
                                tooltip: 'Excluir opção',
                                color: corErroCoord,
                                onPressed: () {
                                  pergunta.opcoes.removeAt(i).dispose();
                                  onAlterado();
                                },
                                icon: const Icon(
                                  Icons.delete_outline,
                                  size: 20,
                                ),
                              ),
                            ],
                          ),
                        ),
                      TextButton.icon(
                        onPressed: () {
                          pergunta.opcoes.add(TextEditingController());
                          onAlterado();
                        },
                        icon: const Icon(Icons.add, size: 18),
                        label: const Text('Adicionar opção'),
                      ),
                    ],
                    if (!pergunta.tipo.suportado)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(
                          'Tipo não suportado (${pergunta.tipoOriginal ?? "desconhecido"}). Remova ou substitua esta pergunta.',
                        ),
                      ),
                  ],
                ),
              ),
              SwitchListTile(
                dense: true,
                contentPadding: const EdgeInsets.only(right: 6),
                value: pergunta.obrigatoria,
                activeTrackColor: AppColors.primary,
                title: const Text(
                  'Resposta obrigatória',
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
                onChanged: (valor) {
                  pergunta.obrigatoria = valor;
                  onAlterado();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
