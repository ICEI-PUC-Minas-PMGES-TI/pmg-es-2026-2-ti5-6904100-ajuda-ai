import 'package:flutter/material.dart';

import '../services/coordenacao_api.dart';
import '../theme/colors.dart';
import 'componentes_coord.dart';

/// Criar comunicado (`POST /coordenacao/comunicados`): aparece nas
/// notificações dos alunos do público escolhido.
class TelaComunicadoCoord extends StatefulWidget {
  const TelaComunicadoCoord({super.key, required this.api});

  final CoordenacaoApi api;

  @override
  State<TelaComunicadoCoord> createState() => _TelaComunicadoCoordState();
}

class _TelaComunicadoCoordState extends State<TelaComunicadoCoord> {
  final _titulo = TextEditingController();
  final _descricao = TextEditingController();
  String _publico = 'todos';
  bool _enviando = false;
  bool _validar = false;

  @override
  void dispose() {
    _titulo.dispose();
    _descricao.dispose();
    super.dispose();
  }

  Future<void> _publicar() async {
    final titulo = _titulo.text.trim();
    final descricao = _descricao.text.trim();
    if (titulo.isEmpty || descricao.isEmpty) {
      setState(() => _validar = true);
      return;
    }
    setState(() => _enviando = true);
    try {
      await widget.api.criarComunicado(
        titulo: titulo,
        descricao: descricao,
        publico: _publico,
      );
      if (!mounted) return;
      mostrarMensagemCoord(context, 'Comunicado publicado.');
      Navigator.of(context).pop(true);
    } catch (erro) {
      if (!mounted) return;
      setState(() => _enviando = false);
      mostrarMensagemCoord(context, mensagemDeErro(erro));
    }
  }

  InputDecoration _decoracao(String rotulo, {String? erro}) => InputDecoration(
    labelText: rotulo,
    errorText: erro,
    filled: true,
    fillColor: Colors.white,
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
  );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: corFundoCoord,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.only(bottom: 24),
          children: [
            const CabecalhoCoord(
              voltar: true,
              titulo: 'Criar comunicado',
              subtitulo:
                  'O aviso aparece nas notificações dos alunos selecionados.',
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(
                    controller: _titulo,
                    maxLength: 120,
                    decoration: _decoracao(
                      'Título',
                      erro: _validar && _titulo.text.trim().isEmpty
                          ? 'Informe o título.'
                          : null,
                    ),
                    onChanged: (_) {
                      if (_validar) setState(() {});
                    },
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _descricao,
                    minLines: 3,
                    maxLines: 6,
                    maxLength: 500,
                    decoration: _decoracao(
                      'Mensagem',
                      erro: _validar && _descricao.text.trim().isEmpty
                          ? 'Escreva a mensagem.'
                          : null,
                    ),
                    onChanged: (_) {
                      if (_validar) setState(() {});
                    },
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Público',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 6),
                  SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(value: 'todos', label: Text('Todos')),
                      ButtonSegment(
                        value: 'padrinhos',
                        label: Text('Padrinhos'),
                      ),
                      ButtonSegment(
                        value: 'apadrinhados',
                        label: Text('Apadrinhados'),
                      ),
                    ],
                    selected: {_publico},
                    showSelectedIcon: false,
                    onSelectionChanged: (valor) =>
                        setState(() => _publico = valor.first),
                  ),
                  const SizedBox(height: 20),
                  FilledButton.icon(
                    onPressed: _enviando ? null : _publicar,
                    icon: const Icon(Icons.campaign_outlined),
                    label: Text(
                      _enviando ? 'Publicando...' : 'Publicar comunicado',
                    ),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      minimumSize: const Size.fromHeight(50),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
