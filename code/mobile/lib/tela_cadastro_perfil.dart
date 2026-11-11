import 'package:flutter/material.dart';

import 'dados_cadastro.dart';
import 'models/formulario.dart';
import 'sessao_usuario.dart';
import 'tela_cadastro_revisao.dart';
import 'theme/colors.dart';
import 'widgets/campos_cadastro.dart';
import 'widgets/perguntas_adicionais.dart';

class PerfilCadastroPage extends StatefulWidget {
  const PerfilCadastroPage({
    super.key,
    required this.dados,
    this.perguntasAdicionais,
  });
  final DadosCadastro dados;

  /// Perguntas extras já conhecidas (testes). Se null, busca em
  /// `GET /formularios/apadrinhado`.
  final List<PerguntaFormulario>? perguntasAdicionais;

  @override
  State<PerfilCadastroPage> createState() => _PerfilCadastroPageState();
}

class _PerfilCadastroPageState extends State<PerfilCadastroPage> {
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

  late final TextEditingController _expectativaController;
  late final TextEditingController _outrasController;
  late final List<String> _areasApoio;
  String? _disponibilidade;
  String? _genero;
  bool? _bolsistaProuni;
  bool? _deOutraCidade;
  bool _declaraPrimeiroPeriodo = false;
  bool _validar = false;
  List<PerguntaFormulario> _perguntas = const [];
  String? _erroFormulario;
  bool _carregandoPerguntas = false;
  late final Map<String, dynamic> _extras;

  bool get _faltaExpectativa => _expectativaController.text.trim().isEmpty;
  bool get _faltaAreas => _areasApoio.isEmpty;
  bool get _faltaDisponibilidade => _disponibilidade == null;
  bool get _faltaGenero => _genero == null;
  bool get _faltaProuni => _bolsistaProuni == null;
  bool get _faltaCidade => _deOutraCidade == null;
  bool get _faltaDeclaracao => !_declaraPrimeiroPeriodo;

  bool get _faltaExtras =>
      PerguntasAdicionais.pendentes(_perguntas, _extras).isNotEmpty;

  bool get _incompleto =>
      _erroFormulario != null ||
      _faltaExtras ||
      _faltaExpectativa ||
      _faltaAreas ||
      _faltaDisponibilidade ||
      _faltaGenero ||
      _faltaProuni ||
      _faltaCidade ||
      _faltaDeclaracao;

  @override
  void initState() {
    super.initState();
    final dados = widget.dados;
    _expectativaController =
        TextEditingController(text: dados.expectativaPadrinho)..addListener(() {
          if (_validar) setState(() {});
        });
    _outrasController = TextEditingController(text: dados.outrasInformacoes);
    _areasApoio = List.of(dados.areasApoio);
    _disponibilidade = dados.disponibilidade;
    _genero = dados.genero;
    _bolsistaProuni = dados.bolsistaProuni;
    _deOutraCidade = dados.deOutraCidade;
    _declaraPrimeiroPeriodo = dados.declaraPrimeiroPeriodo;
    _extras = Map.of(dados.extras);
    final conhecidas = widget.perguntasAdicionais;
    if (conhecidas != null) {
      _perguntas = conhecidas;
    } else {
      _carregandoPerguntas = true;
      SessaoUsuario.atual
          .carregarPerguntasAdicionais('apadrinhado')
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

  @override
  void dispose() {
    _expectativaController.dispose();
    _outrasController.dispose();
    super.dispose();
  }

  void _continuar() {
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
    if (_incompleto) {
      setState(() => _validar = true);
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(
            content: Text('Preencha os campos destacados para continuar.'),
          ),
        );
      return;
    }

    final completos = widget.dados.comPasso2(
      expectativaPadrinho: _expectativaController.text.trim(),
      outrasInformacoes: _outrasController.text.trim(),
      areasApoio: List.of(_areasApoio),
      disponibilidade: _disponibilidade,
      genero: _genero,
      bolsistaProuni: _bolsistaProuni,
      deOutraCidade: _deOutraCidade,
      declaraPrimeiroPeriodo: _declaraPrimeiroPeriodo,
      extras: PerguntasAdicionais.limpar(_perguntas, _extras),
    );
    // A sessão passa a guardar também as respostas do passo 2.
    SessaoUsuario.atual.dados = completos;

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => RevisaoCadastroPage(
          dados: completos,
          perguntasAdicionais: _perguntas,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return EstruturaCadastro(
      children: [
        const TituloPasso(
          passo: 2,
          total: 3,
          titulo: 'Conte sobre você',
          subtitulo:
              'Essas respostas ajudam a encontrar um padrinho '
              'compatível com você.',
        ),
        const SizedBox(height: 18),
        const AvisoCadastro(child: _ComoFuncionaMatch()),
        const RotuloCampo('O que você espera do seu padrinho?'),
        CampoTextoLongo(
          controller: _expectativaController,
          dica: 'Ex.: dicas sobre a rotina, ajuda com disciplinas...',
          limite: 500,
          erro: _validar && _faltaExpectativa,
          mensagemErro: 'Conte o que você espera do seu padrinho.',
        ),
        const RotuloCampo('Outras informações (opcional)'),
        CampoTextoLongo(
          controller: _outrasController,
          dica: 'Algo mais que o seu padrinho deveria saber?',
          limite: 300,
        ),
        const RotuloCampo('Áreas em que gostaria de receber apoio'),
        CampoMultiSelecao(
          selecionados: _areasApoio,
          opcoes: _areas,
          dica: 'Selecione uma ou mais áreas',
          rotuloSemantico: 'Áreas em que gostaria de receber apoio',
          erro: _validar && _faltaAreas,
          mensagemErro: 'Selecione pelo menos uma área de apoio.',
          onAdicionar: (area) => setState(() => _areasApoio.add(area)),
          onRemover: (area) => setState(() => _areasApoio.remove(area)),
        ),
        const RotuloCampo('Disponibilidade de horários'),
        CampoSelecao<String>(
          icone: Icons.schedule,
          valor: _disponibilidade,
          dica: 'Selecione sua disponibilidade',
          rotuloSemantico: 'Disponibilidade de horários',
          erro: _validar && _faltaDisponibilidade,
          mensagemErro: 'Selecione sua disponibilidade de horários.',
          opcoes: {for (final item in _disponibilidades) item: item},
          onChanged: (valor) => setState(() => _disponibilidade = valor),
        ),
        LinhaCamposResponsiva(
          esquerda: Column(
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
          direita: Column(
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
        if (_erroFormulario != null)
          Text(_erroFormulario!, style: const TextStyle(color: Colors.red)),
        PerguntasAdicionais(
          perguntas: _perguntas,
          respostas: _extras,
          validar: _validar,
          onChanged: () {
            if (_validar) setState(() {});
          },
        ),
        const SizedBox(height: 12),
        const RotuloCampo('Identificação acadêmica'),
        CheckboxListTile(
          value: _declaraPrimeiroPeriodo,
          contentPadding: EdgeInsets.zero,
          activeColor: AppColors.primary,
          controlAffinity: ListTileControlAffinity.leading,
          title: Text(
            'Declaro que estou no 1º período e que os dados acadêmicos '
            '(curso, período e e-mail institucional) estão corretos.',
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 13,
              color: _validar && _faltaDeclaracao
                  ? Colors.red.shade700
                  : AppColors.ink,
            ),
          ),
          onChanged: (valor) =>
              setState(() => _declaraPrimeiroPeriodo = valor ?? false),
        ),
        if (_validar && _faltaDeclaracao)
          const Padding(
            padding: EdgeInsets.only(bottom: 8),
            child: Text(
              'Confirme a declaração de 1º período para continuar.',
              style: TextStyle(color: Colors.red, fontSize: 12),
            ),
          ),
        const SizedBox(height: 22),
        BotaoCadastro(texto: 'Continuar', onPressed: _continuar),
        const SizedBox(height: 8),
        Center(
          child: TextButton(
            onPressed: () => Navigator.of(context).maybePop(),
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

class _ComoFuncionaMatch extends StatelessWidget {
  const _ComoFuncionaMatch();

  static const _itens = [
    'Suas respostas são comparadas com as dos padrinhos',
    'A coordenação confirma o match',
    'Você revisa tudo no próximo passo',
  ];

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Como encontramos seu padrinho',
          style: TextStyle(
            fontFamily: 'Inter',
            color: AppColors.primary,
            fontSize: 13,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 6),
        for (final item in _itens)
          Padding(
            padding: const EdgeInsets.only(bottom: 3),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Padding(
                  padding: EdgeInsets.only(top: 6, right: 8),
                  child: CircleAvatar(
                    radius: 2.5,
                    backgroundColor: AppColors.primary,
                  ),
                ),
                Expanded(
                  child: Text(
                    item,
                    style: const TextStyle(
                      fontFamily: 'Inter',
                      color: AppColors.ink,
                      fontSize: 12,
                      height: 1.35,
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
