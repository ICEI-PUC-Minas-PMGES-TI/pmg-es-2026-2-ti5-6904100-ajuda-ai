import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:http/http.dart' as http;

import 'services/api_config.dart';
import 'sessao_usuario.dart';
import 'theme/colors.dart';
import 'widgets/app_bottom_navigation.dart';
import 'widgets/navegacao_app.dart';

const double _feedGutter = 20;
const String _apiBaseUrl = apiBaseUrl;
// O login atual do protótipo usa o perfil Camila. Quando o login real entrar,
// este identificador deve vir do usuário autenticado.
const String _usuarioAtualId = '1';

/// Identidade nas rotas do feed: com o token do aluno, só `Authorization`
/// (o backend ignora `x-user-id`); sem token, o modo antigo por `x-user-id`.
Map<String, String> _identidade() {
  final token = SessaoUsuario.atual.accessToken;
  return token != null
      ? {'authorization': 'Bearer $token'}
      : {'x-user-id': _usuarioAtualId};
}

const String _usuarioAtualNome = 'Camila Duarte';
const String _usuarioAtualIniciais = 'CD';
const String _usuarioAtualCurso = 'Engenharia de Software';

class FeedPage extends StatefulWidget {
  const FeedPage({super.key, this.client});

  final http.Client? client;

  @override
  State<FeedPage> createState() => _FeedPageState();
}

class _FeedPageState extends State<FeedPage> {
  int _filtroSelecionado = 0;
  final List<_Publicacao> _publicacoes = [];
  bool _carregandoPublicacoes = true;
  bool _falhaAoCarregar = false;
  late final http.Client _client;
  late final bool _deveFecharClient;

  @override
  void initState() {
    super.initState();
    _deveFecharClient = widget.client == null;
    _client = widget.client ?? http.Client();
    _carregarPublicacoes();
  }

  @override
  void dispose() {
    if (_deveFecharClient) _client.close();
    super.dispose();
  }

  Future<void> _carregarPublicacoes() async {
    if (mounted) {
      setState(() {
        _carregandoPublicacoes = true;
        _falhaAoCarregar = false;
      });
    }
    try {
      final resposta = await _client.get(
        Uri.parse('$_apiBaseUrl/publicacoes'),
        headers: _identidade(),
      );
      if (resposta.statusCode != 200) throw Exception('Falha ao carregar feed');
      final dados = jsonDecode(resposta.body) as List<dynamic>;
      final publicacoes = dados
          .whereType<Map<String, dynamic>>()
          .map(_Publicacao.fromJson)
          .toList();
      if (!mounted) return;
      setState(() {
        _publicacoes
          ..clear()
          ..addAll(publicacoes);
        _carregandoPublicacoes = false;
        _falhaAoCarregar = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _publicacoes.clear();
        _carregandoPublicacoes = false;
        _falhaAoCarregar = true;
      });
    }
  }

  Future<_Publicacao?> _salvarNoBackend(_Publicacao publicacao) async {
    try {
      final resposta = await _client.post(
        Uri.parse('$_apiBaseUrl/publicacoes'),
        headers: {'Content-Type': 'application/json', ..._identidade()},
        body: jsonEncode(publicacao.toJson()),
      );
      if (resposta.statusCode < 200 || resposta.statusCode >= 300) return null;
      return _Publicacao.fromJson(
        jsonDecode(resposta.body) as Map<String, dynamic>,
      );
    } catch (_) {
      return null;
    }
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
  ) async {
    final id = publicacao.id;
    if (id == null) return null;
    try {
      final resposta = await _client.post(
        Uri.parse('$_apiBaseUrl/publicacoes/$id/comentarios'),
        headers: {'Content-Type': 'application/json', ..._identidade()},
        body: jsonEncode({'texto': comentario}),
      );
      if (resposta.statusCode < 200 || resposta.statusCode >= 300) return null;
      return _Publicacao.fromJson(
        jsonDecode(resposta.body) as Map<String, dynamic>,
      );
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
      return _Publicacao.fromJson(
        jsonDecode(resposta.body) as Map<String, dynamic>,
      );
    } catch (_) {
      return null;
    }
  }

  void _atualizarPublicacao(_Publicacao atualizada) {
    final indice = _publicacoes.indexWhere((item) => item.id == atualizada.id);
    if (indice < 0 || !mounted) return;
    setState(() => _publicacoes[indice] = atualizada);
  }

  Future<void> _abrirCriacao() async {
    final publicacao = await showModalBottomSheet<_Publicacao>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _CriarPublicacaoSheet(),
    );

    if (publicacao == null || !mounted) return;

    final publicacaoSalva = await _salvarNoBackend(publicacao);
    if (!mounted) return;

    if (publicacaoSalva == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Não foi possível publicar. Verifique se a API está ativa e tente novamente.',
          ),
        ),
      );
      return;
    }
    setState(() {
      _publicacoes.insert(0, publicacaoSalva);
      _filtroSelecionado = 0;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Publicação compartilhada no feed!')),
    );
  }

  void _abrirComentarios(_Publicacao publicacao) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ComentariosSheet(
        comentarios: publicacao.comentariosTexto,
        onSubmit: (texto) async {
          final atualizada = await _salvarComentarioNoBackend(
            publicacao,
            texto,
          );
          if (atualizada == null) return false;
          _atualizarPublicacao(atualizada);
          return true;
        },
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
    final filtro = _filtros[_filtroSelecionado];
    final publicacoesVisiveis = filtro == 'Para você'
        ? _publicacoes
        : _publicacoes.where((post) => post.categoria == filtro).toList();

    return Scaffold(
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
                          selecionado: _filtroSelecionado,
                          onSelected: (indice) =>
                              setState(() => _filtroSelecionado = indice),
                        ),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(
                            _feedGutter,
                            4,
                            _feedGutter,
                            14,
                          ),
                          child: _CriarPublicacaoCard(onTap: _abrirCriacao),
                        ),
                        if (_filtroSelecionado == 0) const _DicaDaSemana(),
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
                itemBuilder: (_, indice) => _PublicacaoCard(
                  key: ValueKey(publicacoesVisiveis[indice].id),
                  publicacao: publicacoesVisiveis[indice],
                  onComment: () =>
                      _abrirComentarios(publicacoesVisiveis[indice]),
                  onLike: (delta) async {
                    final indiceReal = _publicacoes.indexOf(
                      publicacoesVisiveis[indice],
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
                    _apagarPublicacao(publicacoesVisiveis[indice]);
                  },
                ),
              ),
            ),
        ],
      ),
      bottomNavigationBar: const _BarraFeed(),
    );
  }
}

class _CabecalhoFeed extends StatelessWidget {
  const _CabecalhoFeed();

  @override
  Widget build(BuildContext context) {
    return Container(
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
                  const Spacer(),
                  _IconeCabecalho(
                    icone: Icons.search_rounded,
                    tooltip: 'Buscar no feed',
                    onTap: () => _mensagem(context, 'Busca no feed'),
                  ),
                  const SizedBox(width: 8),
                  Stack(
                    clipBehavior: Clip.none,
                    children: [
                      _IconeCabecalho(
                        icone: Icons.notifications_none_rounded,
                        tooltip: 'Notificações',
                        onTap: () => _mensagem(context, 'Notificações'),
                      ),
                      const Positioned(
                        right: -1,
                        top: -2,
                        child: CircleAvatar(
                          radius: 8,
                          backgroundColor: Color(0xFF8B5CF6),
                          child: Text(
                            '3',
                            style: TextStyle(
                              color: Colors.white,
                              fontFamily: 'Inter',
                              fontSize: 9,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 20),
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
    );
  }
}

class _IconeCabecalho extends StatelessWidget {
  const _IconeCabecalho({
    required this.icone,
    required this.tooltip,
    required this.onTap,
  });

  final IconData icone;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: SizedBox(
            width: 40,
            height: 40,
            child: Icon(icone, size: 30, color: Colors.white),
          ),
        ),
      ),
    );
  }
}

const _filtros = <String>[
  'Para você',
  'Dicas acadêmicas',
  'Campus',
  'Oportunidades',
];

class _Filtros extends StatelessWidget {
  const _Filtros({required this.selecionado, required this.onSelected});

  final int selecionado;
  final ValueChanged<int> onSelected;

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
        itemCount: _filtros.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (_, indice) {
          final ativo = indice == selecionado;
          return ChoiceChip(
            selected: ativo,
            onSelected: (_) => onSelected(indice),
            showCheckmark: false,
            label: Text(_filtros[indice]),
            avatar: indice == 1
                ? Icon(
                    Icons.school_outlined,
                    size: 17,
                    color: ativo ? Colors.white : AppColors.primary,
                  )
                : null,
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
              const _Avatar(iniciais: 'C', cor: AppColors.primary),
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

class _DicaDaSemana extends StatelessWidget {
  const _DicaDaSemana();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(_feedGutter, 0, _feedGutter, 14),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.lavender,
          border: Border.all(color: const Color(0xFFE9DFF7)),
          borderRadius: BorderRadius.circular(20),
          boxShadow: const [
            BoxShadow(
              color: Color(0x0F420594),
              blurRadius: 12,
              offset: Offset(0, 5),
            ),
          ],
        ),
        child: Stack(
          children: [
            Positioned(
              right: -8,
              top: -20,
              child: Icon(
                Icons.auto_awesome,
                color: AppColors.primary.withValues(alpha: 0.08),
                size: 88,
              ),
            ),
            Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Icon(
                    Icons.lightbulb_outline_rounded,
                    color: AppColors.primary,
                    size: 27,
                  ),
                ),
                const SizedBox(width: 13),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Dica acadêmica da semana',
                        style: TextStyle(
                          color: AppColors.primary,
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      SizedBox(height: 3),
                      Text(
                        'Organize sua entrega de TI, na próxima semana não hávera aula por conta do feriado .',
                        style: TextStyle(
                          color: AppColors.muted,
                          fontFamily: 'Inter',
                          fontSize: 12,
                          height: 1.3,
                        ),
                      ),
                    ],
                  ),
                ),
                const Icon(
                  Icons.arrow_forward_ios_rounded,
                  color: AppColors.primary,
                  size: 16,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PublicacaoCard extends StatefulWidget {
  const _PublicacaoCard({
    super.key,
    required this.publicacao,
    required this.onComment,
    required this.onLike,
    required this.onDelete,
  });

  final _Publicacao publicacao;
  final VoidCallback onComment;
  final Future<bool> Function(int) onLike;
  final VoidCallback onDelete;

  @override
  State<_PublicacaoCard> createState() => _PublicacaoCardState();
}

class _PublicacaoCardState extends State<_PublicacaoCard> {
  final _imagemController = PageController();
  int _pagina = 0;
  late int _curtidas;
  bool _curtido = false;
  bool _alterandoCurtida = false;
  bool _salvo = false;

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
      _salvo = false;
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
                PopupMenuButton<String>(
                  tooltip: 'Mais opções',
                  color: Colors.white,
                  icon: const Icon(
                    Icons.more_horiz_rounded,
                    color: AppColors.muted,
                  ),
                  onSelected: (opcao) {
                    switch (opcao) {
                      case 'apagar':
                        widget.onDelete();
                        break;
                      default:
                        _mensagem(context, opcao);
                    }
                  },
                  itemBuilder: (_) => post.isOwn
                      ? const [
                          PopupMenuItem(
                            value: 'apagar',
                            child: Text('Apagar publicação'),
                          ),
                        ]
                      : const [
                          PopupMenuItem(
                            value: 'Publicação denunciada',
                            child: Text('Denunciar'),
                          ),
                          PopupMenuItem(
                            value: 'Autor silenciado',
                            child: Text('Silenciar autor'),
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
                    itemBuilder: (_, indice) => _ImagemFeed(
                      imagem: post.imagens[indice],
                      indice: indice,
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
            padding: const EdgeInsets.fromLTRB(8, 7, 8, 4),
            child: Row(
              children: [
                _AcaoPost(
                  tooltip: _curtido ? 'Descurtir' : 'Curtir',
                  icone: _curtido
                      ? Icons.favorite_rounded
                      : Icons.favorite_border_rounded,
                  cor: _curtido ? const Color(0xFFE94072) : AppColors.ink,
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
                ),
                _AcaoPost(
                  tooltip: 'Comentar',
                  icone: Icons.chat_bubble_outline_rounded,
                  onTap: widget.onComment,
                ),
                _AcaoPost(
                  tooltip: 'Compartilhar',
                  icone: Icons.send_outlined,
                  onTap: () =>
                      _mensagem(context, 'Link da publicação copiado!'),
                ),
                if (post.imagens.length > 1) ...[
                  const Spacer(),
                  _Indicadores(
                    total: post.imagens.length,
                    selecionado: _pagina,
                  ),
                ],
                const Spacer(),
                _AcaoPost(
                  tooltip: _salvo ? 'Remover dos salvos' : 'Salvar',
                  icone: _salvo
                      ? Icons.bookmark_rounded
                      : Icons.bookmark_border_rounded,
                  cor: _salvo ? AppColors.primary : AppColors.ink,
                  onTap: () => setState(() => _salvo = !_salvo),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$_curtidas curtidas',
                  style: const TextStyle(
                    color: AppColors.ink,
                    fontFamily: 'Inter',
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 5),
                InkWell(
                  onTap: widget.onComment,
                  child: Text(
                    'Ver todos os ${post.comentarios} comentários',
                    style: const TextStyle(
                      color: AppColors.muted,
                      fontFamily: 'Inter',
                      fontSize: 12,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Categoria extends StatelessWidget {
  const _Categoria({required this.categoria});

  final String categoria;

  @override
  Widget build(BuildContext context) {
    final academica = categoria == 'Dicas acadêmicas';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: academica ? AppColors.lavender : const Color(0xFFEAF8F0),
        borderRadius: BorderRadius.circular(9),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            academica ? Icons.school_outlined : Icons.location_city_outlined,
            size: 14,
            color: academica ? AppColors.primary : AppAccents.success,
          ),
          const SizedBox(width: 5),
          Text(
            categoria,
            style: TextStyle(
              color: academica ? AppColors.primary : AppAccents.success,
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
  });

  final String fonte;
  final BoxFit fit;
  final Alignment alignment;

  @override
  Widget build(BuildContext context) {
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

class _ImagemFeed extends StatelessWidget {
  const _ImagemFeed({required this.imagem, required this.indice});

  final String imagem;
  final int indice;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        Container(color: AppColors.lavender),
        _ImagemDaFonte(
          fonte: imagem,
          fit: imagem.contains('pucjardim') ? BoxFit.cover : BoxFit.contain,
          alignment: indice.isEven ? Alignment.center : Alignment.bottomCenter,
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
  });

  final String tooltip;
  final IconData icone;
  final VoidCallback? onTap;
  final Color cor;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: InkResponse(
        onTap: onTap,
        radius: 23,
        child: Padding(
          padding: const EdgeInsets.all(7),
          child: Icon(icone, size: 23, color: cor),
        ),
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
  const _CriarPublicacaoSheet();

  @override
  State<_CriarPublicacaoSheet> createState() => _CriarPublicacaoSheetState();
}

class _CriarPublicacaoSheetState extends State<_CriarPublicacaoSheet> {
  final _controller = TextEditingController();
  final _imagemController = PageController();
  final List<String> _imagens = [];
  String _categoria = 'Dicas acadêmicas';

  @override
  void dispose() {
    _controller.dispose();
    _imagemController.dispose();
    super.dispose();
  }

  Future<void> _adicionarImagem() async {
    if (_imagens.length >= 10) return;

    final resultado = await FilePicker.pickFiles(
      type: FileType.image,
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
          final extensao = (arquivo.extension ?? 'jpg').toLowerCase();
          final mime = switch (extensao) {
            'png' => 'image/png',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            'heic' => 'image/heic',
            _ => 'image/jpeg',
          };
          return 'data:$mime;base64,${base64Encode(bytes)}';
        })
        .whereType<String>()
        .toList();

    if (novasImagens.isNotEmpty) {
      setState(() => _imagens.addAll(novasImagens));
    }
  }

  void _publicar() {
    final texto = _controller.text.trim();
    if (texto.isEmpty) return;

    Navigator.of(context).pop(
      _Publicacao(
        autor: _usuarioAtualNome,
        iniciais: _usuarioAtualIniciais,
        descricaoAutor: _usuarioAtualCurso,
        tempo: 'agora',
        categoria: _categoria,
        texto: texto,
        imagens: List.unmodifiable(_imagens),
        curtidas: 0,
        comentarios: 0,
        corAvatar: AppColors.primary,
        isOwn: true,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final teclado = MediaQuery.viewInsetsOf(context).bottom;

    return AnimatedPadding(
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
                  const Expanded(
                    child: Text(
                      'Criar publicação',
                      style: TextStyle(
                        color: AppColors.ink,
                        fontSize: 21,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Fechar',
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close_rounded),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  const _Avatar(
                    iniciais: _usuarioAtualIniciais,
                    cor: AppColors.primary,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          _usuarioAtualNome,
                          style: TextStyle(
                            color: AppColors.ink,
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 3),
                        DropdownButtonHideUnderline(
                          child: DropdownButton<String>(
                            value: _categoria,
                            isDense: true,
                            borderRadius: BorderRadius.circular(14),
                            style: const TextStyle(
                              color: AppColors.primary,
                              fontFamily: 'Inter',
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                            items: const [
                              DropdownMenuItem(
                                value: 'Dicas acadêmicas',
                                child: Text('Dicas acadêmicas'),
                              ),
                              DropdownMenuItem(
                                value: 'Campus',
                                child: Text('Campus'),
                              ),
                              DropdownMenuItem(
                                value: 'Oportunidades',
                                child: Text('Oportunidades'),
                              ),
                            ],
                            onChanged: (valor) {
                              if (valor != null) {
                                setState(() => _categoria = valor);
                              }
                            },
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _controller,
                autofocus: true,
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
                                      (_imagemController.page ?? 0).round() - 1;
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
                                      (_imagemController.page ?? 0).round() + 1;
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
                            onPressed: () {
                              if (_imagens.isNotEmpty) {
                                setState(() => _imagens.removeLast());
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
                      onPressed: _imagens.length >= 10
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
                      onPressed: _controller.text.trim().isEmpty
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
                      child: const Text(
                        'Publicar',
                        style: TextStyle(
                          fontFamily: 'Inter',
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ComentariosSheet extends StatefulWidget {
  const _ComentariosSheet({required this.comentarios, required this.onSubmit});

  final List<String> comentarios;
  final Future<bool> Function(String) onSubmit;

  @override
  State<_ComentariosSheet> createState() => _ComentariosSheetState();
}

class _ComentariosSheetState extends State<_ComentariosSheet> {
  final _controller = TextEditingController();
  late final List<String> _comentarios;
  bool _enviando = false;

  @override
  void initState() {
    super.initState();
    _comentarios = List.of(widget.comentarios);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _enviar() async {
    final texto = _controller.text.trim();
    if (texto.isEmpty || _enviando) return;
    setState(() => _enviando = true);
    final salvo = await widget.onSubmit(texto);
    if (!mounted) return;
    setState(() {
      _enviando = false;
      if (salvo) {
        _comentarios.add(texto);
        _controller.clear();
      }
    });
    if (!salvo) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Não foi possível salvar o comentário. Tente novamente.',
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Material(
        color: Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 42,
                height: 4,
                decoration: BoxDecoration(
                  color: const Color(0xFFD7D1E3),
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'Comentários',
                style: TextStyle(
                  color: AppColors.ink,
                  fontSize: 19,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 16),
              ..._comentarios.map(
                (comentario) => Padding(
                  padding: const EdgeInsets.only(bottom: 13),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const _Avatar(iniciais: 'AL', cor: Color(0xFF3B82F6)),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF8F7FB),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: Text(
                            comentario,
                            style: const TextStyle(
                              color: AppColors.ink,
                              fontFamily: 'Inter',
                              fontSize: 13,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      onSubmitted: (_) => _enviar(),
                      decoration: InputDecoration(
                        hintText: 'Escreva um comentário...',
                        filled: true,
                        fillColor: const Color(0xFFF8F7FB),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 11,
                        ),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: BorderSide.none,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    onPressed: _enviando ? null : _enviar,
                    style: IconButton.styleFrom(
                      backgroundColor: AppColors.primary,
                    ),
                    icon: const Icon(Icons.send_rounded),
                  ),
                ],
              ),
            ],
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
              'Seja a primeira pessoa a publicar nesta categoria.',
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
    this.isOwn = false,
    this.comentariosTexto = const [],
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
  final int curtidas;
  final bool curtidoPeloUsuario;
  final int comentarios;
  final Color corAvatar;
  final bool verificado;
  final bool isOwn;
  final List<String> comentariosTexto;

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
      autor: json['autor'] as String? ?? _usuarioAtualNome,
      iniciais: json['iniciais'] as String? ?? _usuarioAtualIniciais,
      descricaoAutor: json['descricaoAutor'] as String? ?? _usuarioAtualCurso,
      tempo: json['tempo'] as String? ?? 'agora',
      categoria: json['categoria'] as String? ?? 'Dicas acadêmicas',
      texto: json['texto'] as String? ?? '',
      imagens: imagens,
      curtidas: (json['curtidas'] as num?)?.toInt() ?? 0,
      comentarios:
          (json['comentarios'] as num?)?.toInt() ?? comentariosTexto.length,
      corAvatar: AppColors.primary,
      isOwn: json['isOwn'] as bool? ?? true,
      curtidoPeloUsuario: json['curtidoPeloUsuario'] as bool? ?? false,
      comentariosTexto: comentariosTexto,
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
    imagens: imagens,
    curtidas: curtidas ?? this.curtidas,
    curtidoPeloUsuario: curtidoPeloUsuario ?? this.curtidoPeloUsuario,
    comentarios: comentarios ?? this.comentarios,
    corAvatar: corAvatar,
    verificado: verificado,
    isOwn: isOwn,
    comentariosTexto: comentariosTexto ?? this.comentariosTexto,
  );
}
