import 'package:flutter/material.dart';

import '../models/formulario.dart';
import '../services/coordenacao_api.dart';
import '../theme/colors.dart';
import '../widgets/perguntas_adicionais.dart';
import 'componentes_coord.dart';
import 'tela_matching_coord.dart';
import 'tela_respostas_formulario_coord.dart';

Map<String, dynamic> _mapa(Object? valor) =>
    valor is Map ? Map<String, dynamic>.from(valor) : <String, dynamic>{};

List<Map<String, dynamic>> _mapas(Object? valor) => valor is List
    ? valor
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList()
    : <Map<String, dynamic>>[];

/// Gerenciador de Formulários — paridade com a web (F05 + F06).
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
                    'Monte as perguntas como no Google Forms: arraste para '
                    'reordenar e use lógica condicional.',
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
      ajuda = TextEditingController(text: pergunta.ajuda),
      secao = TextEditingController(text: pergunta.secao),
      tipo = pergunta.tipo,
      tipoOriginal = pergunta.tipoOriginal,
      opcoes = [
        for (final opcao in pergunta.opcoes) TextEditingController(text: opcao),
      ],
      alternativas = List.of(pergunta.alternativas),
      obrigatoria = pergunta.obrigatoria,
      matching = pergunta.matching || pergunta.tipo.matching,
      criterioId = pergunta.criterioId,
      criterioVersao = pergunta.criterioVersao,
      criterioNome = pergunta.criterioNome,
      visivelSe = pergunta.visivelSe;

  final String id;
  final TextEditingController enunciado;
  final TextEditingController ajuda;
  final TextEditingController secao;
  TipoPergunta tipo;
  final String? tipoOriginal;
  final List<TextEditingController> opcoes;
  List<AlternativaPergunta> alternativas;
  bool obrigatoria;
  bool matching;
  int? criterioId;
  int? criterioVersao;
  String? criterioNome;
  CondicaoVisibilidade? visivelSe;

  bool get ehMatching => tipo.matching && criterioId != null;

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
    alternativas: tipo.temAlternativas || tipo == TipoPergunta.simNao
        ? alternativas
        : const [],
    obrigatoria: obrigatoria,
    ajuda: ajuda.text.trim(),
    secao: secao.text.trim(),
    matching: tipo.matching,
    criterioId: criterioId,
    criterioVersao: criterioVersao,
    criterioNome: criterioNome,
    visivelSe: visivelSe,
  );

  void descartar() {
    enunciado.dispose();
    ajuda.dispose();
    secao.dispose();
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
  final String tipo;
  final String? programa;

  @override
  State<EditorFormularioCoord> createState() => _EditorFormularioCoordState();
}

class _EditorFormularioCoordState extends State<EditorFormularioCoord>
    with AutomaticKeepAliveClientMixin {
  final List<_PerguntaEditavel> _perguntas = [];
  bool _publicado = false;
  String _status = 'rascunho';
  int _versao = 0;
  bool _salvo = true;
  String? _programa;
  List<CampoFixoFormulario> _camposFixos = const [];
  List<Map<String, dynamic>> _programas = const [];
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
    _status = formulario.status;
    _versao = formulario.versao;
    _salvo = formulario.salvo;
    _programa = formulario.programa ?? widget.programa;
    _camposFixos = formulario.camposFixos;
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _erro = null;
    });
    try {
      final resultados = await Future.wait([
        widget.api.formulario(widget.tipo, programa: widget.programa),
        widget.api.programas(),
      ]);
      if (!mounted) return;
      setState(() {
        _aplicar(resultados[0] as Formulario);
        _programas = resultados[1] as List<Map<String, dynamic>>;
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

  void _sanitizarCondicoes() {
    final vistos = <String>{};
    for (final pergunta in _perguntas) {
      final condicao = pergunta.visivelSe;
      if (condicao != null && !vistos.contains(condicao.perguntaId)) {
        pergunta.visivelSe = null;
      }
      vistos.add(pergunta.id);
    }
  }

  String? _validarLocal() {
    final anteriores = <String>{};
    for (var i = 0; i < _perguntas.length; i++) {
      final p = _perguntas[i].paraModelo();
      final n = i + 1;
      if (!p.tipo.suportado) {
        return 'Tipo não suportado: remova ou substitua a pergunta $n.';
      }
      if (p.enunciado.isEmpty) return 'A pergunta $n precisa de um enunciado.';
      if (p.tipo.temOpcoes && p.opcoes.isEmpty) {
        return 'A pergunta $n precisa de pelo menos uma opção.';
      }
      if (p.tipo.temOpcoes && p.opcoes.toSet().length != p.opcoes.length) {
        return 'A pergunta $n tem opções repetidas.';
      }
      if (p.tipo.matching) {
        if (p.criterioId == null || p.criterioVersao == null) {
          return 'A pergunta $n de matching precisa de um critério do catálogo.';
        }
        if (p.tipo.temAlternativas && p.alternativas.isEmpty) {
          return 'A pergunta $n precisa das alternativas do critério.';
        }
      }
      final condicao = p.visivelSe;
      if (condicao != null) {
        if (!anteriores.contains(condicao.perguntaId)) {
          return 'A pergunta $n só pode depender de uma pergunta anterior.';
        }
        if (condicao.operador.precisaValor && condicao.valor.trim().isEmpty) {
          return 'A condição da pergunta $n precisa de um valor.';
        }
      }
      anteriores.add(p.id);
    }
    return null;
  }

  Future<void> _salvar() async {
    if (_salvando) return;
    final problema = _validarLocal();
    if (problema != null) {
      mostrarMensagemCoord(context, problema);
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
        switch (salvo.status) {
          'publicado' => 'Formulário salvo e publicado.',
          'encerrado' => 'Alterações salvas. O formulário segue encerrado.',
          _ => 'Formulário salvo como rascunho.',
        },
      );
    } catch (erro) {
      if (!mounted) return;
      setState(() => _salvando = false);
      mostrarMensagemCoord(context, mensagemDeErro(erro));
    }
  }

  void _adicionarPerguntaComum() {
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

  Future<void> _adicionarPerguntaMatching() async {
    try {
      final ativos = await widget.api.criteriosMatchingAtivos();
      if (!mounted) return;
      if (ativos.isEmpty) {
        final ir = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Catálogo vazio'),
            content: const Text(
              'Cadastre critérios em Matching → Critérios. '
              'O rascunho deste formulário permanece nesta tela ao voltar.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Fechar'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Abrir matching'),
              ),
            ],
          ),
        );
        if (ir == true && mounted) {
          await Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => TelaMatchingCoord(
                api: widget.api,
                programa: _programa ?? widget.programa ?? '',
              ),
            ),
          );
        }
        return;
      }
      final usados = {
        for (final p in _perguntas)
          if (p.criterioId != null) p.criterioId!,
      };
      final disponiveis = [
        for (final c in ativos)
          if (!usados.contains((c['id'] as num).toInt())) c,
      ];
      if (disponiveis.isEmpty) {
        mostrarMensagemCoord(
          context,
          'Todos os critérios ativos já estão neste formulário.',
        );
        return;
      }
      final escolhido = await showModalBottomSheet<Map<String, dynamic>>(
        context: context,
        showDragHandle: true,
        builder: (context) => SafeArea(
          child: ListView(
            children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(16, 8, 16, 4),
                child: Text(
                  'Adicionar pergunta de matching',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18),
                ),
              ),
              for (final c in disponiveis)
                ListTile(
                  title: Text('${c['nome']}'),
                  subtitle: Text(
                    '${_mapa(c['versao'])['enunciadoPadrao'] ?? c['descricao'] ?? ''}',
                  ),
                  onTap: () => Navigator.pop(context, c),
                ),
            ],
          ),
        ),
      );
      if (escolhido == null || !mounted) return;
      final versao = _mapa(escolhido['versao']);
      setState(() {
        _perguntas.add(
          _PerguntaEditavel(
            PerguntaFormulario(
              id: 'pergunta-${DateTime.now().microsecondsSinceEpoch}',
              enunciado: '${versao['enunciadoPadrao'] ?? escolhido['nome'] ?? ''}',
              tipo: TipoPergunta.fromApi(versao['tipo']?.toString()),
              alternativas: [
                for (final alt in _mapas(versao['alternativas']))
                  AlternativaPergunta.fromJson(alt),
              ],
              matching: true,
              criterioId: (escolhido['id'] as num).toInt(),
              criterioVersao:
                  (versao['versao'] as num?)?.toInt() ??
                  (escolhido['versaoAtual'] as num?)?.toInt() ??
                  1,
              criterioNome: '${escolhido['nome']}',
            ),
          ),
        );
      });
    } catch (erro) {
      if (mounted) mostrarMensagemCoord(context, mensagemDeErro(erro));
    }
  }

  void _excluir(int indice) {
    setState(() {
      _perguntas.removeAt(indice).descartar();
      _sanitizarCondicoes();
    });
  }

  void _reordenar(int antigo, int novo) {
    setState(() {
      final item = _perguntas.removeAt(antigo);
      _perguntas.insert(novo, item);
      _sanitizarCondicoes();
    });
  }

  Future<void> _encerrar() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Encerrar novas respostas?'),
        content: Text(
          'Os ${_nomeTipo.toLowerCase()} deixam de poder se cadastrar. '
          'As respostas já enviadas são mantidas.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(backgroundColor: corErroCoord),
            child: const Text('Encerrar'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      final encerrado = await widget.api.encerrarFormulario(
        widget.tipo,
        programa: _programa,
      );
      if (!mounted) return;
      setState(() => _aplicar(encerrado));
      mostrarMensagemCoord(context, 'Formulário encerrado.');
    } catch (erro) {
      if (!mounted) return;
      mostrarMensagemCoord(context, mensagemDeErro(erro));
    }
  }

  Future<void> _excluirRascunho() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Excluir rascunho?'),
        content: const Text(
          'O rascunho será apagado e o programa volta às perguntas sugeridas.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(backgroundColor: corErroCoord),
            child: const Text('Excluir'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      final padrao = await widget.api.excluirFormulario(
        widget.tipo,
        programa: _programa,
      );
      if (!mounted) return;
      setState(() => _aplicar(padrao));
      mostrarMensagemCoord(context, 'Rascunho excluído.');
    } catch (erro) {
      if (!mounted) return;
      mostrarMensagemCoord(context, mensagemDeErro(erro));
    }
  }

  Future<void> _duplicar() async {
    final destinos = _programas
        .where((p) => '${p['codigo']}' != _programa)
        .toList();
    if (destinos.isEmpty) {
      mostrarMensagemCoord(context, 'Não há outro programa para duplicar.');
      return;
    }
    String? destino = '${destinos.first['codigo']}';
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: const Text('Duplicar para outro programa'),
          content: DropdownButtonFormField<String>(
            initialValue: destino,
            decoration: const InputDecoration(labelText: 'Programa destino'),
            items: [
              for (final p in destinos)
                DropdownMenuItem(
                  value: '${p['codigo']}',
                  child: Text('${p['nome'] ?? p['codigo']}'),
                ),
            ],
            onChanged: (v) => setLocal(() => destino = v),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Duplicar'),
            ),
          ],
        ),
      ),
    );
    if (ok != true || destino == null || !mounted) return;
    try {
      final copia = await widget.api.duplicarFormulario(
        widget.tipo,
        programaOrigem: _programa!,
        programaDestino: destino!,
      );
      if (!mounted) return;
      mostrarMensagemCoord(
        context,
        'Duplicado como rascunho para ${copia.programa}.',
      );
    } catch (erro) {
      if (!mounted) return;
      mostrarMensagemCoord(context, mensagemDeErro(erro));
    }
  }

  void _previa() {
    final respostas = <String, dynamic>{};
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Colors.white,
      builder: (context) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.85,
        builder: (context, controller) => ListView(
          controller: controller,
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          children: [
            Text(
              'Prévia — ${_nomeTipo.toLowerCase()}',
              style: const TextStyle(
                fontFamily: 'Poppins',
                fontWeight: FontWeight.w800,
                fontSize: 18,
              ),
            ),
            Text(
              _publicado
                  ? 'Assim o aluno verá as perguntas (com lógica condicional).'
                  : 'Rascunho: o aluno só verá após publicar.',
              style: const TextStyle(color: corTextoSecundarioCoord),
            ),
            StatefulBuilder(
              builder: (context, setLocal) => PerguntasAdicionais(
                perguntas: [
                  for (final p in _modelo)
                    if (p.enunciado.isNotEmpty) p,
                ],
                respostas: respostas,
                onChanged: () => setLocal(() {}),
              ),
            ),
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

    final podeExcluir = _salvo && _status == 'rascunho' && _versao == 0;

    return Column(
      children: [
        Expanded(
          child: ReorderableListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
            buildDefaultDragHandles: false,
            onReorderItem: _reordenar,
            header: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
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
                    switch (_status) {
                      'publicado' => 'Publicado',
                      'encerrado' => 'Encerrado',
                      _ => _salvo ? 'Rascunho' : 'Sugerido',
                    },
                    if (_versao > 0) 'versão $_versao',
                  ].join(' · '),
                  style: const TextStyle(
                    fontSize: 12,
                    color: corTextoSecundarioCoord,
                  ),
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
                      _publicado
                          ? 'Publicar para os alunos'
                          : 'Rascunho (não publicado)',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    subtitle: Text(
                      _status == 'encerrado' && !_publicado
                          ? 'Encerrado: publique e salve para reabrir (nova versão).'
                          : 'Publicado: os alunos veem as perguntas no cadastro.',
                    ),
                    onChanged: (valor) => setState(() => _publicado = valor),
                  ),
                ),
                if (_camposFixos.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  ExpansionTile(
                    tilePadding: EdgeInsets.zero,
                    title: Text(
                      'Campos fixos do perfil (${_camposFixos.length})',
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                      ),
                    ),
                    children: [
                      for (final campo in _camposFixos)
                        ListTile(
                          dense: true,
                          title: Text(campo.rotulo),
                          trailing: campo.matching
                              ? const Text(
                                  'matching',
                                  style: TextStyle(
                                    color: AppColors.primary,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                  ),
                                )
                              : null,
                        ),
                    ],
                  ),
                ],
                const SizedBox(height: 8),
                const Text(
                  'Arraste pelo ícone ⋮⋮ para reordenar.',
                  style: TextStyle(fontSize: 12, color: corTextoSecundarioCoord),
                ),
                const SizedBox(height: 8),
              ],
            ),
            children: [
              for (final (indice, pergunta) in _perguntas.indexed)
                _CardPergunta(
                  key: ValueKey(pergunta.id),
                  numero: indice + 1,
                  pergunta: pergunta,
                  anteriores: [
                    for (final (i, p) in _perguntas.indexed)
                      if (i < indice) p.paraModelo(),
                  ],
                  onAlterado: () => setState(_sanitizarCondicoes),
                  onExcluir: () => _excluir(indice),
                  dragIndex: indice,
                ),
            ],
          ),
        ),
        Material(
          color: Colors.white,
          elevation: 6,
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  OutlinedButton.icon(
                    onPressed: _perguntas.length >= 30
                        ? null
                        : _adicionarPerguntaComum,
                    icon: const Icon(Icons.add),
                    label: const Text('Adicionar pergunta comum'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.primary,
                      minimumSize: const Size.fromHeight(44),
                    ),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: _perguntas.length >= 30
                        ? null
                        : _adicionarPerguntaMatching,
                    icon: const Icon(Icons.auto_awesome_outlined),
                    label: const Text('Adicionar pergunta de matching'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.primary,
                      minimumSize: const Size.fromHeight(44),
                    ),
                  ),
                  const SizedBox(height: 8),
                  FilledButton.icon(
                    onPressed: _salvando ? null : _salvar,
                    icon: const Icon(Icons.save_outlined),
                    label: Text(_salvando ? 'Salvando...' : 'Salvar'),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      minimumSize: const Size.fromHeight(48),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    alignment: WrapAlignment.center,
                    children: [
                      TextButton(onPressed: _previa, child: const Text('Prévia')),
                      TextButton(
                        onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => TelaRespostasFormularioCoord(
                              api: widget.api,
                              tipo: widget.tipo,
                              programa: _programa,
                            ),
                          ),
                        ),
                        child: const Text('Respostas'),
                      ),
                      if (_salvo)
                        TextButton(
                          onPressed: _duplicar,
                          child: const Text('Duplicar'),
                        ),
                      if (_status == 'publicado')
                        TextButton(
                          onPressed: _encerrar,
                          child: const Text('Encerrar'),
                        ),
                      if (podeExcluir)
                        TextButton(
                          onPressed: _excluirRascunho,
                          style: TextButton.styleFrom(
                            foregroundColor: corErroCoord,
                          ),
                          child: const Text('Excluir'),
                        ),
                      TextButton(
                        onPressed: _salvando ? null : _carregar,
                        child: const Text('Cancelar'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
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
    required this.anteriores,
    required this.onAlterado,
    required this.onExcluir,
    required this.dragIndex,
  });

  final int numero;
  final _PerguntaEditavel pergunta;
  final List<PerguntaFormulario> anteriores;
  final VoidCallback onAlterado;
  final VoidCallback onExcluir;
  final int dragIndex;

  @override
  Widget build(BuildContext context) {
    final borda = OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: const BorderSide(color: AppAccents.cardBorder),
    );
    PerguntaFormulario? alvo;
    for (final p in anteriores) {
      if (p.id == pergunta.visivelSe?.perguntaId) {
        alvo = p;
        break;
      }
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: const BorderSide(color: AppAccents.cardBorder),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 6, 6, 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  ReorderableDragStartListener(
                    index: dragIndex,
                    child: const Padding(
                      padding: EdgeInsets.all(8),
                      child: Icon(Icons.drag_indicator, color: Colors.black45),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      'Pergunta $numero',
                      style: const TextStyle(
                        color: AppColors.primary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  if (pergunta.ehMatching)
                    Padding(
                      padding: const EdgeInsets.only(right: 4),
                      child: Text(
                        'Critério: ${pergunta.criterioNome ?? '#${pergunta.criterioId}'}',
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: AppAccents.success,
                        ),
                      ),
                    ),
                  if (pergunta.visivelSe != null)
                    const Padding(
                      padding: EdgeInsets.only(right: 4),
                      child: Text(
                        'Condicional',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: AppColors.primary,
                        ),
                      ),
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
                padding: const EdgeInsets.only(left: 8, right: 6),
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
                    const SizedBox(height: 8),
                    TextField(
                      controller: pergunta.ajuda,
                      decoration: InputDecoration(
                        labelText: 'Texto de ajuda (opcional)',
                        isDense: true,
                        border: borda,
                        enabledBorder: borda,
                      ),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: pergunta.secao,
                      decoration: InputDecoration(
                        labelText: 'Seção (opcional)',
                        isDense: true,
                        border: borda,
                        enabledBorder: borda,
                      ),
                    ),
                    const SizedBox(height: 10),
                    if (pergunta.ehMatching)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text(
                          '${pergunta.tipo.rotulo} · versão ${pergunta.criterioVersao}',
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            color: AppColors.muted,
                          ),
                        ),
                      )
                    else
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
                          for (final tipo in TipoPergunta.comuns)
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
                          if (!tipo.temOpcoes) pergunta.matching = false;
                          onAlterado();
                        },
                      ),
                    if (pergunta.ehMatching &&
                        pergunta.alternativas.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      const Text(
                        'Alternativas do critério',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      for (final alt in pergunta.alternativas)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text('• ${alt.rotulo}'),
                        ),
                    ],
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
                    SwitchListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
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
                    if (anteriores.isNotEmpty) ...[
                      SwitchListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        value: pergunta.visivelSe != null,
                        activeTrackColor: AppColors.primary,
                        title: const Text(
                          'Lógica condicional',
                          style: TextStyle(fontWeight: FontWeight.w600),
                        ),
                        subtitle: const Text(
                          'Mostrar só se outra pergunta cumprir a condição.',
                        ),
                        onChanged: (ligado) {
                          if (!ligado) {
                            pergunta.visivelSe = null;
                          } else {
                            pergunta.visivelSe = CondicaoVisibilidade(
                              perguntaId: anteriores.last.id,
                              operador: OperadorCondicao.igual,
                            );
                          }
                          onAlterado();
                        },
                      ),
                      if (pergunta.visivelSe != null) ...[
                        DropdownButtonFormField<String>(
                          initialValue: pergunta.visivelSe!.perguntaId,
                          isExpanded: true,
                          decoration: InputDecoration(
                            labelText: 'Pergunta',
                            isDense: true,
                            border: borda,
                            enabledBorder: borda,
                          ),
                          items: [
                            for (final (i, p) in anteriores.indexed)
                              DropdownMenuItem(
                                value: p.id,
                                child: Text(
                                  '${i + 1}. ${p.enunciado.isEmpty ? '(sem enunciado)' : p.enunciado}',
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                          ],
                          onChanged: (id) {
                            if (id == null) return;
                            pergunta.visivelSe = pergunta.visivelSe!.copyWith(
                              perguntaId: id,
                              valor: '',
                            );
                            onAlterado();
                          },
                        ),
                        const SizedBox(height: 8),
                        DropdownButtonFormField<OperadorCondicao>(
                          initialValue: pergunta.visivelSe!.operador,
                          isExpanded: true,
                          decoration: InputDecoration(
                            labelText: 'Condição',
                            isDense: true,
                            border: borda,
                            enabledBorder: borda,
                          ),
                          items: [
                            for (final op in OperadorCondicao.values)
                              DropdownMenuItem(
                                value: op,
                                child: Text(op.rotulo),
                              ),
                          ],
                          onChanged: (op) {
                            if (op == null) return;
                            pergunta.visivelSe = pergunta.visivelSe!.copyWith(
                              operador: op,
                            );
                            onAlterado();
                          },
                        ),
                        if (pergunta.visivelSe!.operador.precisaValor) ...[
                          const SizedBox(height: 8),
                          if (alvo != null && alvo.tipo.temOpcoes)
                            DropdownButtonFormField<String>(
                              initialValue:
                                  alvo.opcoes.contains(
                                    pergunta.visivelSe!.valor,
                                  )
                                  ? pergunta.visivelSe!.valor
                                  : null,
                              isExpanded: true,
                              decoration: InputDecoration(
                                labelText: 'Valor',
                                isDense: true,
                                border: borda,
                                enabledBorder: borda,
                              ),
                              items: [
                                for (final opcao in alvo.opcoes)
                                  DropdownMenuItem(
                                    value: opcao,
                                    child: Text(opcao),
                                  ),
                              ],
                              onChanged: (valor) {
                                pergunta.visivelSe = pergunta.visivelSe!
                                    .copyWith(valor: valor ?? '');
                                onAlterado();
                              },
                            )
                          else
                            TextFormField(
                              key: ValueKey(
                                '${pergunta.id}-valor-${pergunta.visivelSe!.perguntaId}',
                              ),
                              initialValue: pergunta.visivelSe!.valor,
                              onChanged: (valor) {
                                pergunta.visivelSe = pergunta.visivelSe!
                                    .copyWith(valor: valor);
                              },
                              decoration: InputDecoration(
                                labelText: 'Valor',
                                isDense: true,
                                border: borda,
                                enabledBorder: borda,
                              ),
                            ),
                        ],
                      ],
                    ],
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
