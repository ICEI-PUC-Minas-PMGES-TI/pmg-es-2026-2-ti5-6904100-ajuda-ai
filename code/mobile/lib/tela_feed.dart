import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:file_picker/file_picker.dart';
import 'package:http/http.dart' as http;

import 'services/api_config.dart';
import 'services/feed_events.dart';
import 'services/feed_image_save.dart';
import 'services/feed_media.dart';
import 'widgets/app_feedback.dart';
import 'widgets/feed_comments_sheet.dart';
import 'models/feed_comment.dart';
import 'sessao_usuario.dart';
import 'main.dart' show estiloBarraClara;
import 'theme/colors.dart';
import 'widgets/app_bottom_navigation.dart';
import 'widgets/navegacao_app.dart';

const double _feedGutter = 20;

String _nomeAutorAtual() => SessaoUsuario.atual.nomeExibicao ?? '';

String _iniciaisDoNome(String nome) {
  final partes = nome
      .split(RegExp(r'\s+'))
      .where((parte) => parte.isNotEmpty)
      .take(2);
  final letras = partes.map((parte) => parte[0].toUpperCase()).join();
  return letras;
}

class FeedPage extends StatefulWidget {
  const FeedPage({
    super.key,
    this.client,
    this.eventsClientFactory,
    this.accessToken,
    this.baseUrl,
    this.nomeAutor,
    this.coordenacao = false,
  });

  final http.Client? client;
  final http.Client Function()? eventsClientFactory;

  /// Sessão explícita da coordenação; o aluno usa a sessão existente por padrão.
  final String? accessToken;
  final String? baseUrl;
  final String? nomeAutor;

  /// Ajusta somente a navegação. Permissões são consultadas e validadas na API.
  final bool coordenacao;

  @override
  State<FeedPage> createState() => _FeedPageState();
}

class _FeedPageState extends State<FeedPage> with WidgetsBindingObserver {
  String _filtroSelecionado = 'Para você';
  final List<_Publicacao> _publicacoes = [];
  bool _carregandoPublicacoes = true;
  bool _falhaAoCarregar = false;
  late final http.Client _client;
  late final bool _deveFecharClient;
  late final FeedEvents _eventos;
  final _mudancas = ValueNotifier<int>(0);
  final _fontes = <String, FeedMedia>{};
  final _cards = <int, ValueNotifier<_Publicacao>>{};
  final _consultas = <int, Future<void>>{};
  final _pendentes = <int>{};
  bool _podePublicar = false;
  bool _consultaAtiva = false;
  bool _consultaPendente = false;
  String _estadoTempoReal = 'Conectando às atualizações…';
  String get _apiBaseUrl => widget.baseUrl ?? apiBaseUrl;
  String? get _token => widget.accessToken ?? SessaoUsuario.atual.accessToken;
  Map<String, String> _identidade() => {
    if (_token != null) 'authorization': 'Bearer $_token',
  };

  @override
  void initState() {
    super.initState();
    diagNav('feed: initState (abre o SSE)');
    _deveFecharClient = widget.client == null;
    _client = widget.client ?? http.Client();
    WidgetsBinding.instance.addObserver(this);
    _eventos = FeedEvents(
      token: () => _token,
      baseUrl: _apiBaseUrl,
      clientFactory: widget.eventsClientFactory,
      onEstado: (estado) {
        if (mounted) setState(() => _estadoTempoReal = estado);
      },
      onEvento: (tipo, dados) {
        final id = (dados['publicacaoId'] as num?)?.toInt();
        if (tipo == 'feed.post.deleted' && id != null) {
          if (mounted) {
            setState(() => _publicacoes.removeWhere((p) => p.id == id));
          }
          _mudancas.value++;
        } else if (id != null) {
          unawaited(_atualizarUma(id));
        } else if (tipo != 'feed.heartbeat') {
          unawaited(_carregarPublicacoes(silencioso: true));
        }
      },
    );
    _eventos.iniciar();
    _carregarPermissoes();
    _carregarPublicacoes();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _eventos.fechar();
    _mudancas.dispose();
    for (final fonte in _fontes.values) {
      fonte.dispose();
    }
    for (final card in _cards.values) {
      card.dispose();
    }
    if (_deveFecharClient) _client.close();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _eventos.fechar();
      _eventos.iniciar();
    } else if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      _eventos.fechar();
    }
  }

  Future<void> _carregarPermissoes() async {
    try {
      final resposta = await _client
          .get(
            Uri.parse('$_apiBaseUrl/publicacoes/permissoes'),
            headers: _identidade(),
          )
          .timeout(const Duration(seconds: 10));
      if (resposta.statusCode == 200 && mounted) {
        final dados = jsonDecode(resposta.body);
        if (dados is Map) {
          setState(() => _podePublicar = dados['podePublicar'] == true);
        }
      }
    } catch (_) {
      /* O servidor verifica a permissão novamente no comando. */
    }
  }

  Future<void> _carregarPublicacoes({bool silencioso = false}) async {
    if (_consultaAtiva) {
      _consultaPendente = true;
      return;
    }
    _consultaAtiva = true;
    if (mounted && !silencioso) {
      setState(() {
        _carregandoPublicacoes = true;
        _falhaAoCarregar = false;
      });
    }
    try {
      final resposta = await _client
          .get(Uri.parse('$_apiBaseUrl/publicacoes'), headers: _identidade())
          .timeout(const Duration(seconds: 15));
      if (resposta.statusCode != 200) throw Exception('Falha ao carregar feed');
      final dados = jsonDecode(resposta.body) as List<dynamic>;
      final publicacoes = dados
          .whereType<Map<String, dynamic>>()
          .map(_lerPublicacao)
          .toList();
      if (!mounted) return;
      setState(() {
        _publicacoes
          ..clear()
          ..addAll(publicacoes);
        for (final p in publicacoes) {
          _estadoCard(p).value = p;
        }
        _carregandoPublicacoes = false;
        _falhaAoCarregar = false;
      });
      _mudancas.value++;
    } catch (_) {
      if (!mounted) return;
      setState(() {
        if (!silencioso) _publicacoes.clear();
        _carregandoPublicacoes = false;
        if (!silencioso) _falhaAoCarregar = true;
      });
    } finally {
      _consultaAtiva = false;
      if (_consultaPendente && mounted) {
        _consultaPendente = false;
        unawaited(_carregarPublicacoes(silencioso: true));
      }
    }
  }

  Future<_Publicacao> _salvarNoBackend(_Publicacao publicacao) async {
    final corpo = jsonEncode({
      'texto': publicacao.texto,
      'categoria': publicacao.categoria,
      'imagens': await _enviarImagens(publicacao.midias),
    });
    final headers = {'Content-Type': 'application/json', ..._identidade()};
    final resposta = await executarRequisicao(
      () => publicacao.id == null
          ? _client.post(
              Uri.parse('$_apiBaseUrl/publicacoes'),
              headers: headers,
              body: corpo,
            )
          : _client.patch(
              Uri.parse('$_apiBaseUrl/publicacoes/${publicacao.id}'),
              headers: headers,
              body: corpo,
            ),
      erroPadrao: 'Não foi possível salvar a publicação',
    );
    return _lerPublicacao(jsonDecode(resposta.body) as Map<String, dynamic>);
  }

  Future<bool> _removerDoBackend(_Publicacao publicacao) async {
    final id = publicacao.id;
    if (id == null) return true;
    try {
      final resposta = await _client.delete(
        Uri.parse('$_apiBaseUrl/publicacoes/$id'),
        headers: _identidade(),
      );
      return resposta.statusCode >= 200 && resposta.statusCode < 300;
    } catch (_) {
      return false;
    }
  }

  Future<_Publicacao?> _salvarComentarioNoBackend(
    _Publicacao publicacao,
    String comentario,
    int? paiId,
  ) async {
    final id = publicacao.id;
    if (id == null) return null;
    try {
      final resposta = await _client.post(
        Uri.parse('$_apiBaseUrl/publicacoes/$id/comentarios'),
        headers: {'Content-Type': 'application/json', ..._identidade()},
        body: jsonEncode({'texto': comentario, 'paiId': ?paiId}),
      );
      if (resposta.statusCode < 200 || resposta.statusCode >= 300) return null;
      return _lerPublicacao(jsonDecode(resposta.body) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<_Publicacao?> _salvarCurtidaNoBackend(
    _Publicacao publicacao,
    int delta,
  ) async {
    final id = publicacao.id;
    if (id == null) return null;
    try {
      final resposta = await _client.post(
        Uri.parse('$_apiBaseUrl/publicacoes/$id/curtidas'),
        headers: {'Content-Type': 'application/json', ..._identidade()},
        body: jsonEncode({'delta': delta}),
      );
      if (resposta.statusCode < 200 || resposta.statusCode >= 300) return null;
      return _lerPublicacao(jsonDecode(resposta.body) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  void _atualizarPublicacao(_Publicacao atualizada) {
    final indice = _publicacoes.indexWhere((item) => item.id == atualizada.id);
    if (!mounted) return;
    if (indice < 0) {
      setState(() {
        _publicacoes.insert(0, atualizada);
        _estadoCard(atualizada);
      });
    } else {
      final mudouCategoria =
          _publicacoes[indice].categoria != atualizada.categoria;
      _publicacoes[indice] = atualizada;
      _estadoCard(atualizada).value = atualizada;
      if (mudouCategoria) setState(() {});
    }
    _mudancas.value++;
  }

  ValueNotifier<_Publicacao> _estadoCard(_Publicacao p) =>
      _cards.putIfAbsent(p.id!, () => ValueNotifier(p));

  _Publicacao _lerPublicacao(Map<String, dynamic> json) {
    final p = _Publicacao.fromJson(json);
    if (!mounted) return p;
    final urls = <String>[];
    for (var i = 0; i < p.imagens.length; i++) {
      final ref = i < p.midias.length ? p.midias[i] : p.imagens[i];
      final fonte = _fontes.putIfAbsent(
        ref,
        () => FeedMedia(ref, p.imagens[i], () => _atualizarUma(p.id!)),
      );
      fonte.receber(p.imagens[i]);
      urls.add(fonte.value);
    }
    return p.copyWith(imagens: urls);
  }

  Future<void> _atualizarUma(int id) {
    final ativa = _consultas[id];
    if (ativa != null) {
      _pendentes.add(id);
      return ativa;
    }
    final trabalho = _consultarUma(id);
    _consultas[id] = trabalho;
    return trabalho;
  }

  Future<void> _consultarUma(int id) async {
    try {
      do {
        _pendentes.remove(id);
        final r = await _client
            .get(
              Uri.parse('$_apiBaseUrl/publicacoes/$id'),
              headers: _identidade(),
            )
            .timeout(const Duration(seconds: 15));
        if (!mounted) return;
        if (r.statusCode == 404) {
          setState(() => _publicacoes.removeWhere((p) => p.id == id));
          _mudancas.value++;
        } else if (r.statusCode == 200) {
          _atualizarPublicacao(
            _lerPublicacao(jsonDecode(r.body) as Map<String, dynamic>),
          );
        }
      } while (_pendentes.contains(id) && mounted);
    } catch (_) {
      // A reconexão/refresh faz a reconciliação sem apagar conteúdo já exibido.
    } finally {
      _consultas.remove(id);
    }
  }

  Future<bool> _acaoComentario(_Publicacao p, int id, {int? delta}) async {
    try {
      final uri = Uri.parse(
        '$_apiBaseUrl/publicacoes/${p.id}/comentarios/$id${delta == null ? '' : '/curtidas'}',
      );
      final r = delta == null
          ? await _client.delete(uri, headers: _identidade())
          : await _client.post(
              uri,
              headers: {'Content-Type': 'application/json', ..._identidade()},
              body: jsonEncode({'delta': delta}),
            );
      if (r.statusCode < 200 || r.statusCode >= 300 || !mounted) return false;
      _atualizarPublicacao(
        _lerPublicacao(jsonDecode(r.body) as Map<String, dynamic>),
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> _abrirCriacao() => _abrirEditor();

  Future<void> _abrirEditor([_Publicacao? original]) async {
    if (!_podePublicar || (original != null && !original.podeAdministrar)) {
      return;
    }
    if (original != null) {
      final fontes = [for (final ref in original.midias) _fontes[ref]]
          .whereType<FeedMedia>()
          .toList();
      await Future.wait(fontes.map((fonte) => fonte.garantirValida()));
      if (!mounted) return;
      original = original.copyWith(
        imagens: [
          for (var i = 0; i < original.imagens.length; i++)
            i < original.midias.length
                ? _fontes[original.midias[i]]?.value ?? original.imagens[i]
                : original.imagens[i],
        ],
      );
    }
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      isDismissible: false,
      enableDrag: false,
      backgroundColor: Colors.transparent,
      builder: (_) => _CriarPublicacaoSheet(
        original: original,
        categorias: {
          ..._categoriasFeed,
          ..._publicacoes.map((p) => p.categoria),
        }.toList(),
        nomeAutor: widget.nomeAutor ?? _nomeAutorAtual(),
        onSalvar: (rascunho) async {
          final salva = await _salvarNoBackend(rascunho);
          if (!mounted) return;
          setState(() {
            final indice = _publicacoes.indexWhere((p) => p.id == salva.id);
            if (indice >= 0) {
              _publicacoes[indice] = salva;
            } else {
              _publicacoes.insert(0, salva);
            }
            _estadoCard(salva).value = salva;
            _filtroSelecionado = 'Para você';
          });
          _mudancas.value++;
        },
      ),
    );
  }

  Future<List<String>> _enviarImagens(List<String> imagens) async {
    final chaves = <String>[];
    for (final imagem in imagens) {
      if (!imagem.startsWith('data:')) {
        chaves.add(imagem);
        continue;
      }
      final uri = UriData.parse(imagem);
      final pedido =
          http.MultipartRequest(
              'POST',
              Uri.parse('$_apiBaseUrl/publicacoes/midias'),
            )
            ..headers.addAll(_identidade())
            ..files.add(
              http.MultipartFile.fromBytes(
                'arquivo',
                uri.contentAsBytes(),
                filename: 'imagem',
              ),
            );
      final resposta = await _client
          .send(pedido)
          .then(http.Response.fromStream)
          .timeout(const Duration(seconds: 60));
      if (resposta.statusCode != 201) {
        throw Exception('Não foi possível enviar a imagem.');
      }
      chaves.add(
        (jsonDecode(resposta.body) as Map<String, dynamic>)['chave'] as String,
      );
    }
    return chaves;
  }

  void _abrirComentarios(_Publicacao publicacao) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => FeedCommentsSheet(
        podeInteragir: publicacao.podeInteragir,
        mudancas: _mudancas,
        comentarios: () =>
            _publicacoes
                .where((p) => p.id == publicacao.id)
                .firstOrNull
                ?.comentariosDetalhes ??
            const [],
        onSubmit: (texto, paiId) async {
          final atualizada = await _salvarComentarioNoBackend(
            publicacao,
            texto,
            paiId,
          );
          if (atualizada == null) return false;
          _atualizarPublicacao(atualizada);
          return true;
        },
        onLike: (comentario, delta) =>
            _acaoComentario(publicacao, comentario.id, delta: delta),
        onDelete: (comentario) => _acaoComentario(publicacao, comentario.id),
      ),
    );
  }

  Future<void> _apagarPublicacao(_Publicacao publicacao) async {
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Apagar publicação?'),
        content: const Text('Essa ação remove a publicação do seu feed.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Apagar'),
          ),
        ],
      ),
    );

    if (confirmar == true && mounted) {
      final removida = await _removerDoBackend(publicacao);
      if (!removida) {
        if (mounted) {
          _mensagem(context, 'Não foi possível apagar no backend.');
        }
        return;
      }
      setState(() => _publicacoes.remove(publicacao));
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtros = <String>[
      'Para você',
      ...{..._categoriasFeed, ..._publicacoes.map((p) => p.categoria)},
    ];
    final filtro = _filtroSelecionado;
    final publicacoesVisiveis = filtro == 'Para você'
        ? _publicacoes
        : _publicacoes.where((post) => post.categoria == filtro).toList();

    return Scaffold(
      appBar: widget.coordenacao
          ? AppBar(title: const Text('Feed do programa'))
          : null,
      backgroundColor: Colors.white,
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: Column(
              children: [
                const _CabecalhoFeed(),
                Transform.translate(
                  offset: const Offset(0, -28),
                  child: Container(
                    clipBehavior: Clip.antiAlias,
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.vertical(
                        top: Radius.circular(28),
                      ),
                      border: Border(
                        top: BorderSide(color: AppAccents.cardBorder),
                        left: BorderSide(color: AppAccents.cardBorder),
                        right: BorderSide(color: AppAccents.cardBorder),
                      ),
                    ),
                    child: Column(
                      children: [
                        _Filtros(
                          opcoes: filtros,
                          selecionado: _filtroSelecionado,
                          onSelected: (indice) =>
                              setState(() => _filtroSelecionado = indice),
                        ),
                        if (_podePublicar)
                          Padding(
                            padding: const EdgeInsets.fromLTRB(
                              _feedGutter,
                              4,
                              _feedGutter,
                              14,
                            ),
                            child: _CriarPublicacaoCard(onTap: _abrirCriacao),
                          ),
                        Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: _feedGutter,
                            vertical: 8,
                          ),
                          child: Text(
                            _estadoTempoReal,
                            style: const TextStyle(
                              color: AppColors.muted,
                              fontFamily: 'Inter',
                              fontSize: 11,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (_carregandoPublicacoes)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_falhaAoCarregar)
            SliverFillRemaining(
              hasScrollBody: false,
              child: _FeedErro(onRetry: _carregarPublicacoes),
            )
          else if (publicacoesVisiveis.isEmpty)
            const SliverFillRemaining(hasScrollBody: false, child: _FeedVazio())
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(
                _feedGutter,
                0,
                _feedGutter,
                24,
              ),
              sliver: SliverList.separated(
                itemCount: publicacoesVisiveis.length,
                separatorBuilder: (_, _) => const SizedBox(height: 14),
                itemBuilder: (_, indice) => ValueListenableBuilder<_Publicacao>(
                  key: ValueKey(publicacoesVisiveis[indice].id),
                  valueListenable: _estadoCard(publicacoesVisiveis[indice]),
                  builder: (_, post, _) => _PublicacaoCard(
                    publicacao: post,
                    fontes: [
                      for (var i = 0; i < post.imagens.length; i++)
                        _fontes[i < post.midias.length
                            ? post.midias[i]
                            : post.imagens[i]]!,
                    ],
                    onComment: () => _abrirComentarios(post),
                    onLike: (delta) async {
                      final indiceReal = _publicacoes.indexWhere(
                        (p) => p.id == post.id,
                      );
                      if (indiceReal < 0) return false;
                      final atual = _publicacoes[indiceReal];
                      final atualizada = await _salvarCurtidaNoBackend(
                        atual,
                        delta,
                      );
                      if (atualizada == null) {
                        if (context.mounted) {
                          _mensagem(
                            context,
                            'Não foi possível registrar a curtida. Tente novamente.',
                          );
                        }
                        return false;
                      }
                      _atualizarPublicacao(atualizada);
                      return true;
                    },
                    onDelete: () {
                      _apagarPublicacao(post);
                    },
                    onEdit: () => _abrirEditor(post),
                    onSaveImage: (fonte) =>
                        salvarImagemDoFeed(fonte, client: _client),
                  ),
                ),
              ),
            ),
        ],
      ),
      bottomNavigationBar: widget.coordenacao ? null : const _BarraFeed(),
    );
  }
}

class _CabecalhoFeed extends StatelessWidget {
  const _CabecalhoFeed();

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: estiloBarraClara,
      child: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [AppAccents.headerTop, AppAccents.headerBottom],
          ),
        ),
        child: SafeArea(
          bottom: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 44),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Image.asset(
                      'assets/images/logo.png',
                      height: 40,
                      color: Colors.white,
                      semanticLabel: 'Ajuda-aí',
                    ),
                    const SizedBox(width: 14),
                    Image.asset(
                      'assets/images/puclogo.png',
                      height: 40,
                      color: Colors.white,
                      semanticLabel: 'PUC Minas',
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                const Text(
                  'Feed',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.5,
                  ),
                ),
                const SizedBox(height: 7),
                const Text(
                  'Descubra, compartilhe e viva o campus.',
                  style: TextStyle(
                    color: Color(0xFFD9CCEC),
                    fontFamily: 'Inter',
                    fontSize: 15,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

const _categoriasFeed = <String>[
  'Comunicados',
  'Dicas acadêmicas',
  'Campus',
  'Oportunidades',
];

class _Filtros extends StatelessWidget {
  const _Filtros({
    required this.opcoes,
    required this.selecionado,
    required this.onSelected,
  });

  final List<String> opcoes;
  final String selecionado;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 70,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(
          horizontal: _feedGutter,
          vertical: 14,
        ),
        scrollDirection: Axis.horizontal,
        itemCount: opcoes.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (_, indice) {
          final ativo = opcoes[indice] == selecionado;
          return ChoiceChip(
            selected: ativo,
            onSelected: (_) => onSelected(opcoes[indice]),
            showCheckmark: false,
            label: Text(opcoes[indice]),
            avatar: Icon(
              _estiloCategoria(opcoes[indice]).icone,
              size: 17,
              color: ativo ? Colors.white : AppColors.primary,
            ),
            labelStyle: TextStyle(
              color: ativo ? Colors.white : AppColors.ink,
              fontFamily: 'Inter',
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
            backgroundColor: Colors.white,
            selectedColor: AppColors.primary,
            side: BorderSide(
              color: ativo ? AppColors.primary : const Color(0xFFEAE6F2),
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
          );
        },
      ),
    );
  }
}

class _CriarPublicacaoCard extends StatelessWidget {
  const _CriarPublicacaoCard({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            border: Border.all(color: const Color(0xFFEDE9F4)),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Row(
            children: [
              _Avatar(
                iniciais: _iniciaisDoNome(_nomeAutorAtual()),
                cor: AppColors.primary,
              ),
              const SizedBox(width: 11),
              const Expanded(
                child: Text(
                  'Compartilhe algo com a comunidade...',
                  maxLines: 2,
                  style: TextStyle(
                    color: AppColors.muted,
                    fontFamily: 'Inter',
                    fontSize: 13,
                    height: 1.25,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  color: AppColors.primary,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.add_rounded, color: Colors.white, size: 18),
                    SizedBox(width: 4),
                    Text(
                      'Criar',
                      style: TextStyle(
                        color: Colors.white,
                        fontFamily: 'Inter',
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PublicacaoCard extends StatefulWidget {
  const _PublicacaoCard({
    required this.publicacao,
    required this.onComment,
    required this.onLike,
    required this.onDelete,
    required this.onEdit,
    required this.onSaveImage,
    required this.fontes,
  });

  final _Publicacao publicacao;
  final VoidCallback onComment;
  final Future<bool> Function(int) onLike;
  final VoidCallback onDelete;
  final VoidCallback onEdit;
  final Future<void> Function(String) onSaveImage;
  final List<FeedMedia> fontes;

  @override
  State<_PublicacaoCard> createState() => _PublicacaoCardState();
}

class _PublicacaoCardState extends State<_PublicacaoCard> {
  final _imagemController = PageController();
  int _pagina = 0;
  late int _curtidas;
  bool _curtido = false;
  bool _alterandoCurtida = false;

  @override
  void initState() {
    super.initState();
    _curtidas = widget.publicacao.curtidas;
    _curtido = widget.publicacao.curtidoPeloUsuario;
  }

  @override
  void didUpdateWidget(covariant _PublicacaoCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.publicacao != widget.publicacao) {
      _pagina = 0;
      _curtidas = widget.publicacao.curtidas;
      _curtido = widget.publicacao.curtidoPeloUsuario;
    }
  }

  @override
  void dispose() {
    _imagemController.dispose();
    super.dispose();
  }

  void _irParaImagem(int pagina) {
    if (pagina < 0 || pagina >= widget.publicacao.imagens.length) return;
    _imagemController.animateToPage(
      pagina,
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    final post = widget.publicacao;

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: const Color(0xFFEDEAF3)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0A1B1340),
            blurRadius: 12,
            offset: Offset(0, 5),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 10, 12),
            child: Row(
              children: [
                _Avatar(iniciais: post.iniciais, cor: post.corAvatar),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              post.autor,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: AppColors.ink,
                                fontSize: 14,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                          if (post.verificado) ...[
                            const SizedBox(width: 4),
                            const Icon(
                              Icons.verified_rounded,
                              size: 15,
                              color: AppColors.primary,
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${post.descricaoAutor}  •  ${post.tempo}',
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: AppColors.muted,
                          fontFamily: 'Inter',
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                ),
                // Sem ações reais (editar/apagar) não há menu: nada de
                // "Denunciar" ou "Silenciar", que não faziam nada.
                if (post.podeAdministrar || post.podeExcluir)
                  PopupMenuButton<String>(
                    tooltip: 'Mais opções',
                    color: Colors.white,
                    icon: const Icon(
                      Icons.more_horiz_rounded,
                      color: AppColors.muted,
                    ),
                    onSelected: (opcao) {
                      switch (opcao) {
                        case 'editar':
                          widget.onEdit();
                          break;
                        case 'apagar':
                          widget.onDelete();
                          break;
                      }
                    },
                    itemBuilder: (_) => post.podeAdministrar
                        ? const [
                            PopupMenuItem(
                              value: 'editar',
                              child: Text('Editar publicação'),
                            ),
                            PopupMenuItem(
                              value: 'apagar',
                              child: Text('Apagar publicação'),
                            ),
                          ]
                        : const [
                            PopupMenuItem(
                              value: 'apagar',
                              child: Text('Apagar publicação'),
                            ),
                          ],
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _Categoria(categoria: post.categoria),
                const SizedBox(height: 9),
                Text(
                  post.texto,
                  style: const TextStyle(
                    color: AppColors.ink,
                    fontFamily: 'Inter',
                    fontSize: 13,
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
          if (post.imagens.isNotEmpty)
            Stack(
              children: [
                AspectRatio(
                  aspectRatio: 1.32,
                  child: PageView.builder(
                    controller: _imagemController,
                    itemCount: post.imagens.length,
                    onPageChanged: (pagina) => setState(() => _pagina = pagina),
                    itemBuilder: (_, indice) => Semantics(
                      button: true,
                      label:
                          'Abrir imagem ${indice + 1} de ${post.imagens.length}',
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: () => Navigator.of(context).push<void>(
                          PageRouteBuilder<void>(
                            transitionDuration: const Duration(
                              milliseconds: 250,
                            ),
                            reverseTransitionDuration: const Duration(
                              milliseconds: 200,
                            ),
                            pageBuilder: (_, _, _) => _ImagemTelaCheia(
                              fonte: post.imagens[indice],
                              heroTag: (this, indice),
                              salvarImagem: widget.onSaveImage,
                              midia: widget.fontes[indice],
                            ),
                            transitionsBuilder: (_, animation, _, child) =>
                                FadeTransition(
                                  opacity: animation,
                                  child: child,
                                ),
                          ),
                        ),
                        child: _ImagemFeed(
                          imagem: post.imagens[indice],
                          indice: indice,
                          heroTag: (this, indice),
                          midia: widget.fontes[indice],
                        ),
                      ),
                    ),
                  ),
                ),
                if (post.imagens.length > 1)
                  Positioned.fill(
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        _SetaImagem(
                          icone: Icons.chevron_left_rounded,
                          onTap: () => _irParaImagem(_pagina - 1),
                        ),
                        _SetaImagem(
                          icone: Icons.chevron_right_rounded,
                          onTap: () => _irParaImagem(_pagina + 1),
                        ),
                      ],
                    ),
                  ),
                if (post.imagens.length > 1)
                  Positioned(
                    top: 12,
                    right: 12,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 9,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.ink.withValues(alpha: 0.78),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Text(
                        '${_pagina + 1}/${post.imagens.length}',
                        style: const TextStyle(
                          color: Colors.white,
                          fontFamily: 'Inter',
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 4, 12, 8),
            child: Row(
              children: [
                if (post.podeInteragir)
                  _AcaoPost(
                    tooltip: _curtido ? 'Descurtir' : 'Curtir',
                    icone: _curtido
                        ? Icons.favorite_rounded
                        : Icons.favorite_border_rounded,
                    cor: _curtido ? const Color(0xFFE94072) : AppColors.ink,
                    contagem: _curtidas,
                    onTap: () async {
                      if (_alterandoCurtida) return;
                      final delta = _curtido ? -1 : 1;
                      setState(() {
                        _alterandoCurtida = true;
                        _curtido = !_curtido;
                        _curtidas += delta;
                      });
                      final salvo = await widget.onLike(delta);
                      if (!mounted) return;
                      setState(() {
                        _alterandoCurtida = false;
                        if (!salvo) {
                          _curtido = !_curtido;
                          _curtidas -= delta;
                        }
                      });
                    },
                  )
                else
                  _ContagemFixa(
                    icone: Icons.favorite_border_rounded,
                    contagem: _curtidas,
                  ),
                _AcaoPost(
                  tooltip: post.podeInteragir ? 'Comentar' : 'Ver comentários',
                  icone: Icons.chat_bubble_outline_rounded,
                  contagem: post.comentarios,
                  onTap: widget.onComment,
                ),
                const Spacer(),
                if (post.imagens.length > 1)
                  _Indicadores(
                    total: post.imagens.length,
                    selecionado: _pagina,
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _EstiloCategoria {
  const _EstiloCategoria(this.icone, this.cor, this.fundo);
  final IconData icone;
  final Color cor;
  final Color fundo;
}

/// Uma cor por categoria, para o feed ser escaneável de relance.
_EstiloCategoria _estiloCategoria(String categoria) => switch (categoria) {
  'Para você' => const _EstiloCategoria(
    Icons.auto_awesome_outlined,
    AppColors.primary,
    AppColors.lavender,
  ),
  'Comunicados' => const _EstiloCategoria(
    Icons.campaign_outlined,
    Color(0xFFC2410C),
    AppAccents.tileLaranja,
  ),
  'Dicas acadêmicas' => const _EstiloCategoria(
    Icons.school_outlined,
    AppColors.primary,
    AppColors.lavender,
  ),
  'Campus' => const _EstiloCategoria(
    Icons.location_city_outlined,
    AppAccents.success,
    AppAccents.successBg,
  ),
  'Oportunidades' => const _EstiloCategoria(
    Icons.work_outline_rounded,
    Color(0xFF1D4ED8),
    AppAccents.tileAzul,
  ),
  _ => const _EstiloCategoria(
    Icons.tag_rounded,
    AppColors.muted,
    AppColors.lavender,
  ),
};

class _Categoria extends StatelessWidget {
  const _Categoria({required this.categoria});

  final String categoria;

  @override
  Widget build(BuildContext context) {
    final estilo = _estiloCategoria(categoria);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: estilo.fundo,
        borderRadius: BorderRadius.circular(9),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(estilo.icone, size: 14, color: estilo.cor),
          const SizedBox(width: 5),
          Text(
            categoria,
            style: TextStyle(
              color: estilo.cor,
              fontFamily: 'Inter',
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _ImagemDaFonte extends StatelessWidget {
  const _ImagemDaFonte({
    required this.fonte,
    required this.fit,
    this.alignment = Alignment.center,
    this.midia,
  });

  final String fonte;
  final BoxFit fit;
  final Alignment alignment;
  final FeedMedia? midia;

  @override
  Widget build(BuildContext context) {
    final atual = midia;
    if (atual != null) {
      return ValueListenableBuilder<String>(
        valueListenable: atual,
        builder: (_, url, _) => _renderizar(url),
      );
    }
    return _renderizar(fonte);
  }

  Widget _renderizar(String fonte) {
    final esquema = Uri.tryParse(fonte)?.scheme;
    if (esquema == 'https' || esquema == 'http') {
      return Image.network(
        fonte,
        fit: fit,
        alignment: alignment,
        errorBuilder: (_, _, _) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            unawaited(midia?.garantirValida(erro: true, urlComErro: fonte));
          });
          return const Center(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.broken_image_outlined, color: Colors.grey),
                  SizedBox(height: 8),
                  Text(
                    'Não foi possível carregar a imagem.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.grey, fontSize: 13),
                  ),
                ],
              ),
            ),
          );
        },
      );
    }

    if (!fonte.startsWith('data:')) {
      return Image.asset(fonte, fit: fit, alignment: alignment);
    }

    final separador = fonte.indexOf(',');
    if (separador < 0) return const SizedBox.shrink();

    try {
      final bytes = base64Decode(fonte.substring(separador + 1));
      return Image.memory(bytes, fit: fit, alignment: alignment);
    } catch (_) {
      return const SizedBox.shrink();
    }
  }
}

class _ImagemTelaCheia extends StatefulWidget {
  const _ImagemTelaCheia({
    required this.fonte,
    required this.heroTag,
    required this.salvarImagem,
    required this.midia,
  });

  final String fonte;
  final Object heroTag;
  final Future<void> Function(String) salvarImagem;
  final FeedMedia midia;

  @override
  State<_ImagemTelaCheia> createState() => _ImagemTelaCheiaState();
}

class _ImagemTelaCheiaState extends State<_ImagemTelaCheia> {
  final _transformacao = TransformationController();
  bool _salvando = false;

  @override
  void dispose() {
    _transformacao.dispose();
    super.dispose();
  }

  Future<void> _salvar() async {
    if (_salvando) return;
    setState(() => _salvando = true);
    var mensagem = 'Imagem salva na galeria';
    try {
      await widget.midia.garantirValida();
      final url = widget.midia.value;
      try {
        await widget.salvarImagem(url);
      } on FeedImageDownloadException catch (erro) {
        if (erro.statusCode != 401 && erro.statusCode != 403) rethrow;
        await widget.midia.garantirValida(erro: true, urlComErro: url);
        if (widget.midia.value == url) rethrow;
        await widget.salvarImagem(widget.midia.value);
      }
    } catch (_) {
      mensagem = 'Não foi possível salvar a imagem';
    } finally {
      if (mounted) {
        setState(() => _salvando = false);
        mostrarFeedback(
          context,
          mensagem,
          erro: mensagem != 'Imagem salva na galeria',
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        leading: IconButton(
          tooltip: 'Fechar imagem',
          icon: const Icon(Icons.close),
          onPressed: () => Navigator.of(context).pop(),
        ),
        actions: [
          IconButton(
            tooltip: 'Salvar imagem',
            onPressed: _salvando ? null : _salvar,
            icon: _salvando
                ? const SizedBox.square(
                    dimension: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                      semanticsLabel: 'Salvando imagem',
                    ),
                  )
                : const Icon(Icons.download_outlined),
          ),
        ],
      ),
      body: SafeArea(
        child: InteractiveViewer(
          transformationController: _transformacao,
          minScale: 1,
          maxScale: 5,
          child: SizedBox.expand(
            child: Hero(
              tag: widget.heroTag,
              child: _ImagemDaFonte(
                fonte: widget.fonte,
                fit: BoxFit.contain,
                midia: widget.midia,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ImagemFeed extends StatelessWidget {
  const _ImagemFeed({
    required this.imagem,
    required this.indice,
    required this.heroTag,
    required this.midia,
  });

  final String imagem;
  final int indice;
  final Object heroTag;
  final FeedMedia midia;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        Container(color: AppColors.lavender),
        Hero(
          tag: heroTag,
          child: _ImagemDaFonte(
            fonte: imagem,
            midia: midia,
            fit: imagem.contains('pucjardim') ? BoxFit.cover : BoxFit.contain,
            alignment: indice.isEven
                ? Alignment.center
                : Alignment.bottomCenter,
          ),
        ),
        if (imagem.contains('pucjardim'))
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Colors.transparent, Color(0x660C0730)],
                stops: [0.6, 1],
              ),
            ),
          ),
      ],
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.iniciais, required this.cor});

  final String iniciais;
  final Color cor;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 42,
      height: 42,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: cor.withValues(alpha: 0.13),
        shape: BoxShape.circle,
        border: Border.all(color: cor.withValues(alpha: 0.3), width: 1.5),
      ),
      child: Text(
        iniciais,
        style: TextStyle(color: cor, fontSize: 14, fontWeight: FontWeight.w800),
      ),
    );
  }
}

class _AcaoPost extends StatelessWidget {
  const _AcaoPost({
    required this.tooltip,
    required this.icone,
    required this.onTap,
    this.cor = AppColors.ink,
    this.contagem,
  });

  final String tooltip;
  final IconData icone;
  final VoidCallback? onTap;
  final Color cor;
  final int? contagem;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icone, size: 22, color: cor),
              if (contagem != null) ...[
                const SizedBox(width: 5),
                Text(
                  '$contagem',
                  style: TextStyle(
                    color: cor,
                    fontFamily: 'Inter',
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Contagem sem ação (quem não pode curtir ainda vê o total).
class _ContagemFixa extends StatelessWidget {
  const _ContagemFixa({required this.icone, required this.contagem});

  final IconData icone;
  final int contagem;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 8),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icone, size: 22, color: AppColors.muted),
          const SizedBox(width: 5),
          Text(
            '$contagem',
            style: const TextStyle(
              color: AppColors.muted,
              fontFamily: 'Inter',
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _SetaImagem extends StatelessWidget {
  const _SetaImagem({required this.icone, required this.onTap});

  final IconData icone;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.ink.withValues(alpha: 0.5),
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(3),
          child: Icon(icone, color: Colors.white, size: 27),
        ),
      ),
    );
  }
}

class _Indicadores extends StatelessWidget {
  const _Indicadores({required this.total, required this.selecionado});

  final int total;
  final int selecionado;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(
        total,
        (indice) => AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          width: indice == selecionado ? 14 : 6,
          height: 6,
          margin: const EdgeInsets.symmetric(horizontal: 2),
          decoration: BoxDecoration(
            color: indice == selecionado
                ? AppColors.primary
                : const Color(0xFFD7D1E3),
            borderRadius: BorderRadius.circular(8),
          ),
        ),
      ),
    );
  }
}

class _BarraFeed extends StatelessWidget {
  const _BarraFeed();

  @override
  Widget build(BuildContext context) {
    return AppBottomNavigation(
      selected: AppDestination.feed,
      destinations: SessaoUsuario.atual.destinos,
      onSelected: (destination) =>
          navegarDestino(context, destination, atual: AppDestination.feed),
    );
  }
}

class _CriarPublicacaoSheet extends StatefulWidget {
  const _CriarPublicacaoSheet({
    required this.nomeAutor,
    required this.onSalvar,
    required this.categorias,
    this.original,
  });
  final String nomeAutor;
  final List<String> categorias;
  final _Publicacao? original;
  final Future<void> Function(_Publicacao) onSalvar;

  @override
  State<_CriarPublicacaoSheet> createState() => _CriarPublicacaoSheetState();
}

class _CriarPublicacaoSheetState extends State<_CriarPublicacaoSheet> {
  final _controller = TextEditingController();
  final _imagemController = PageController();
  final List<String> _imagens = [];
  final List<String> _referencias = [];
  String _categoria = 'Dicas acadêmicas';
  bool _salvando = false;
  String? _erro;

  @override
  void initState() {
    super.initState();
    final original = widget.original;
    if (original != null) {
      _controller.text = original.texto;
      _categoria = original.categoria;
      _imagens.addAll(original.imagens);
      _referencias.addAll(original.midias);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    _imagemController.dispose();
    super.dispose();
  }

  Future<void> _adicionarImagem() async {
    if (_salvando || _imagens.length >= 10) return;

    final resultado = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['png', 'jpg', 'jpeg', 'webp'],
      allowMultiple: true,
      withData: true,
    );
    if (!mounted || resultado == null) return;

    final restantes = 10 - _imagens.length;
    final novasImagens = resultado.files
        .take(restantes)
        .map((arquivo) {
          final bytes = arquivo.bytes;
          if (bytes == null || bytes.isEmpty) return null;
          if (bytes.length > 5 * 1024 * 1024) {
            setState(() => _erro = 'Cada imagem deve ter até 5 MB.');
            return null;
          }
          final extensao = (arquivo.extension ?? 'jpg').toLowerCase();
          final mime = switch (extensao) {
            'png' => 'image/png',
            'webp' => 'image/webp',
            _ => 'image/jpeg',
          };
          return 'data:$mime;base64,${base64Encode(bytes)}';
        })
        .whereType<String>()
        .toList();

    if (novasImagens.isNotEmpty) {
      setState(() {
        _imagens.addAll(novasImagens);
        _referencias.addAll(novasImagens);
      });
    }
  }

  Future<void> _publicar() async {
    final texto = _controller.text.trim();
    if (_salvando || (texto.isEmpty && _imagens.isEmpty)) return;
    setState(() {
      _salvando = true;
      _erro = null;
    });
    try {
      await widget.onSalvar(
        _Publicacao(
          id: widget.original?.id,
          autor: widget.original?.autor ?? widget.nomeAutor,
          iniciais:
              widget.original?.iniciais ?? _iniciaisDoNome(widget.nomeAutor),
          descricaoAutor:
              widget.original?.descricaoAutor ?? 'Administração do programa',
          tempo: 'agora',
          categoria: _categoria,
          texto: texto,
          imagens: List.unmodifiable(_imagens),
          midias: List.unmodifiable(_referencias),
          curtidas: 0,
          comentarios: 0,
          corAvatar: AppColors.primary,
          podeAdministrar: true,
        ),
      );
      if (mounted) Navigator.of(context).pop();
    } catch (erro) {
      if (mounted) setState(() => _erro = erro.toString());
    } finally {
      if (mounted) setState(() => _salvando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final teclado = MediaQuery.viewInsetsOf(context).bottom;

    return PopScope(
      canPop: !_salvando,
      child: AnimatedPadding(
        duration: const Duration(milliseconds: 180),
        padding: EdgeInsets.only(bottom: teclado),
        child: Material(
          color: Colors.white,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
          clipBehavior: Clip.antiAlias,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 22),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 42,
                    height: 4,
                    decoration: BoxDecoration(
                      color: const Color(0xFFD7D1E3),
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        widget.original == null
                            ? 'Criar publicação'
                            : 'Editar publicação',
                        style: const TextStyle(
                          color: AppColors.ink,
                          fontSize: 21,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Fechar',
                      onPressed: _salvando
                          ? null
                          : () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close_rounded),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    _Avatar(
                      iniciais: _iniciaisDoNome(widget.nomeAutor),
                      cor: AppColors.primary,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            widget.nomeAutor,
                            style: TextStyle(
                              color: AppColors.ink,
                              fontSize: 14,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            _categoria,
                            style: const TextStyle(
                              color: AppColors.primary,
                              fontFamily: 'Inter',
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                // Chips no lugar do menu suspenso: o menu tirava o foco do
                // texto, fechava o teclado e ficava solto no topo da tela.
                Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  children: [
                    for (final c in {_categoria, ...widget.categorias})
                      ChoiceChip(
                        selected: c == _categoria,
                        showCheckmark: false,
                        label: Text(c),
                        avatar: Icon(
                          _estiloCategoria(c).icone,
                          size: 16,
                          color: c == _categoria
                              ? Colors.white
                              : AppColors.primary,
                        ),
                        labelStyle: TextStyle(
                          color: c == _categoria ? Colors.white : AppColors.ink,
                          fontFamily: 'Inter',
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                        backgroundColor: Colors.white,
                        selectedColor: AppColors.primary,
                        side: BorderSide(
                          color: c == _categoria
                              ? AppColors.primary
                              : const Color(0xFFEAE6F2),
                        ),
                        onSelected: _salvando
                            ? null
                            : (_) => setState(() => _categoria = c),
                      ),
                  ],
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _controller,
                  enabled: !_salvando,
                  maxLength: 10000,
                  minLines: 4,
                  maxLines: 7,
                  onChanged: (_) => setState(() {}),
                  style: const TextStyle(
                    color: AppColors.ink,
                    fontFamily: 'Inter',
                    fontSize: 15,
                    height: 1.4,
                  ),
                  decoration: InputDecoration(
                    hintText: 'O que você quer compartilhar?',
                    hintStyle: const TextStyle(color: AppColors.muted),
                    filled: true,
                    fillColor: const Color(0xFFF8F7FB),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(18),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
                if (_imagens.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(16),
                    child: Stack(
                      children: [
                        AspectRatio(
                          aspectRatio: 2.1,
                          child: PageView.builder(
                            controller: _imagemController,
                            itemCount: _imagens.length,
                            itemBuilder: (_, indice) => _ImagemDaFonte(
                              fonte: _imagens[indice],
                              fit: BoxFit.cover,
                            ),
                          ),
                        ),
                        if (_imagens.length > 1)
                          Positioned.fill(
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                _SetaImagem(
                                  icone: Icons.chevron_left_rounded,
                                  onTap: () {
                                    final pagina =
                                        (_imagemController.page ?? 0).round() -
                                        1;
                                    if (pagina >= 0) {
                                      _imagemController.animateToPage(
                                        pagina,
                                        duration: const Duration(
                                          milliseconds: 220,
                                        ),
                                        curve: Curves.easeOut,
                                      );
                                    }
                                  },
                                ),
                                _SetaImagem(
                                  icone: Icons.chevron_right_rounded,
                                  onTap: () {
                                    final pagina =
                                        (_imagemController.page ?? 0).round() +
                                        1;
                                    if (pagina < _imagens.length) {
                                      _imagemController.animateToPage(
                                        pagina,
                                        duration: const Duration(
                                          milliseconds: 220,
                                        ),
                                        curve: Curves.easeOut,
                                      );
                                    }
                                  },
                                ),
                              ],
                            ),
                          ),
                        Positioned(
                          right: 8,
                          top: 8,
                          child: Material(
                            color: AppColors.ink.withValues(alpha: 0.75),
                            shape: const CircleBorder(),
                            child: IconButton(
                              tooltip: 'Remover imagem',
                              onPressed: _salvando
                                  ? null
                                  : () {
                                      if (_imagens.isNotEmpty) {
                                        final indice =
                                            (_imagemController.hasClients
                                                    ? (_imagemController.page ??
                                                              0)
                                                          .round()
                                                    : 0)
                                                .clamp(0, _imagens.length - 1);
                                        setState(() {
                                          _imagens.removeAt(indice);
                                          _referencias.removeAt(indice);
                                        });
                                      }
                                    },
                              icon: const Icon(
                                Icons.close_rounded,
                                color: Colors.white,
                                size: 19,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _salvando || _imagens.length >= 10
                            ? null
                            : _adicionarImagem,
                        icon: const Icon(Icons.image_outlined, size: 19),
                        label: Text('Adicionar foto (${_imagens.length}/10)'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.primary,
                          side: const BorderSide(color: Color(0xFFD9CDEB)),
                          padding: const EdgeInsets.symmetric(vertical: 13),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: FilledButton(
                        onPressed:
                            _salvando ||
                                (_controller.text.trim().isEmpty &&
                                    _imagens.isEmpty)
                            ? null
                            : _publicar,
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          disabledBackgroundColor: const Color(0xFFD7D1E3),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                        child: Text(
                          _salvando
                              ? 'Salvando…'
                              : widget.original == null
                              ? 'Publicar'
                              : 'Salvar alterações',
                          style: const TextStyle(
                            fontFamily: 'Inter',
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                if (_erro != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(
                      _erro!,
                      style: const TextStyle(color: Colors.red),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _FeedVazio extends StatelessWidget {
  const _FeedVazio();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 74,
              height: 74,
              decoration: const BoxDecoration(
                color: AppColors.lavender,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.dynamic_feed_outlined,
                color: AppColors.primary,
                size: 34,
              ),
            ),
            const SizedBox(height: 14),
            const Text(
              'Nada por aqui ainda',
              style: TextStyle(
                color: AppColors.ink,
                fontSize: 17,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 5),
            const Text(
              'As publicações da administração aparecerão aqui.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: AppColors.muted,
                fontFamily: 'Inter',
                fontSize: 13,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FeedErro extends StatelessWidget {
  const _FeedErro({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.cloud_off_outlined,
            color: AppColors.muted,
            size: 38,
          ),
          const SizedBox(height: 12),
          const Text(
            'Não foi possível carregar o feed',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.ink, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: onRetry,
            child: const Text('Tentar novamente'),
          ),
        ],
      ),
    ),
  );
}

void _mensagem(BuildContext context, String texto) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(texto)));
}

class _Publicacao {
  const _Publicacao({
    this.id,
    required this.autor,
    required this.iniciais,
    required this.descricaoAutor,
    required this.tempo,
    required this.categoria,
    required this.texto,
    required this.imagens,
    required this.curtidas,
    required this.comentarios,
    required this.corAvatar,
    this.verificado = false,
    this.podeAdministrar = false,
    this.podeExcluir = false,
    this.podeInteragir = false,
    this.midias = const [],
    this.comentariosTexto = const [],
    this.comentariosDetalhes = const [],
    this.curtidoPeloUsuario = false,
  });

  final int? id;
  final String autor;
  final String iniciais;
  final String descricaoAutor;
  final String tempo;
  final String categoria;
  final String texto;
  final List<String> imagens;
  final List<String> midias;
  final int curtidas;
  final bool curtidoPeloUsuario;
  final int comentarios;
  final Color corAvatar;
  final bool verificado;
  final bool podeAdministrar;
  final bool podeExcluir;
  final bool podeInteragir;
  final List<String> comentariosTexto;
  final List<FeedComment> comentariosDetalhes;

  factory _Publicacao.fromJson(Map<String, dynamic> json) {
    final imagens = (json['imagens'] as List<dynamic>? ?? const [])
        .whereType<String>()
        .toList();
    final comentariosTexto =
        (json['comentariosTexto'] as List<dynamic>? ?? const [])
            .whereType<String>()
            .toList();

    return _Publicacao(
      id: (json['id'] as num?)?.toInt(),
      autor: json['autor'] as String? ?? '',
      iniciais: json['iniciais'] as String? ?? '',
      descricaoAutor: json['descricaoAutor'] as String? ?? '',
      tempo: json['tempo'] as String? ?? 'agora',
      categoria: json['categoria'] as String? ?? 'Dicas acadêmicas',
      texto: json['texto'] as String? ?? '',
      imagens: imagens,
      midias: (json['midias'] as List? ?? imagens).whereType<String>().toList(),
      curtidas: (json['curtidas'] as num?)?.toInt() ?? 0,
      comentarios:
          (json['comentarios'] as num?)?.toInt() ?? comentariosTexto.length,
      corAvatar: AppColors.primary,
      podeAdministrar: json['podeAdministrar'] as bool? ?? false,
      podeExcluir: json['podeExcluir'] as bool? ?? false,
      podeInteragir: json['podeInteragir'] == true,
      curtidoPeloUsuario: json['curtidoPeloUsuario'] as bool? ?? false,
      comentariosTexto: comentariosTexto,
      comentariosDetalhes: json['comentariosDetalhes'] is List
          ? (json['comentariosDetalhes'] as List)
                .whereType<Map<String, dynamic>>()
                .map(FeedComment.fromJson)
                .toList()
          : [
              for (var i = 0; i < comentariosTexto.length; i++)
                FeedComment(
                  id: -i - 1,
                  texto: comentariosTexto[i],
                  autorId: '',
                  nome: 'Usuário indisponível',
                ),
            ],
    );
  }

  Map<String, dynamic> toJson() => {
    'autor': autor,
    'iniciais': iniciais,
    'descricaoAutor': descricaoAutor,
    'tempo': tempo,
    'categoria': categoria,
    'texto': texto,
    'imagens': imagens,
  };

  _Publicacao copyWith({
    List<String>? imagens,
    int? curtidas,
    bool? curtidoPeloUsuario,
    int? comentarios,
    List<String>? comentariosTexto,
  }) => _Publicacao(
    id: id,
    autor: autor,
    iniciais: iniciais,
    descricaoAutor: descricaoAutor,
    tempo: tempo,
    categoria: categoria,
    texto: texto,
    imagens: imagens ?? this.imagens,
    midias: midias,
    curtidas: curtidas ?? this.curtidas,
    curtidoPeloUsuario: curtidoPeloUsuario ?? this.curtidoPeloUsuario,
    comentarios: comentarios ?? this.comentarios,
    corAvatar: corAvatar,
    verificado: verificado,
    podeAdministrar: podeAdministrar,
    podeExcluir: podeExcluir,
    podeInteragir: podeInteragir,
    comentariosTexto: comentariosTexto ?? this.comentariosTexto,
    comentariosDetalhes: comentariosDetalhes,
  );
}
