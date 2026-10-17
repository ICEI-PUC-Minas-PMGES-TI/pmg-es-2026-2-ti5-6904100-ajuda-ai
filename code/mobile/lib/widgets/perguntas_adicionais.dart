import 'package:flutter/material.dart';

import '../models/formulario.dart';
import '../theme/colors.dart';
import 'campos_cadastro.dart';

/// Seção "Perguntas adicionais" do formulário publicado pela coordenação.
///
/// As respostas são gravadas em [respostas] (`id → String | List<String>`),
/// que vai para `respostas.extras` no envio.
class PerguntasAdicionais extends StatefulWidget {
  const PerguntasAdicionais({
    super.key,
    required this.perguntas,
    required this.respostas,
    this.validar = false,
    this.onChanged,
    this.mostrarTitulo = true,
  });

  final List<PerguntaFormulario> perguntas;
  final Map<String, dynamic> respostas;
  final bool validar;
  final VoidCallback? onChanged;
  final bool mostrarTitulo;

  /// Tipos não suportados bloqueiam o envio, mesmo quando opcionais.
  static List<String> pendentes(
    List<PerguntaFormulario> perguntas,
    Map<String, dynamic> respostas,
  ) {
    return [
      for (final pergunta in perguntas)
        if (!pergunta.tipo.suportado ||
            (pergunta.obrigatoria && !_respondida(respostas[pergunta.id])))
          pergunta.id,
    ];
  }

  static bool _respondida(Object? valor) => switch (valor) {
    String texto => texto.trim().isNotEmpty,
    List lista => lista.isNotEmpty,
    _ => false,
  };

  /// Só as respostas preenchidas (sem textos vazios / listas vazias).
  static Map<String, dynamic> limpar(Map<String, dynamic> respostas) => {
    for (final MapEntry(:key, :value) in respostas.entries)
      if (_respondida(value))
        key: value is String ? value.trim() : List<String>.from(value as List),
  };

  /// Texto legível de uma resposta (para revisão).
  static String formatar(Object? valor) => switch (valor) {
    String texto when texto.trim().isNotEmpty => texto.trim(),
    List lista when lista.isNotEmpty => lista.join(', '),
    _ => 'Não informado',
  };

  @override
  State<PerguntasAdicionais> createState() => _PerguntasAdicionaisState();
}

class _PerguntasAdicionaisState extends State<PerguntasAdicionais> {
  final Map<String, TextEditingController> _controllers = {};

  TextEditingController _controller(PerguntaFormulario pergunta) {
    return _controllers.putIfAbsent(pergunta.id, () {
      final inicial = widget.respostas[pergunta.id];
      return TextEditingController(text: inicial is String ? inicial : '')
        ..addListener(() {
          widget.respostas[pergunta.id] = _controllers[pergunta.id]!.text;
          widget.onChanged?.call();
        });
    });
  }

  @override
  void dispose() {
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  void _alterar(String id, Object valor) {
    setState(() => widget.respostas[id] = valor);
    widget.onChanged?.call();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.perguntas.isEmpty) return const SizedBox.shrink();
    if (widget.perguntas.any((p) => !p.tipo.suportado)) {
      return const Text(
        mensagemFormularioNaoSuportado,
        style: TextStyle(color: Colors.red),
      );
    }
    final pendentes = widget.validar
        ? PerguntasAdicionais.pendentes(widget.perguntas, widget.respostas)
        : const <String>[];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (widget.mostrarTitulo) ...[
          const SizedBox(height: 22),
          const Text(
            'Perguntas adicionais',
            style: TextStyle(
              color: AppColors.ink,
              fontSize: 17,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 2),
          const Text(
            'Perguntas definidas pela coordenação para este ciclo.',
            style: TextStyle(
              fontFamily: 'Inter',
              color: AppColors.muted,
              fontSize: 12,
            ),
          ),
        ],
        for (final pergunta in widget.perguntas)
          _campo(pergunta, erro: pendentes.contains(pergunta.id)),
      ],
    );
  }

  Widget _campo(PerguntaFormulario pergunta, {required bool erro}) {
    final rotulo = pergunta.obrigatoria
        ? pergunta.enunciado
        : '${pergunta.enunciado} (opcional)';
    const mensagem = 'Responda esta pergunta para continuar.';

    final Widget campo = switch (pergunta.tipo) {
      TipoPergunta.textoCurto => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: 48,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            alignment: Alignment.centerLeft,
            decoration: EstiloCampo.decoracao(erro: erro),
            child: TextField(
              controller: _controller(pergunta),
              style: EstiloCampo.valor,
              decoration: const InputDecoration.collapsed(
                hintText: 'Sua resposta',
                hintStyle: EstiloCampo.dica,
              ),
            ),
          ),
          if (erro) const MensagemErroCampo(mensagem),
        ],
      ),
      TipoPergunta.textoLongo => CampoTextoLongo(
        controller: _controller(pergunta),
        dica: 'Sua resposta',
        limite: 500,
        erro: erro,
        mensagemErro: mensagem,
      ),
      TipoPergunta.dropdown => CampoSelecao<String>(
        icone: Icons.list_alt_outlined,
        valor: pergunta.opcoes.contains(widget.respostas[pergunta.id])
            ? widget.respostas[pergunta.id] as String
            : null,
        dica: 'Selecione uma opção',
        rotuloSemantico: pergunta.enunciado,
        erro: erro,
        mensagemErro: mensagem,
        opcoes: {for (final opcao in pergunta.opcoes) opcao: opcao},
        onChanged: (valor) => _alterar(pergunta.id, valor),
      ),
      TipoPergunta.checklist => _Checklist(
        opcoes: pergunta.opcoes,
        selecionadas: List<String>.from(
          widget.respostas[pergunta.id] as List? ?? const [],
        ),
        erro: erro,
        onChanged: (lista) => _alterar(pergunta.id, lista),
      ),
      TipoPergunta.naoSuportado => const Text(mensagemFormularioNaoSuportado),
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [RotuloCampo(rotulo), campo],
    );
  }
}

class _Checklist extends StatelessWidget {
  const _Checklist({
    required this.opcoes,
    required this.selecionadas,
    required this.erro,
    required this.onChanged,
  });

  final List<String> opcoes;
  final List<String> selecionadas;
  final bool erro;
  final ValueChanged<List<String>> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          decoration: EstiloCampo.decoracao(erro: erro),
          child: Material(
            type: MaterialType.transparency,
            child: Column(
              children: [
                for (final opcao in opcoes)
                  CheckboxListTile(
                    dense: true,
                    value: selecionadas.contains(opcao),
                    activeColor: AppColors.primary,
                    controlAffinity: ListTileControlAffinity.leading,
                    title: Text(opcao, style: EstiloCampo.valor),
                    onChanged: (marcado) {
                      final nova = List.of(selecionadas);
                      if (marcado == true) {
                        if (!nova.contains(opcao)) nova.add(opcao);
                      } else {
                        nova.remove(opcao);
                      }
                      onChanged(nova);
                    },
                  ),
              ],
            ),
          ),
        ),
        if (erro) const MensagemErroCampo('Selecione pelo menos uma opção.'),
      ],
    );
  }
}
