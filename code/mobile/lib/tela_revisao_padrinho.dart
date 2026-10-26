import 'package:flutter/material.dart';

import 'dados_cadastro.dart';
import 'models/formulario.dart';
import 'sessao_usuario.dart';

class RevisaoPadrinhoPage extends StatefulWidget {
  const RevisaoPadrinhoPage({
    super.key,
    required this.dados,
    required this.perguntas,
    required this.requisitos,
  });
  final DadosCadastro dados;
  final List<PerguntaFormulario> perguntas;
  final List<RequisitoPadrinho> requisitos;
  @override
  State<RevisaoPadrinhoPage> createState() => _RevisaoPadrinhoPageState();
}

class _RevisaoPadrinhoPageState extends State<RevisaoPadrinhoPage> {
  bool _enviando = false;
  String? _erro;
  Future<void> _confirmar() async {
    if (_enviando) return;
    setState(() {
      _enviando = true;
      _erro = null;
    });
    try {
      await SessaoUsuario.atual.registrarCandidaturaPadrinho(
        dadosCadastro: widget.dados,
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (erro) {
      if (mounted) {
        setState(() {
          _erro = '$erro';
          _enviando = false;
        });
      }
    }
  }

  String _valor(Object? valor) => valor is List
      ? valor.join(', ')
      : valor is bool
      ? (valor ? 'Sim' : 'Não')
      : '${valor ?? 'Não informado'}';
  @override
  Widget build(BuildContext context) {
    final dados = widget.dados;
    final respostas = dados.respostasPadrinho();
    final rotulos = {
      'motivacao': 'Motivação',
      'experiencias': 'Experiências',
      'areas': 'Áreas de apoio',
      'disponibilidade': 'Disponibilidade',
      'genero': 'Gênero',
      'bolsistaProuni': 'ProUni',
      'deOutraCidade': 'Outra cidade',
    };
    return PopScope(
      canPop: !_enviando,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Revise sua candidatura'),
          automaticallyImplyLeading: !_enviando,
        ),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text('Ciclo: ${SessaoUsuario.atual.programaAtual}'),
            Text('${dados.nome} • ${dados.email}'),
            Text('${dados.curso} • ${dados.periodo}º período • ${dados.turno}'),
            for (final entrada in rotulos.entries)
              ListTile(
                title: Text(entrada.value),
                subtitle: Text(_valor(respostas[entrada.key])),
              ),
            for (final pergunta in widget.perguntas)
              ListTile(
                title: Text(pergunta.enunciado),
                subtitle: Text(_valor(dados.extras[pergunta.id])),
              ),
            for (final requisito in widget.requisitos)
              ListTile(
                title: Text(requisito.descricao),
                subtitle: Text(
                  dados.requisitosCumpridos[requisito.id] == true
                      ? 'Declaro que cumpro'
                      : 'Não declarado',
                ),
              ),
            const Text(
              'O envio não representa aprovação. A coordenação fará a análise acadêmica.',
            ),
            if (_erro != null)
              Text(_erro!, style: const TextStyle(color: Colors.red)),
            OutlinedButton(
              onPressed: _enviando
                  ? null
                  : () => Navigator.of(context).pop(false),
              child: const Text('Voltar e editar'),
            ),
            FilledButton(
              onPressed: _enviando ? null : _confirmar,
              child: Text(_enviando ? 'Enviando…' : 'Confirmar envio'),
            ),
          ],
        ),
      ),
    );
  }
}
