import 'dart:async';

import 'package:flutter/material.dart';

import 'services/api_config.dart';
import 'services/chat_api.dart';
import 'sessao_usuario.dart';
import 'theme/colors.dart';

class TelaChat extends StatefulWidget {
  const TelaChat({super.key, required this.destinatarioEmail, this.api});

  final String destinatarioEmail;
  final ChatApi? api;

  @override
  State<TelaChat> createState() => _TelaChatState();
}

class _TelaChatState extends State<TelaChat> {
  late final ChatApi _api;
  final _texto = TextEditingController();
  final _lista = ScrollController();
  final List<MensagemChat> _mensagens = [];
  ConversaChat? _conversa;
  Timer? _sincronizacao;
  bool _carregando = true;
  bool _atualizando = false;
  bool _enviando = false;
  String? _erro;

  @override
  void initState() {
    super.initState();
    _api =
        widget.api ??
        ChatApi(
          accessToken: SessaoUsuario.atual.accessToken,
          baseUrl: SessaoUsuario.atual.participacoesApi.baseUrl,
        );
    _carregarConversa();
  }

  @override
  void dispose() {
    _sincronizacao?.cancel();
    _texto.dispose();
    _lista.dispose();
    super.dispose();
  }

  String _mensagemErro(Object erro) =>
      erro.toString().replaceFirst('Exception: ', '');

  Future<void> _carregarConversa() async {
    if (_atualizando) return;
    _atualizando = true;
    setState(() {
      _carregando = true;
      _erro = null;
    });
    try {
      final email = widget.destinatarioEmail.trim().toLowerCase();
      final conversas = await _api.listar();
      ConversaChat? encontrada;
      for (final conversa in conversas) {
        if (conversa.participantes.any(
          (participante) => participante.email.trim().toLowerCase() == email,
        )) {
          encontrada = conversa;
          break;
        }
      }
      if (encontrada == null) {
        throw const ApiException(
          'Não há uma conversa ativa com essa pessoa neste programa.',
        );
      }
      final pagina = await _api.listarMensagens(encontrada.id);
      if (!mounted) return;
      setState(() {
        _conversa = encontrada;
        _mensagens
          ..clear()
          ..addAll(pagina.mensagens);
        _carregando = false;
      });
      _iniciarSincronizacao();
      _rolarAoFim();
    } catch (erro) {
      if (mounted) {
        setState(() {
          _erro = _mensagemErro(erro);
          _carregando = false;
        });
      }
    } finally {
      _atualizando = false;
    }
  }

  void _iniciarSincronizacao() {
    _sincronizacao?.cancel();
    _sincronizacao = Timer.periodic(
      const Duration(seconds: 30),
      (_) => _atualizarMensagens(),
    );
  }

  Future<void> _atualizarMensagens() async {
    final conversa = _conversa;
    if (conversa == null || _atualizando) return;
    _atualizando = true;
    try {
      final pagina = await _api.listarMensagens(conversa.id);
      if (!mounted) return;
      setState(() {
        _mensagens
          ..clear()
          ..addAll(pagina.mensagens);
        _erro = null;
      });
      _rolarAoFim();
    } catch (erro) {
      if (mounted) setState(() => _erro = _mensagemErro(erro));
    } finally {
      _atualizando = false;
    }
  }

  Future<void> _atualizar() =>
      _conversa == null ? _carregarConversa() : _atualizarMensagens();

  Future<void> _enviar() async {
    final conversa = _conversa;
    final conteudo = _texto.text.trim();
    if (conversa == null || conteudo.isEmpty || _enviando) return;
    setState(() {
      _enviando = true;
      _erro = null;
    });
    try {
      final mensagem = await _api.enviarMensagem(conversa.id, conteudo);
      if (!mounted) return;
      setState(() {
        _mensagens.add(mensagem);
        _texto.clear();
      });
      _rolarAoFim();
    } catch (erro) {
      if (mounted) setState(() => _erro = _mensagemErro(erro));
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  void _rolarAoFim() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_lista.hasClients) {
        _lista.animateTo(
          _lista.position.maxScrollExtent,
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
        );
      }
    });
  }

  String _hora(DateTime? data) {
    if (data == null) return '';
    final local = data.toLocal();
    return '${local.hour.toString().padLeft(2, '0')}:'
        '${local.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final outraPessoa = _conversa?.outraPessoa;
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(outraPessoa?.nome ?? 'Conversa'),
            if (_conversa?.programa case final programa?
                when programa.isNotEmpty)
              Text(programa, style: Theme.of(context).textTheme.labelSmall),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Atualizar mensagens',
            onPressed: _atualizar,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: Column(
        children: [
          if (_erro != null)
            MaterialBanner(
              content: Text(_erro!),
              actions: [
                TextButton(
                  onPressed: _atualizar,
                  child: const Text('Tentar novamente'),
                ),
              ],
            ),
          Expanded(
            child: _carregando
                ? const Center(
                    child: CircularProgressIndicator(color: AppColors.primary),
                  )
                : _conversa == null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        _erro ?? 'Não foi possível abrir esta conversa.',
                        textAlign: TextAlign.center,
                      ),
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: _atualizarMensagens,
                    child: ListView.builder(
                      controller: _lista,
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.all(16),
                      itemCount: _mensagens.isEmpty ? 1 : _mensagens.length,
                      itemBuilder: (context, index) {
                        if (_mensagens.isEmpty) {
                          return const Padding(
                            padding: EdgeInsets.only(top: 32),
                            child: Center(
                              child: Text('Ainda não há mensagens.'),
                            ),
                          );
                        }
                        final mensagem = _mensagens[index];
                        return _BalaoMensagem(
                          mensagem: mensagem,
                          minha:
                              mensagem.remetenteParticipacaoId ==
                              _conversa!.minhaParticipacaoId,
                          hora: _hora(mensagem.criadaEm),
                        );
                      },
                    ),
                  ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: TextField(
                      key: const Key('chat-message-input'),
                      controller: _texto,
                      enabled: _conversa != null && !_enviando,
                      minLines: 1,
                      maxLines: 4,
                      maxLength: 4000,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(
                        hintText: 'Escreva uma mensagem',
                        counterText: '',
                        border: OutlineInputBorder(),
                      ),
                      onSubmitted: (_) => _enviar(),
                    ),
                  ),
                  IconButton.filled(
                    key: const Key('chat-send'),
                    tooltip: 'Enviar mensagem',
                    onPressed: _conversa == null || _enviando ? null : _enviar,
                    icon: _enviando
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.send_rounded),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _BalaoMensagem extends StatelessWidget {
  const _BalaoMensagem({
    required this.mensagem,
    required this.minha,
    required this.hora,
  });

  final MensagemChat mensagem;
  final bool minha;
  final String hora;

  @override
  Widget build(BuildContext context) {
    final fundo = minha ? AppColors.primary : AppAccents.tileLilas;
    final texto = minha ? Colors.white : AppColors.ink;
    return Align(
      alignment: minha ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 300),
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: fundo,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            if (mensagem.imagemUrl case final url? when url.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Image.network(
                  url,
                  width: 240,
                  errorBuilder: (_, _, _) => const Text('Imagem indisponível'),
                ),
              ),
            if (mensagem.texto.isNotEmpty)
              Align(
                alignment: Alignment.centerLeft,
                child: Text(mensagem.texto, style: TextStyle(color: texto)),
              ),
            if (hora.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  hora,
                  style: TextStyle(
                    color: texto.withValues(alpha: 0.75),
                    fontSize: 10,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
