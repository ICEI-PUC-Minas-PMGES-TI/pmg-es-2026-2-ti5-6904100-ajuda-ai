import 'dart:async';

import 'package:flutter/material.dart';

import 'services/chat_api.dart';
import 'services/api_config.dart';
import 'theme/colors.dart';

class TelaConversas extends StatefulWidget {
  const TelaConversas({
    super.key,
    required this.api,
    required this.programa,
    this.focoEmail,
    this.focoVinculo,
    this.focoGrupo,
    this.mudancasSessao,
    this.escopoValido,
  });
  final ChatApi api;
  final String programa;
  final String? focoEmail;
  final int? focoVinculo, focoGrupo;
  final Listenable? mudancasSessao;
  final bool Function()? escopoValido;
  @override
  State<TelaConversas> createState() => _TelaConversasState();
}

class _TelaConversasState extends State<TelaConversas>
    with WidgetsBindingObserver {
  List<Map<String, dynamic>> _conversas = [];
  String? _erro;
  bool _carregando = true,
      _resumed = true,
      _bloqueada = false,
      _abriuFoco = false;
  int _pedido = 0;
  Timer? _timer;
  bool get _valida => !_bloqueada && (widget.escopoValido?.call() ?? true);
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.mudancasSessao?.addListener(_sessao);
    _carregar();
    _timer = Timer.periodic(const Duration(seconds: 10), (_) {
      if (_resumed && (ModalRoute.of(context)?.isCurrent ?? true)) _carregar();
    });
  }

  @override
  void didUpdateWidget(covariant TelaConversas oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.mudancasSessao != widget.mudancasSessao) {
      oldWidget.mudancasSessao?.removeListener(_sessao);
      widget.mudancasSessao?.addListener(_sessao);
    }
    if (oldWidget.programa != widget.programa || oldWidget.api != widget.api) {
      _pedido++;
      _conversas = [];
      _abriuFoco = false;
      _bloqueada = false;
      _carregar();
    }
  }

  void _sessao() {
    if (!_valida && mounted) {
      _bloqueada = true;
      _pedido++;
      setState(() {
        _conversas = [];
        _carregando = false;
        _erro = 'A conta ou o ciclo mudou. Abra as conversas novamente.';
      });
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _resumed = state == AppLifecycleState.resumed;
    if (_resumed && (ModalRoute.of(context)?.isCurrent ?? true)) _carregar();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _pedido++;
    widget.mudancasSessao?.removeListener(_sessao);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Future<void> _carregar() async {
    if (!_valida) {
      _sessao();
      return;
    }
    final pedido = ++_pedido;
    try {
      final lista = await widget.api.listar(widget.programa);
      if (!mounted || pedido != _pedido || !_valida) return;
      setState(() {
        _conversas = lista;
        _erro = null;
        _carregando = false;
      });
      if (!_abriuFoco &&
          (widget.focoEmail != null ||
              widget.focoVinculo != null ||
              widget.focoGrupo != null)) {
        _abriuFoco = true;
        final alvos = lista.where(
          (c) => widget.focoGrupo != null
              ? c['tipo'] == 'coletivo' && c['grupoId'] == widget.focoGrupo
              : widget.focoVinculo != null
              ? c['tipo'] == 'privado' &&
                    c['matchingVinculoId'] == widget.focoVinculo
              : c['tipo'] == 'privado' &&
                    c['podeEnviar'] == true &&
                    (c['participantes'] as List? ?? []).whereType<Map>().any(
                      (p) => p['email'] == widget.focoEmail,
                    ),
        );
        if (alvos.isNotEmpty) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted && _valida && pedido == _pedido) _abrir(alvos.first);
          });
        }
      }
    } catch (erro) {
      if (mounted && pedido == _pedido) {
        setState(() {
          _erro = '$erro';
          _carregando = false;
          if (erro is ApiException && [401, 403].contains(erro.statusCode)) {
            _conversas = [];
          }
        });
      }
    }
  }

  Future<void> _abrir(Map<String, dynamic> chat) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => TelaConversaChat(
          api: widget.api,
          chat: chat,
          mudancasSessao: widget.mudancasSessao,
          escopoValido: widget.escopoValido,
        ),
      ),
    );
    if (mounted && _valida) await _carregar();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Conversas'),
      actions: [
        IconButton(
          onPressed: _valida ? _carregar : null,
          icon: const Icon(Icons.refresh),
          tooltip: 'Atualizar conversas',
        ),
      ],
    ),
    body: SafeArea(
      child: Column(
        children: [
          if (_carregando) const LinearProgressIndicator(),
          if (_erro != null)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(_erro!, semanticsLabel: _erro),
            ),
          if (!_carregando && _conversas.isEmpty)
            const Padding(
              padding: EdgeInsets.all(24),
              child: Text(
                'Suas conversas aparecem após a confirmação de um vínculo.',
              ),
            ),
          Expanded(
            child: ListView.builder(
              itemCount: _conversas.length,
              itemBuilder: (_, i) {
                final c = _conversas[i];
                final ultima = c['ultimaMensagem'];
                return ListTile(
                  leading: Icon(
                    c['tipo'] == 'coletivo'
                        ? Icons.groups_outlined
                        : Icons.chat_bubble_outline,
                  ),
                  title: Text(tituloConversaChat(c)),
                  subtitle: Text(
                    '${c['programa']} · ${c['tipo'] == 'coletivo' ? 'Grupo' : 'Privado'}${c['podeEnviar'] == true ? '' : ' · Histórico'}\n${ultima is Map ? ultima['texto'] : 'Nenhuma mensagem no seu período.'}',
                  ),
                  isThreeLine: true,
                  trailing: (c['naoLidas'] as num? ?? 0) > 0
                      ? Badge(label: Text('${c['naoLidas']}'))
                      : null,
                  onTap: () => _abrir(c),
                );
              },
            ),
          ),
        ],
      ),
    ),
  );
}

class TelaConversaChat extends StatefulWidget {
  const TelaConversaChat({
    super.key,
    required this.api,
    required this.chat,
    this.mudancasSessao,
    this.escopoValido,
  });
  final ChatApi api;
  final Map<String, dynamic> chat;
  final Listenable? mudancasSessao;
  final bool Function()? escopoValido;
  @override
  State<TelaConversaChat> createState() => _TelaConversaChatState();
}

class _TelaConversaChatState extends State<TelaConversaChat>
    with WidgetsBindingObserver {
  List<Map<String, dynamic>> _mensagens = [];
  late Map<String, dynamic> _acesso;
  final _texto = TextEditingController();
  final _scroll = ScrollController();
  StreamSubscription<Map<String, dynamic>>? _eventos;
  Timer? _reconectar;
  bool _carregando = false,
      _busy = false,
      _repetir = false,
      _temMais = false,
      _enviando = false,
      _incerta = false,
      _bloqueada = false,
      _resumed = true,
      _conectado = false;
  String? _erro, _clientId, _conteudo;
  int _tentativas = 0;
  int get _id => (widget.chat['id'] as num).toInt();
  bool get _valida => !_bloqueada && (widget.escopoValido?.call() ?? true);
  @override
  void initState() {
    super.initState();
    _acesso = {...widget.chat};
    widget.mudancasSessao?.addListener(_sessao);
    WidgetsBinding.instance.addObserver(this);
    _carregar();
  }

  void _sessao() {
    if (!_valida && mounted) {
      _bloqueada = true;
      _parar();
      setState(() {
        _mensagens = [];
        _texto.clear();
        _clientId = null;
        _conteudo = null;
        _incerta = false;
        _acesso['podeEnviar'] = false;
        _erro = 'A conta ou o ciclo mudou. Abra as conversas novamente.';
      });
    }
  }

  void _parar() {
    _tentativas = 0;
    _conectado = false;
    _reconectar?.cancel();
    _reconectar = null;
    final anterior = _eventos;
    _eventos = null;
    unawaited(anterior?.cancel());
  }

  void _agendarReconexao() {
    if (!mounted ||
        !_valida ||
        !_resumed ||
        _acesso['podeEnviar'] != true ||
        (_reconectar?.isActive ?? false)) {
      return;
    }
    final segundos = const [
      3,
      6,
      12,
      24,
      30,
    ][_tentativas > 4 ? 4 : _tentativas];
    _tentativas++;
    _reconectar = Timer(Duration(seconds: segundos), () {
      _reconectar = null;
      _carregar();
    });
  }

  @override
  void dispose() {
    _parar();
    widget.mudancasSessao?.removeListener(_sessao);
    WidgetsBinding.instance.removeObserver(this);
    _texto.dispose();
    _scroll.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _resumed = state == AppLifecycleState.resumed;
    if (!_resumed) {
      _parar();
    } else if (_valida) {
      _carregar();
    }
  }

  void _falha(Object erro) {
    if (erro is ApiException && [401, 403, 404].contains(erro.statusCode)) {
      _bloqueada = true;
      _mensagens = [];
      _texto.clear();
      _clientId = null;
      _conteudo = null;
      _incerta = false;
      _acesso['podeEnviar'] = false;
      _parar();
    }
    _erro = '$erro';
  }

  Future<void> _carregar({bool anteriores = false}) async {
    if (!mounted || !_valida || !_resumed) return;
    if (_busy) {
      _repetir = true;
      return;
    }
    _busy = true;
    setState(() => _carregando = true);
    try {
      final inicial = _mensagens.isEmpty;
      final antes = anteriores && _mensagens.isNotEmpty
          ? (_mensagens.first['id'] as num).toInt()
          : null;
      int? depois = !anteriores && !inicial
          ? (_mensagens.first['id'] as num).toInt() - 1
          : null;
      Map<String, dynamic> pagina;
      do {
        pagina = await widget.api.mensagens(
          _id,
          antesDe: antes,
          depoisDe: depois,
        );
        if (!mounted || !_valida) return;
        final novas = (pagina['mensagens'] as List? ?? [])
            .whereType<Map>()
            .map((m) => Map<String, dynamic>.from(m))
            .toList();
        setState(() {
          _mensagens = mesclarMensagensChat(_mensagens, novas);
          _acesso = {..._acesso, ...pagina};
          if (inicial || anteriores) _temMais = pagina['temMais'] == true;
          _erro = null;
        });
        if (depois != null && novas.isNotEmpty) {
          depois = (novas.last['id'] as num).toInt();
        } else {
          break;
        }
      } while (pagina['temMais'] == true && !anteriores && mounted && _valida);
      if (_acesso['podeEnviar'] == true && _resumed && _eventos == null) {
        _conectar();
      }
      if (_acesso['podeEnviar'] != true) _parar();
      if (inicial) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted && _scroll.hasClients) {
            _scroll.jumpTo(_scroll.position.maxScrollExtent);
          }
        });
      }
    } catch (erro) {
      if (mounted && _valida) {
        setState(() => _falha(erro));
        if (_eventos == null) _agendarReconexao();
      }
    } finally {
      _busy = false;
      if (mounted) {
        setState(() => _carregando = false);
        if (_repetir) {
          _repetir = false;
          scheduleMicrotask(_carregar);
        }
      }
    }
  }

  void _conectar() {
    if (!mounted || !_resumed || !_valida || _acesso['podeEnviar'] != true) {
      return;
    }
    _reconectar?.cancel();
    _eventos = widget.api
        .observar(_id)
        .listen(
          (evento) {
            if (!mounted || !_valida) return;
            final tipo = evento['tipo'];
            if (tipo == 'chat.access') {
              final dados = evento['dados'] as Map? ?? {};
              setState(() {
                _acesso['podeEnviar'] = false;
                _acesso['motivoBloqueio'] =
                    dados['motivoBloqueio'] ??
                    'Acesso alterado. Atualize suas conversas.';
                _conectado = false;
                if (dados['revogado'] == true) _mensagens = [];
              });
              _parar();
              _carregar();
            } else if (tipo == 'chat.ready' || tipo == 'chat.changed') {
              _tentativas = 0;
              setState(() => _conectado = true);
              _carregar();
            }
          },
          onError: (Object erro) {
            if (mounted && _valida) {
              setState(() {
                _conectado = false;
                _falha(erro);
              });
            }
          },
          onDone: () {
            _eventos = null;
            if (mounted &&
                _valida &&
                _resumed &&
                _acesso['podeEnviar'] == true) {
              setState(() => _conectado = false);
              _agendarReconexao();
            }
          },
          cancelOnError: false,
        );
  }

  Future<void> _enviar() async {
    if (_enviando ||
        !_valida ||
        _acesso['podeEnviar'] != true ||
        _texto.text.trim().isEmpty) {
      return;
    }
    _clientId ??= novoIdMensagemChat();
    _conteudo ??= _texto.text.trim();
    setState(() {
      _enviando = true;
      _erro = null;
    });
    try {
      final mensagem = await widget.api.enviar(_id, _conteudo!, _clientId!);
      if (!mounted || !_valida) return;
      setState(() {
        _mensagens = mesclarMensagensChat(_mensagens, [mensagem]);
        _texto.clear();
        _clientId = null;
        _conteudo = null;
        _incerta = false;
      });
      await _carregar();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _scroll.hasClients) {
          _scroll.jumpTo(_scroll.position.maxScrollExtent);
        }
      });
    } catch (erro) {
      if (mounted && _valida) {
        setState(() {
          _incerta = true;
          _falha(erro);
        });
        if (erro is ApiException && erro.statusCode == 409) await _carregar();
      }
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final meus =
        (_acesso['minhasParticipacoesIds'] as List? ??
        [_acesso['minhaParticipacaoId']]);
    return Scaffold(
      appBar: AppBar(
        title: Text(_valida ? tituloConversaChat(widget.chat) : 'Conversas'),
        actions: [
          IconButton(
            onPressed: _valida ? () => _carregar() : null,
            icon: const Icon(Icons.refresh),
            tooltip: 'Atualizar conversa',
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            if (_carregando) const LinearProgressIndicator(),
            if (_acesso['podeEnviar'] != true)
              Padding(
                padding: const EdgeInsets.all(12),
                child: Text(
                  '${_acesso['motivoBloqueio'] ?? 'Conversa disponível somente para consulta.'}',
                ),
              ),
            Expanded(
              child: ListView(
                controller: _scroll,
                padding: const EdgeInsets.all(16),
                children: [
                  if (_temMais)
                    TextButton(
                      onPressed: _carregando
                          ? null
                          : () => _carregar(anteriores: true),
                      child: const Text('Mensagens anteriores'),
                    ),
                  if (!_carregando && _mensagens.isEmpty)
                    const Text(
                      'Nenhuma mensagem no seu período de participação.',
                    ),
                  for (final m in _mensagens)
                    Align(
                      alignment: meus.contains(m['remetenteParticipacaoId'])
                          ? Alignment.centerRight
                          : Alignment.centerLeft,
                      child: Container(
                        margin: const EdgeInsets.only(bottom: 10),
                        padding: const EdgeInsets.all(12),
                        constraints: const BoxConstraints(maxWidth: 300),
                        decoration: BoxDecoration(
                          color: meus.contains(m['remetenteParticipacaoId'])
                              ? AppColors.primary.withValues(alpha: .12)
                              : Colors.grey.shade100,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (widget.chat['tipo'] == 'coletivo' &&
                                !meus.contains(m['remetenteParticipacaoId']))
                              Text(
                                '${m['remetenteNome'] ?? 'Participante'}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            Text('${m['texto']}'),
                            Text(
                              '${m['criadaEm'] ?? ''}',
                              style: const TextStyle(fontSize: 10),
                            ),
                            if (meus.contains(m['remetenteParticipacaoId']))
                              Text(
                                m['estado'] == 'lida'
                                    ? 'Lida por todos'
                                    : m['estado'] == 'entregue'
                                    ? 'Entregue a todos'
                                    : 'Enviada ao servidor',
                                style: const TextStyle(fontSize: 11),
                              ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                _acesso['podeEnviar'] == true
                    ? (_conectado
                          ? 'Atualização conectada'
                          : 'Reconectando à conversa…')
                    : 'Histórico',
              ),
            ),
            if (_erro != null)
              Padding(padding: const EdgeInsets.all(12), child: Text(_erro!)),
            if (_incerta)
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 16),
                child: Text(
                  'Uma nova tentativa envia a mesma mensagem, sem duplicá-la.',
                ),
              ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: TextField(
                      controller: _texto,
                      enabled:
                          _valida &&
                          _acesso['podeEnviar'] == true &&
                          !_enviando &&
                          !_incerta,
                      maxLength: 4000,
                      minLines: 1,
                      maxLines: 4,
                      decoration: const InputDecoration(
                        labelText: 'Digite uma mensagem',
                      ),
                      onChanged: (_) => setState(() {}),
                    ),
                  ),
                  IconButton(
                    onPressed:
                        _valida &&
                            _acesso['podeEnviar'] == true &&
                            !_enviando &&
                            _texto.text.trim().isNotEmpty
                        ? _enviar
                        : null,
                    icon: const Icon(Icons.send),
                    tooltip: _incerta
                        ? 'Tentar enviar novamente'
                        : 'Enviar mensagem',
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
