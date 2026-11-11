import 'package:flutter/material.dart';

import 'dados_cadastro.dart';
import 'models/formulario.dart';
import 'services/api_config.dart';
import 'sessao_usuario.dart';
import 'tela_candidatura_enviada.dart';
import 'tela_revisao_padrinho.dart';
import 'theme/colors.dart';
import 'widgets/campos_cadastro.dart';
import 'widgets/perguntas_adicionais.dart';

class CadastroPadrinhoPage extends StatefulWidget {
  const CadastroPadrinhoPage({
    super.key,
    required this.dados,
    this.perguntasAdicionais,
    this.requisitos,
  });

  /// Rascunho do aluno; não altera candidaturas já enviadas.
  final DadosCadastro dados;

  /// Perguntas extras já conhecidas (testes). Se null, busca em
  /// `GET /formularios/padrinho`.
  final List<PerguntaFormulario>? perguntasAdicionais;

  /// Requisitos do ciclo já conhecidos (testes). Se null, busca em
  /// `GET /formularios/padrinho` (os mesmos do web, definidos pela
  /// coordenação).
  final List<RequisitoPadrinho>? requisitos;

  static String textoDeclaracao(RequisitoPadrinho requisito) =>
      'Declaro que cumpro: ${requisito.descricao}'
      '${requisito.obrigatorio ? '' : ' (desejável)'}';

  @override
  State<CadastroPadrinhoPage> createState() => _CadastroPadrinhoPageState();
}

class _CadastroPadrinhoPageState extends State<CadastroPadrinhoPage> {
  static const _areas = [
    'Rotina universitária',
    'Disciplinas e provas',
    'Projetos',
    'Tecnologia',
    'Carreira e estágio',
    'Vida no campus',
  ];
  static const _disponibilidades = [
    'Manhã',
    'Tarde',
    'Noite',
    'Fins de semana',
  ];
  static const _generos = [
    'Feminino',
    'Masculino',
    'Não binário',
    'Prefiro não informar',
  ];
  static const _simNao = {true: 'Sim', false: 'Não'};

  late final TextEditingController _motivoController;
  late final TextEditingController _experienciasController;
  late final List<String> _areasInteresse;
  late final List<String> _disponibilidadesEscolhidas;
  String? _genero;
  bool? _bolsistaProuni;
  bool? _deOutraCidade;

  /// null = carregando; lista vazia = ciclo sem disciplinas exigidas.
  List<RequisitoPadrinho>? _requisitos;
  String? _erroRequisitos;
  late final Map<String, bool> _cumpridos;
  bool _validar = false;
  bool _enviando = false;
  List<PerguntaFormulario> _perguntas = const [];
  String? _erroFormulario;
  bool _carregandoPerguntas = false;
  late final Map<String, dynamic> _extras;

  final _chaveDeclaracao = GlobalKey();
  final _chaveExtras = GlobalKey();

  final _chaveMotivo = GlobalKey();
  final _chaveAreas = GlobalKey();
  final _chaveDisponibilidade = GlobalKey();
  final _chaveGenero = GlobalKey();
  final _chaveProuni = GlobalKey();
  final _chaveCidade = GlobalKey();

  bool get _faltaMotivo => _motivoController.text.trim().isEmpty;
  bool get _faltaAreas => _areasInteresse.isEmpty;
  bool get _faltaDisponibilidade => _disponibilidadesEscolhidas.isEmpty;
  bool get _faltaGenero => _genero == null;
  bool get _faltaProuni => _bolsistaProuni == null;
  bool get _faltaCidade => _deOutraCidade == null;

  /// Ajuda visual: quem recusa requisito obrigatório não cumprido é o backend.
  List<RequisitoPadrinho> get _requisitosFaltando => [
    for (final r in _requisitos ?? const <RequisitoPadrinho>[])
      if (r.obrigatorio && _cumpridos[r.id] != true) r,
  ];
  bool get _faltaDeclaracao =>
      _requisitos == null || _requisitosFaltando.isNotEmpty;
  bool get _faltaExtras =>
      PerguntasAdicionais.pendentes(_perguntas, _extras).isNotEmpty;

  bool get _incompleto =>
      _erroFormulario != null ||
      _faltaDeclaracao ||
      _faltaExtras ||
      _faltaMotivo ||
      _faltaAreas ||
      _faltaDisponibilidade ||
      _faltaGenero ||
      _faltaProuni ||
      _faltaCidade;

  @override
  void initState() {
    super.initState();
    final dados = widget.dados;
    _motivoController = TextEditingController(text: dados.expectativaPadrinho)
      ..addListener(() {
        if (_validar) setState(() {});
      });
    _experienciasController = TextEditingController(
      text: dados.outrasInformacoes,
    );
    _areasInteresse = List.of(dados.areasApoio);
    _disponibilidadesEscolhidas = dados.disponibilidadeLista;
    _genero = dados.genero;
    _bolsistaProuni = dados.bolsistaProuni;
    _deOutraCidade = dados.deOutraCidade;
    _cumpridos = Map.of(dados.requisitosCumpridos);
    final requisitosConhecidos = widget.requisitos;
    if (requisitosConhecidos != null) {
      _requisitos = requisitosConhecidos;
    } else {
      _carregarRequisitos();
    }
    _extras = Map.of(dados.extras);

    final conhecidas = widget.perguntasAdicionais;
    if (conhecidas != null) {
      _perguntas = conhecidas;
    } else {
      _carregandoPerguntas = true;
      SessaoUsuario.atual
          .carregarPerguntasAdicionais('padrinho')
          .then((perguntas) {
            if (mounted) {
              setState(() {
                _perguntas = perguntas;
                _carregandoPerguntas = false;
              });
            }
          })
          .catchError((Object erro) {
            if (mounted) {
              setState(() {
                _erroFormulario = erro.toString();
                _carregandoPerguntas = false;
              });
            }
          });
    }
  }

  Future<void> _carregarRequisitos() async {
    setState(() {
      _requisitos = null;
      _erroRequisitos = null;
    });
    try {
      final lista = await SessaoUsuario.atual.carregarRequisitosPadrinho();
      if (mounted) setState(() => _requisitos = lista);
    } catch (_) {
      if (mounted) {
        setState(
          () => _erroRequisitos =
              'Não foi possível carregar os requisitos do ciclo.',
        );
      }
    }
  }

  @override
  void dispose() {
    _motivoController.dispose();
    _experienciasController.dispose();
    super.dispose();
  }

  Future<void> _rolarPara(GlobalKey chave) async {
    final contexto = chave.currentContext;
    if (contexto == null) return;
    await Scrollable.ensureVisible(
      contexto,
      duration: const Duration(milliseconds: 280),
      alignment: 0.1,
      curve: Curves.easeOutCubic,
    );
  }

  Future<void> _enviar() async {
    if (_carregandoPerguntas) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Aguarde o carregamento do formulário.')),
      );
      return;
    }
    if (_erroFormulario != null || _perguntas.any((p) => !p.tipo.suportado)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(_erroFormulario ?? mensagemFormularioNaoSuportado),
        ),
      );
      return;
    }
    if (_enviando) return;

    if (_incompleto) {
      setState(() => _validar = true);
      final primeiroErro = _faltaDeclaracao
          ? _chaveDeclaracao
          : _faltaMotivo
          ? _chaveMotivo
          : _faltaAreas
          ? _chaveAreas
          : _faltaDisponibilidade
          ? _chaveDisponibilidade
          : _faltaGenero
          ? _chaveGenero
          : _faltaProuni
          ? _chaveProuni
          : _faltaCidade
          ? _chaveCidade
          : _chaveExtras;
      await _rolarPara(primeiroErro);
      return;
    }

    setState(() => _enviando = true);
    try {
      final rascunho = widget.dados.comPasso2(
        expectativaPadrinho: _motivoController.text.trim(),
        outrasInformacoes: _experienciasController.text.trim(),
        areasApoio: List.of(_areasInteresse),
        disponibilidade: _disponibilidadesEscolhidas.join(', '),
        genero: _genero,
        bolsistaProuni: _bolsistaProuni,
        deOutraCidade: _deOutraCidade,
        requisitosCumpridos: {
          for (final r in _requisitos ?? const <RequisitoPadrinho>[])
            r.id: _cumpridos[r.id] == true,
        },
        extras: PerguntasAdicionais.limpar(_perguntas, _extras),
      );
      final confirmou = await Navigator.of(context).push<bool>(
        MaterialPageRoute(
          builder: (_) => RevisaoPadrinhoPage(
            dados: rascunho,
            perguntas: _perguntas,
            requisitos: _requisitos ?? const [],
          ),
        ),
      );
      if (!mounted) return;
      setState(() => _enviando = false);
      if (confirmou != true) return;

      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const CandidaturaEnviadaPage()),
        (_) => false,
      );
    } catch (erro) {
      if (!mounted) return;
      setState(() => _enviando = false);
      final mensagem = erro is ApiException
          ? 'Não foi possível enviar sua candidatura: ${erro.mensagem}'
          : erro is ApiIndisponivelException
          ? 'Sem conexão com o servidor. Sua candidatura ainda não foi enviada.'
          : 'Não foi possível enviar sua candidatura. Tente novamente.';
      mostrarErroComRetentativa(context, mensagem, _enviar);
    }
  }

  @override
  Widget build(BuildContext context) {
    return EstruturaCadastro(
      children: [
        const TituloPasso(
          passo: 2,
          total: 3,
          titulo: 'Candidatura de padrinho',
          subtitulo:
              'Conte um pouco sobre você e por que deseja ser padrinho '
              'no Ajuda-aí.',
        ),
        const SizedBox(height: 18),
        AvisoCadastro(
          child: _PreRequisitosPadrinho(
            requisitos: _requisitos,
            erro: _erroRequisitos,
            onTentarNovamente: _carregarRequisitos,
          ),
        ),
        const SizedBox(height: 10),
        KeyedSubtree(
          key: _chaveDeclaracao,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final requisito
                  in _requisitos ?? const <RequisitoPadrinho>[])
                CampoDeclaracao(
                  texto: CadastroPadrinhoPage.textoDeclaracao(requisito),
                  valor: _cumpridos[requisito.id] == true,
                  erro:
                      _validar &&
                      requisito.obrigatorio &&
                      _cumpridos[requisito.id] != true,
                  mensagemErro:
                      'Requisito obrigatório para se candidatar neste ciclo.',
                  onChanged: (valor) =>
                      setState(() => _cumpridos[requisito.id] = valor),
                ),
            ],
          ),
        ),
        KeyedSubtree(
          key: _chaveMotivo,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const RotuloCampo('Por que você quer ser padrinho?'),
              CampoTextoLongo(
                controller: _motivoController,
                dica: 'Conte sua motivação...',
                limite: 500,
                erro: _validar && _faltaMotivo,
                mensagemErro: 'Conte por que você quer ser padrinho.',
              ),
            ],
          ),
        ),
        const RotuloCampo('Experiências relevantes (opcional)'),
        CampoTextoLongo(
          controller: _experienciasController,
          dica: 'Ex.: projetos, monitoria, voluntariado...',
          limite: 300,
        ),
        KeyedSubtree(
          key: _chaveAreas,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const RotuloCampo('Áreas de interesse para apoiar'),
              CampoMultiSelecao(
                selecionados: _areasInteresse,
                opcoes: _areas,
                dica: 'Selecione uma ou mais áreas',
                icone: Icons.sell_outlined,
                rotuloSemantico: 'Áreas de interesse para apoiar',
                erro: _validar && _faltaAreas,
                mensagemErro: 'Selecione pelo menos uma área de interesse.',
                onAdicionar: (area) =>
                    setState(() => _areasInteresse.add(area)),
                onRemover: (area) =>
                    setState(() => _areasInteresse.remove(area)),
              ),
            ],
          ),
        ),
        KeyedSubtree(
          key: _chaveDisponibilidade,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const RotuloCampo('Disponibilidade de horários'),
              CampoMultiSelecao(
                selecionados: _disponibilidadesEscolhidas,
                opcoes: _disponibilidades,
                dica: 'Selecione sua disponibilidade',
                icone: Icons.schedule,
                rotuloSemantico: 'Disponibilidade de horários',
                erro: _validar && _faltaDisponibilidade,
                mensagemErro: 'Selecione pelo menos uma disponibilidade.',
                onAdicionar: (item) =>
                    setState(() => _disponibilidadesEscolhidas.add(item)),
                onRemover: (item) =>
                    setState(() => _disponibilidadesEscolhidas.remove(item)),
              ),
            ],
          ),
        ),
        LinhaCamposResponsiva(
          esquerda: KeyedSubtree(
            key: _chaveGenero,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const RotuloCampo('Gênero'),
                CampoSelecao<String>(
                  icone: Icons.person_outline,
                  valor: _genero,
                  dica: 'Selecione',
                  rotuloSemantico: 'Gênero',
                  erro: _validar && _faltaGenero,
                  mensagemErro: 'Selecione uma opção de gênero.',
                  opcoes: {for (final item in _generos) item: item},
                  onChanged: (valor) => setState(() => _genero = valor),
                ),
              ],
            ),
          ),
          direita: KeyedSubtree(
            key: _chaveProuni,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const RotuloCampo('É bolsista ProUni?'),
                CampoSelecao<bool>(
                  icone: Icons.school_outlined,
                  valor: _bolsistaProuni,
                  dica: 'Selecione',
                  rotuloSemantico: 'É bolsista ProUni?',
                  erro: _validar && _faltaProuni,
                  mensagemErro: 'Informe se você é bolsista ProUni.',
                  opcoes: _simNao,
                  onChanged: (valor) => setState(() => _bolsistaProuni = valor),
                ),
              ],
            ),
          ),
        ),
        KeyedSubtree(
          key: _chaveCidade,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const RotuloCampo('É de outra cidade?'),
              CampoSelecao<bool>(
                icone: Icons.location_on_outlined,
                valor: _deOutraCidade,
                dica: 'Selecione uma opção',
                rotuloSemantico: 'É de outra cidade?',
                erro: _validar && _faltaCidade,
                mensagemErro: 'Informe se você é de outra cidade.',
                opcoes: _simNao,
                onChanged: (valor) => setState(() => _deOutraCidade = valor),
              ),
            ],
          ),
        ),
        if (_erroFormulario != null)
          Text(_erroFormulario!, style: const TextStyle(color: Colors.red)),
        KeyedSubtree(
          key: _chaveExtras,
          child: PerguntasAdicionais(
            perguntas: _perguntas,
            respostas: _extras,
            validar: _validar,
            onChanged: () {
              if (_validar) setState(() {});
            },
          ),
        ),
        const SizedBox(height: 22),
        BotaoEnvio(
          texto: 'Revisar candidatura',
          enviando: _enviando,
          onPressed: _enviar,
        ),
        const SizedBox(height: 8),
        Center(
          child: TextButton(
            onPressed: _enviando
                ? null
                : () => Navigator.of(context).maybePop(),
            child: const Text(
              'Voltar',
              style: TextStyle(
                fontFamily: 'Inter',
                color: AppColors.primary,
                fontWeight: FontWeight.w600,
                decoration: TextDecoration.underline,
                decorationColor: AppColors.primary,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _PreRequisitosPadrinho extends StatelessWidget {
  const _PreRequisitosPadrinho({
    required this.requisitos,
    required this.erro,
    required this.onTentarNovamente,
  });

  /// Do backend; null enquanto carrega.
  final List<RequisitoPadrinho>? requisitos;
  final String? erro;
  final VoidCallback onTentarNovamente;

  static const _estilo = TextStyle(
    fontFamily: 'Inter',
    color: AppColors.ink,
    fontSize: 12,
    height: 1.35,
  );

  Widget _item(String texto) => Padding(
    padding: const EdgeInsets.only(bottom: 3),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.only(top: 6, right: 8),
          child: CircleAvatar(radius: 2.5, backgroundColor: AppColors.primary),
        ),
        Expanded(child: Text(texto, style: _estilo)),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    final lista = requisitos;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Pré-requisitos para ser padrinho neste semestre',
          style: TextStyle(
            fontFamily: 'Inter',
            color: AppColors.primary,
            fontSize: 13,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 6),
        _item('Estar a partir do 2º período'),
        if (lista != null)
          for (final r in lista)
            _item('${r.descricao}${r.obrigatorio ? '' : ' (desejável)'}'),
        if (lista == null && erro == null)
          const Text('Carregando requisitos do ciclo...', style: _estilo),
        if (lista != null && lista.isEmpty)
          const Text(
            'Este ciclo não exige disciplinas específicas.',
            style: _estilo,
          ),
        if (erro != null) ...[
          Text(erro!, style: _estilo.copyWith(color: const Color(0xFFB91C1C))),
          TextButton(
            onPressed: onTentarNovamente,
            child: const Text('Tentar novamente'),
          ),
        ],
        const SizedBox(height: 4),
        const Text(
          'Cumprir os requisitos não aprova a candidatura: a coordenação '
          'analisa cada caso.',
          style: TextStyle(
            fontFamily: 'Inter',
            color: AppColors.muted,
            fontSize: 11,
          ),
        ),
      ],
    );
  }
}
