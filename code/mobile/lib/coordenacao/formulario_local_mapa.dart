import 'dart:typed_data';

import 'package:campus_map/campus_map.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../services/mapa_local_admin_api.dart';

class FormularioLocalMapa extends StatefulWidget {
  const FormularioLocalMapa({
    super.key,
    required this.local,
    required this.api,
  });

  final CampusPlace local;
  final MapaLocalAdminApi api;

  @override
  State<FormularioLocalMapa> createState() => _FormularioLocalMapaState();
}

class _ArquivoLocal {
  const _ArquivoLocal(this.nome, this.bytes);
  final String nome;
  final Uint8List bytes;
}

class _FormularioLocalMapaState extends State<FormularioLocalMapa> {
  late final _descricao = TextEditingController(text: widget.local.description);
  late List<CampusPlaceImage> _imagensAtuais;
  final List<_ArquivoLocal> _novas = [];
  final Map<String, _ArquivoLocal> _substituicoes = {};
  final Set<String> _removidas = {};
  bool _salvando = false;
  double _progresso = 0;
  String? _erro;

  @override
  void initState() {
    super.initState();
    _imagensAtuais = [...widget.local.images];
  }

  @override
  void dispose() {
    _descricao.dispose();
    super.dispose();
  }

  Future<_ArquivoLocal?> _escolherUma() async {
    final resultado = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['png', 'jpg', 'jpeg', 'webp'],
      withData: true,
    );
    final arquivo = resultado?.files.singleOrNull;
    if (arquivo?.bytes == null) return null;
    if (arquivo!.bytes!.length > 10 * 1024 * 1024) {
      setState(() => _erro = 'Cada imagem deve ter até 10 MB.');
      return null;
    }
    return _ArquivoLocal(arquivo.name, arquivo.bytes!);
  }

  Future<void> _adicionar() async {
    final resultado = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['png', 'jpg', 'jpeg', 'webp'],
      allowMultiple: true,
      withData: true,
    );
    if (!mounted || resultado == null) return;
    final disponiveis =
        10 -
        _imagensAtuais.where((i) => !_removidas.contains(i.id)).length -
        _novas.length;
    final arquivos = resultado.files
        .take(disponiveis)
        .where(
          (arquivo) =>
              arquivo.bytes != null &&
              arquivo.bytes!.isNotEmpty &&
              arquivo.bytes!.length <= 10 * 1024 * 1024,
        );
    setState(() {
      _erro = null;
      _novas.addAll(
        arquivos.map((arquivo) => _ArquivoLocal(arquivo.name, arquivo.bytes!)),
      );
    });
  }

  List<CampusPlaceImage> _imagensDaResposta(Map<String, dynamic> resposta) {
    final imagens = resposta['imagens'];
    if (imagens is! List) return _imagensAtuais;
    return [
      for (final item in imagens)
        if (item is Map && item['id'] is String)
          if (Uri.tryParse('${item['url'] ?? ''}') case final url?)
            if (Uri.tryParse('${item['originalUrl'] ?? item['url'] ?? ''}')
                case final original?)
              if (url.hasScheme && original.hasScheme)
                CampusPlaceImage(
                  id: item['id'] as String,
                  url: url,
                  originalUrl: original,
                ),
    ];
  }

  Future<void> _substituir(CampusPlaceImage imagem) async {
    final arquivo = await _escolherUma();
    if (arquivo != null && mounted) {
      setState(() {
        _substituicoes[imagem.id] = arquivo;
        _removidas.remove(imagem.id);
        _erro = null;
      });
    }
  }

  Future<void> _salvar() async {
    if (_salvando) return;
    final operacoes =
        1 +
        _novas.length.clamp(0, 1) +
        _substituicoes.length +
        _removidas.length;
    var concluidas = 0;
    setState(() {
      _salvando = true;
      _erro = null;
      _progresso = 0;
    });
    try {
      // Remoções liberam vagas antes dos uploads. Cada operação concluída é
      // retirada da fila, evitando repeti-la se uma etapa posterior falhar.
      for (final id in [..._removidas]) {
        final resposta = await widget.api.removerImagem(widget.local.id, id);
        concluidas++;
        if (mounted) {
          setState(() {
            _imagensAtuais = _imagensDaResposta(resposta);
            _removidas.remove(id);
            _progresso = concluidas / operacoes;
          });
        }
      }
      for (final entry in [..._substituicoes.entries]) {
        final resposta = await widget.api.substituirImagem(
          widget.local.id,
          entry.key,
          (
          nome: entry.value.nome,
          bytes: entry.value.bytes,
          ),
        );
        concluidas++;
        if (mounted) {
          setState(() {
            _imagensAtuais = _imagensDaResposta(resposta);
            _substituicoes.remove(entry.key);
            _progresso = concluidas / operacoes;
          });
        }
      }
      if (_novas.isNotEmpty) {
        final resposta = await widget.api.adicionarImagens(widget.local.id, [
          for (final a in _novas) (nome: a.nome, bytes: a.bytes),
        ]);
        concluidas++;
        if (mounted) {
          setState(() {
            _imagensAtuais = _imagensDaResposta(resposta);
            _novas.clear();
            _progresso = concluidas / operacoes;
          });
        }
      }
      await widget.api.atualizarDescricao(widget.local.id, _descricao.text);
      if (mounted) Navigator.pop(context, true);
    } catch (erro) {
      if (mounted) {
        setState(() {
          _erro = '$erro';
          _salvando = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Editar informações')),
    body: SafeArea(
      child: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: EdgeInsets.fromLTRB(
          16,
          16,
          16,
          MediaQuery.viewInsetsOf(context).bottom + 24,
        ),
        children: [
          Text(
            widget.local.displayName,
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _descricao,
            minLines: 5,
            maxLines: 12,
            maxLength: 10000,
            enabled: !_salvando,
            decoration: const InputDecoration(
              labelText: 'Descrição',
              hintText: 'Informações úteis sobre este local',
              alignLabelWithHint: true,
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Text(
                  'Imagens',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              TextButton.icon(
                onPressed: _salvando ? null : _adicionar,
                icon: const Icon(Icons.add_photo_alternate_outlined),
                label: const Text('Adicionar'),
              ),
            ],
          ),
          for (final imagem in _imagensAtuais)
            if (!_removidas.contains(imagem.id))
              Card(
                child: ListTile(
                  leading: switch (_substituicoes[imagem.id]) {
                    final arquivo? => Image.memory(
                      arquivo.bytes,
                      width: 64,
                      height: 64,
                      fit: BoxFit.cover,
                    ),
                    null => Image.network(
                      imagem.url.toString(),
                      width: 64,
                      height: 64,
                      fit: BoxFit.cover,
                    ),
                  },
                  title: Text(
                    _substituicoes.containsKey(imagem.id)
                        ? 'Nova imagem selecionada'
                        : 'Imagem cadastrada',
                  ),
                  subtitle: const Text(
                    'A versão atual só será removida após a nova ser salva.',
                  ),
                  trailing: PopupMenuButton<String>(
                    enabled: !_salvando,
                    onSelected: (acao) {
                      if (acao == 'substituir') _substituir(imagem);
                      if (acao == 'remover') {
                        setState(() {
                          _removidas.add(imagem.id);
                          _substituicoes.remove(imagem.id);
                        });
                      }
                    },
                    itemBuilder: (_) => const [
                      PopupMenuItem(
                        value: 'substituir',
                        child: Text('Substituir'),
                      ),
                      PopupMenuItem(value: 'remover', child: Text('Remover')),
                    ],
                  ),
                ),
              ),
          for (var i = 0; i < _novas.length; i++)
            Card(
              child: ListTile(
                leading: Image.memory(
                  _novas[i].bytes,
                  width: 64,
                  height: 64,
                  fit: BoxFit.cover,
                ),
                title: Text(_novas[i].nome),
                subtitle: const Text('Prévia — ainda não enviada'),
                trailing: IconButton(
                  onPressed: _salvando
                      ? null
                      : () => setState(() => _novas.removeAt(i)),
                  icon: const Icon(Icons.close),
                ),
              ),
            ),
          if (_salvando) ...[
            const SizedBox(height: 12),
            LinearProgressIndicator(value: _progresso),
            const SizedBox(height: 6),
            const Text('Enviando e salvando…'),
          ],
          if (_erro != null)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(_erro!, style: TextStyle(color: Colors.red.shade700)),
            ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: _salvando ? null : _salvar,
            icon: const Icon(Icons.save_outlined),
            label: const Text('Salvar informações'),
          ),
        ],
      ),
    ),
  );
}
