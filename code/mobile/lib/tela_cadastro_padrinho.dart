import 'package:flutter/material.dart';

import 'dados_cadastro.dart';
import 'sessao_usuario.dart';
import 'tela_candidatura_enviada.dart';
import 'theme/colors.dart';
import 'widgets/campos_cadastro.dart';

class CadastroPadrinhoPage extends StatefulWidget {
  const CadastroPadrinhoPage({super.key, required this.dados});

  final DadosCadastro dados;

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
  final List<String> _areasInteresse = [];
  final List<String> _disponibilidadesEscolhidas = [];
  String? _genero;
  bool? _bolsistaProuni;
  bool? _deOutraCidade;
  bool _validar = false;
  bool _enviando = false;

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

  bool get _incompleto =>
      _faltaMotivo ||
      _faltaAreas ||
      _faltaDisponibilidade ||
      _faltaGenero ||
      _faltaProuni ||
      _faltaCidade;

  @override
  void initState() {
    super.initState();
    _motivoController = TextEditingController()
      ..addListener(() {
        if (_validar) setState(() {});
      });
    _experienciasController = TextEditingController();
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
    if (_enviando) return;

    if (_incompleto) {
      setState(() => _validar = true);
      final primeiroErro = _faltaMotivo
          ? _chaveMotivo
          : _faltaAreas
          ? _chaveAreas
          : _faltaDisponibilidade
          ? _chaveDisponibilidade
          : _faltaGenero
          ? _chaveGenero
          : _faltaProuni
          ? _chaveProuni
          : _chaveCidade;
      await _rolarPara(primeiroErro);
      return;
    }

    setState(() => _enviando = true);
    try {
      await Future<void>.delayed(const Duration(milliseconds: 450));
      if (!mounted) return;

      await SessaoUsuario.atual.registrarCandidaturaPadrinho(
        dadosCadastro: widget.dados.comPasso2(
          expectativaPadrinho: _motivoController.text.trim(),
          outrasInformacoes: _experienciasController.text.trim(),
          areasApoio: List.of(_areasInteresse),
          disponibilidade: _disponibilidadesEscolhidas.join(', '),
          genero: _genero,
          bolsistaProuni: _bolsistaProuni,
          deOutraCidade: _deOutraCidade,
        ),
      );

      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const CandidaturaEnviadaPage()),
        (_) => false,
      );
    } catch (_) {
      if (!mounted) return;
      setState(() => _enviando = false);
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(
            content: Text(
              'Não foi possível enviar sua candidatura. Tente novamente.',
            ),
          ),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    return EstruturaCadastro(
      children: [
        const TituloPasso(
          passo: 1,
          total: 2,
          titulo: 'Candidatura de padrinho',
          subtitulo:
              'Conte um pouco sobre você e por que deseja ser padrinho '
              'no Ajuda-aí.',
        ),
        const SizedBox(height: 18),
        const AvisoCadastro(child: _PreRequisitosPadrinho()),
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
                onAdicionar: (area) => setState(() => _areasInteresse.add(area)),
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
        const SizedBox(height: 22),
        IgnorePointer(
          ignoring: _enviando,
          child: Opacity(
            opacity: _enviando ? 0.7 : 1,
            child: BotaoCadastro(
              texto: _enviando ? 'Enviando...' : 'Enviar candidatura',
              onPressed: _enviar,
            ),
          ),
        ),
        const SizedBox(height: 8),
        Center(
          child: TextButton(
            onPressed: _enviando ? null : () => Navigator.of(context).maybePop(),
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
  const _PreRequisitosPadrinho();

  static const _itens = [
    'Não estar no 1º período',
    'Ter sido aprovado em AEDS 1',
    'Ter sido aprovado em Cálculo 1',
  ];

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Pré-requisitos para ser padrinho',
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
