import 'package:flutter/material.dart';

import 'dados_cadastro.dart';
import 'models/formulario.dart';
import 'services/api_config.dart';
import 'sessao_usuario.dart';
import 'tela_cadastro_concluido.dart';
import 'theme/colors.dart';
import 'widgets/campos_cadastro.dart';
import 'widgets/perguntas_adicionais.dart';

class RevisaoCadastroPage extends StatefulWidget {
  const RevisaoCadastroPage({
    super.key,
    required this.dados,
    this.perguntasAdicionais = const [],
  });

  final DadosCadastro dados;
  final List<PerguntaFormulario> perguntasAdicionais;

  @override
  State<RevisaoCadastroPage> createState() => _RevisaoCadastroPageState();
}

class _RevisaoCadastroPageState extends State<RevisaoCadastroPage> {
  bool _enviando = false;

  DadosCadastro get dados => widget.dados;

  static String _simNao(bool? valor) => switch (valor) {
    true => 'Sim',
    false => 'Não',
    null => 'Não informado',
  };
  void _editar(BuildContext context) => Navigator.of(context).pop();

  /// Envia o cadastro (`POST /cadastro`): o backend cria o usuário PENDENTE e
  /// a inscrição do ciclo. Com erro (inclusive sem conexão), fica na tela e
  /// oferece "Tentar novamente".
  Future<void> _enviar() async {
    if (_enviando) return;
    setState(() => _enviando = true);
    try {
      await SessaoUsuario.atual.cadastrarApadrinhado(dadosCadastro: dados);
      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const CadastroConcluidoPage()),
        (_) => false,
      );
    } catch (erro) {
      if (!mounted) return;
      setState(() => _enviando = false);
      final mensagem = erro is ApiException
          ? 'Não foi possível enviar seu cadastro: ${erro.mensagem}'
          : erro is ApiIndisponivelException
          ? 'Sem conexão com o servidor. Seu cadastro ainda não foi enviado.'
          : 'Não foi possível enviar seu cadastro. Tente novamente.';
      mostrarErroComRetentativa(context, mensagem, _enviar);
    }
  }

  @override
  Widget build(BuildContext context) {
    final itens = [
      (Icons.person_outline, 'Gênero', dados.genero),
      (
        Icons.person_outline,
        'Preferência de gênero',
        dados.preferenciaGenero?.descricao ?? 'Não informado',
      ),
      (
        Icons.school_outlined,
        'É bolsista ProUni?',
        _simNao(dados.bolsistaProuni),
      ),
      (
        Icons.location_on_outlined,
        'É de outra cidade?',
        _simNao(dados.deOutraCidade),
      ),
      (Icons.schedule, 'Disponibilidade de horários', dados.disponibilidade),
      (
        Icons.sell_outlined,
        'Áreas em que gostaria de receber apoio',
        dados.areasApoio.join(', '),
      ),
      (
        Icons.chat_bubble_outline,
        'O que você espera do seu padrinho?',
        dados.expectativaPadrinho,
      ),
      (
        Icons.description_outlined,
        'Outras informações',
        dados.outrasInformacoes,
      ),
      (
        Icons.verified_user_outlined,
        'Declaração de 1º período',
        dados.declaraPrimeiroPeriodo ? 'Declarado' : 'Não declarado',
      ),
      for (final pergunta in widget.perguntasAdicionais)
        (
          Icons.help_outline,
          pergunta.enunciado,
          PerguntasAdicionais.formatar(dados.extras[pergunta.id]),
        ),
    ];

    return EstruturaCadastro(
      children: [
        const TituloPasso(
          passo: 3,
          total: 3,
          titulo: 'Revise suas informações',
          subtitulo:
              'Confira os dados do seu cadastro antes de enviar para '
              'encontrar um padrinho compatível.',
        ),
        const SizedBox(height: 18),
        for (final (icone, titulo, valor) in itens)
          _ItemRevisao(
            icone: icone,
            titulo: titulo,
            valor: valor,
            onEditar: _enviando ? () {} : () => _editar(context),
          ),
        const SizedBox(height: 6),
        const AvisoCadastro(
          child: Text(
            'Após o envio, suas informações serão usadas para encontrar um '
            'padrinho compatível. Você poderá ver seu padrinho assim que a '
            'coordenação confirmar o match.',
            style: TextStyle(
              fontFamily: 'Inter',
              color: AppColors.muted,
              fontSize: 12,
              height: 1.4,
            ),
          ),
        ),
        const SizedBox(height: 22),
        BotaoEnvio(
          texto: 'Enviar cadastro',
          enviando: _enviando,
          onPressed: _enviar,
        ),
      ],
    );
  }
}

class _ItemRevisao extends StatelessWidget {
  const _ItemRevisao({
    required this.icone,
    required this.titulo,
    required this.valor,
    required this.onEditar,
  });

  final IconData icone;
  final String titulo;
  final String? valor;
  final VoidCallback onEditar;

  @override
  Widget build(BuildContext context) {
    final texto = (valor == null || valor!.trim().isEmpty)
        ? 'Não informado'
        : valor!;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(12, 10, 4, 10),
      decoration: EstiloCampo.decoracao(),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: AppColors.lavender,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icone, size: 18, color: AppColors.primary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  titulo,
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.ink,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  texto,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.muted,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: onEditar,
            icon: const Icon(Icons.edit_outlined, size: 18),
            color: AppColors.primary,
            tooltip: 'Editar $titulo',
          ),
        ],
      ),
    );
  }
}
