import 'package:flutter/material.dart';

import 'dados_cadastro.dart';
import 'tela_cadastro_revisao.dart';
import 'theme/colors.dart';
import 'widgets/campos_cadastro.dart';

class PerfilCadastroPage extends StatefulWidget {
  const PerfilCadastroPage({super.key, required this.dados});
  final DadosCadastro dados;

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
  bool _validar = false;

  bool get _faltaExpectativa => _expectativaController.text.trim().isEmpty;
  bool get _faltaAreas => _areasApoio.isEmpty;
  bool get _faltaDisponibilidade => _disponibilidade == null;
  bool get _faltaGenero => _genero == null;
  bool get _faltaProuni => _bolsistaProuni == null;
  bool get _faltaCidade => _deOutraCidade == null;

  bool get _incompleto =>
      _faltaExpectativa ||
      _faltaAreas ||
      _faltaDisponibilidade ||
      _faltaGenero ||
      _faltaProuni ||
      _faltaCidade;

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
  }

  @override
  void dispose() {
    _expectativaController.dispose();
    _outrasController.dispose();
    super.dispose();
  }

  void _continuar() {
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

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => RevisaoCadastroPage(
          dados: widget.dados.comPasso2(
            expectativaPadrinho: _expectativaController.text.trim(),
            outrasInformacoes: _outrasController.text.trim(),
            areasApoio: List.of(_areasApoio),
            disponibilidade: _disponibilidade,
            genero: _genero,
            bolsistaProuni: _bolsistaProuni,
            deOutraCidade: _deOutraCidade,
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return EstruturaCadastro(
      children: [
        const TituloPasso(
          passo: 1,
          total: 2,
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
          erro: _validar && _faltaAreas,
          onAdicionar: (area) => setState(() => _areasApoio.add(area)),
          onRemover: (area) => setState(() => _areasApoio.remove(area)),
        ),
        const RotuloCampo('Disponibilidade de horários'),
        CampoSelecao<String>(
          icone: Icons.schedule,
          valor: _disponibilidade,
          dica: 'Selecione sua disponibilidade',
          erro: _validar && _faltaDisponibilidade,
          opcoes: {for (final item in _disponibilidades) item: item},
          onChanged: (valor) => setState(() => _disponibilidade = valor),
        ),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const RotuloCampo('Gênero'),
                  CampoSelecao<String>(
                    icone: Icons.person_outline,
                    valor: _genero,
                    dica: 'Selecione',
                    erro: _validar && _faltaGenero,
                    opcoes: {for (final item in _generos) item: item},
                    onChanged: (valor) => setState(() => _genero = valor),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const RotuloCampo('É bolsista ProUni?'),
                  CampoSelecao<bool>(
                    icone: Icons.school_outlined,
                    valor: _bolsistaProuni,
                    dica: 'Selecione',
                    erro: _validar && _faltaProuni,
                    opcoes: _simNao,
                    onChanged: (valor) =>
                        setState(() => _bolsistaProuni = valor),
                  ),
                ],
              ),
            ),
          ],
        ),
        const RotuloCampo('É de outra cidade?'),
        CampoSelecao<bool>(
          icone: Icons.location_on_outlined,
          valor: _deOutraCidade,
          dica: 'Selecione uma opção',
          erro: _validar && _faltaCidade,
          opcoes: _simNao,
          onChanged: (valor) => setState(() => _deOutraCidade = valor),
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
