import 'package:flutter/material.dart';

import '../models/feed_comment.dart';
import '../theme/colors.dart';
import 'app_feedback.dart';

const _fundoPainel = Color(0xFFF6F3FB);

class FeedCommentsSheet extends StatefulWidget {
  const FeedCommentsSheet({
    super.key,
    required this.comentarios,
    required this.mudancas,
    required this.onSubmit,
    required this.onLike,
    required this.onDelete,
    required this.podeInteragir,
  });
  final List<FeedComment> Function() comentarios;
  final ValueNotifier<int> mudancas;
  final Future<bool> Function(String, int?) onSubmit;
  final Future<bool> Function(FeedComment, int) onLike;
  final Future<bool> Function(FeedComment) onDelete;
  final bool podeInteragir;
  @override
  State<FeedCommentsSheet> createState() => _FeedCommentsSheetState();
}

class _FeedCommentsSheetState extends State<FeedCommentsSheet> {
  final _controller = TextEditingController();
  final _foco = FocusNode();
  final _ocupados = <int>{};
  FeedComment? _respondendo;
  bool _enviando = false;
  @override
  void initState() {
    super.initState();
    widget.mudancas.addListener(_atualizar);
  }

  void _atualizar() {
    if (!mounted) return;
    setState(() {
      if (_respondendo != null &&
          !widget.comentarios().any((c) => c.id == _respondendo!.id)) {
        _respondendo = null;
      }
    });
  }

  @override
  void dispose() {
    widget.mudancas.removeListener(_atualizar);
    _controller.dispose();
    _foco.dispose();
    super.dispose();
  }

  void _responder(FeedComment comentario) {
    if (_enviando || !widget.podeInteragir) return;
    setState(() => _respondendo = comentario);
    if (comentario.paiId != null && _controller.text.isEmpty) {
      _controller.text = '@${comentario.nome} ';
    }
    _foco.requestFocus();
  }

  void _cancelarResposta() {
    final prefixo = '@${_respondendo?.nome} ';
    if (_controller.text.startsWith(prefixo)) {
      _controller.text = _controller.text.substring(prefixo.length);
    }
    setState(() => _respondendo = null);
  }

  Future<void> _enviar() async {
    final texto = _controller.text.trim();
    if (texto.isEmpty || _enviando || !widget.podeInteragir) return;
    setState(() => _enviando = true);
    final salvo = await widget.onSubmit(
      texto,
      _respondendo?.paiId ?? _respondendo?.id,
    );
    if (!mounted) return;
    setState(() {
      _enviando = false;
      if (salvo) {
        _controller.clear();
        _respondendo = null;
      }
    });
    if (!salvo) {
      mostrarFeedback(
        context,
        'Não foi possível salvar o comentário',
        erro: true,
      );
    }
  }

  Future<void> _curtir(FeedComment c) async {
    if (!widget.podeInteragir || !_ocupados.add(c.id)) return;
    setState(() {});
    final salvo = await widget.onLike(c, c.curtidoPorMim ? -1 : 1);
    if (!mounted) return;
    setState(() => _ocupados.remove(c.id));
    if (!salvo) {
      mostrarFeedback(
        context,
        'Não foi possível curtir o comentário',
        erro: true,
      );
    }
  }

  Future<void> _excluir(FeedComment c) async {
    if (_ocupados.contains(c.id)) return;
    final temRespostas = widget.comentarios().any((v) => v.paiId == c.id);
    final confirma = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Excluir comentário?'),
        content: Text(
          temRespostas
              ? 'O comentário e suas respostas serão excluídos.'
              : 'Essa ação não pode ser desfeita.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Excluir'),
          ),
        ],
      ),
    );
    if (confirma != true || !mounted || !_ocupados.add(c.id)) return;
    setState(() {});
    final salvo = await widget.onDelete(c);
    if (!mounted) return;
    setState(() => _ocupados.remove(c.id));
    mostrarFeedback(
      context,
      salvo ? 'Comentário excluído' : 'Não foi possível excluir o comentário',
      erro: !salvo,
    );
  }

  String _tempo(FeedComment c) {
    final data = c.criadoEm;
    if (data == null) return 'agora';
    final diferenca = DateTime.now().difference(data);
    if (diferenca.inMinutes < 1) return 'agora';
    if (diferenca.inHours < 1) return '${diferenca.inMinutes} min';
    if (diferenca.inDays < 1) return '${diferenca.inHours} h';
    return '${data.day.toString().padLeft(2, '0')}/${data.month.toString().padLeft(2, '0')}/${data.year}';
  }

  @override
  Widget build(BuildContext context) {
    final todos = widget.comentarios();
    final ordenados = <FeedComment>[];
    for (final raiz in todos.where((c) => c.paiId == null)) {
      ordenados.add(raiz);
      ordenados.addAll(todos.where((c) => c.paiId == raiz.id));
    }
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: FractionallySizedBox(
        heightFactor: .85,
        child: Material(
          color: _fundoPainel,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
          clipBehavior: Clip.antiAlias,
          child: Column(
            children: [
              const SizedBox(height: 12),
              Container(
                width: 42,
                height: 4,
                decoration: BoxDecoration(
                  color: const Color(0xFFD7D1E3),
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
              const Padding(
                padding: EdgeInsets.fromLTRB(16, 14, 16, 12),
                child: Text(
                  'Comentários',
                  style: TextStyle(
                    color: AppColors.ink,
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -.2,
                  ),
                ),
              ),
              Expanded(
                child: ordenados.isEmpty
                    ? const Center(
                        child: Text(
                          'Seja a primeira pessoa a comentar',
                          style: TextStyle(color: AppColors.muted),
                        ),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.only(top: 2, bottom: 12),
                        itemCount: ordenados.length,
                        itemBuilder: (_, i) => _linha(ordenados[i]),
                      ),
              ),
              if (widget.podeInteragir)
                ColoredBox(
                  color: Colors.white,
                  child: SafeArea(
                    top: false,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (_respondendo != null)
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    'Respondendo a ${_respondendo!.nome}',
                                    style: const TextStyle(
                                      color: AppColors.primary,
                                      fontSize: 12,
                                    ),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                IconButton(
                                  tooltip: 'Cancelar resposta',
                                  onPressed: _enviando
                                      ? null
                                      : _cancelarResposta,
                                  icon: const Icon(Icons.close, size: 18),
                                ),
                              ],
                            ),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Expanded(
                                child: TextField(
                                  controller: _controller,
                                  focusNode: _foco,
                                  enabled: !_enviando,
                                  maxLength: 2000,
                                  minLines: 1,
                                  maxLines: 4,
                                  textCapitalization:
                                      TextCapitalization.sentences,
                                  decoration: InputDecoration(
                                    hintText: 'Escreva um comentário...',
                                    counterText: '',
                                    filled: true,
                                    fillColor: AppColors.lavender,
                                    contentPadding: const EdgeInsets.symmetric(
                                      horizontal: 16,
                                      vertical: 12,
                                    ),
                                    border: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(22),
                                      borderSide: BorderSide.none,
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              IconButton.filled(
                                tooltip: 'Enviar comentário',
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
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _linha(FeedComment c) {
    final ocupado = _ocupados.contains(c.id);
    final resposta = c.paiId != null;
    final tamanho = resposta ? 30.0 : 36.0;
    final iniciais = Center(
      child: Text(
        c.iniciais,
        style: const TextStyle(
          color: AppColors.primary,
          fontWeight: FontWeight.w700,
          fontSize: 12,
        ),
      ),
    );
    return Padding(
      key: ValueKey('comentario-${c.id}'),
      padding: EdgeInsets.fromLTRB(resposta ? 40 : 12, 5, 12, 5),
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 6),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppAccents.cardBorder),
          boxShadow: const [
            BoxShadow(
              color: Color(0x0F2A1B52),
              blurRadius: 10,
              offset: Offset(0, 3),
            ),
          ],
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: tamanho,
              height: tamanho,
              clipBehavior: Clip.antiAlias,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                color: AppColors.lavender,
              ),
              child: c.fotoUrl == null
                  ? iniciais
                  : Image.network(
                      c.fotoUrl!,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => iniciais,
                    ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          c.nome,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: AppColors.ink,
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        _tempo(c),
                        style: const TextStyle(
                          color: AppColors.muted,
                          fontSize: 11.5,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    c.texto,
                    style: const TextStyle(
                      color: AppColors.ink,
                      fontFamily: 'Inter',
                      fontSize: 13.5,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      if (widget.podeInteragir) _botaoCurtir(c, ocupado),
                      if (widget.podeInteragir) const SizedBox(width: 6),
                      if (widget.podeInteragir)
                        TextButton(
                          onPressed: _enviando ? null : () => _responder(c),
                          style: TextButton.styleFrom(
                            padding: const EdgeInsets.symmetric(horizontal: 8),
                            minimumSize: const Size(48, 36),
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            foregroundColor: AppColors.muted,
                          ),
                          child: const Text(
                            'Responder',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      const Spacer(),
                      if (c.podeExcluir)
                        IconButton(
                          tooltip: 'Excluir comentário',
                          onPressed: ocupado ? null : () => _excluir(c),
                          visualDensity: VisualDensity.compact,
                          iconSize: 19,
                          color: AppColors.muted,
                          icon: const Icon(Icons.delete_outline_rounded),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _botaoCurtir(FeedComment c, bool ocupado) {
    final curtido = c.curtidoPorMim;
    final cor = curtido ? const Color(0xFFE0245E) : AppColors.muted;
    return Tooltip(
      message: curtido ? 'Remover curtida' : 'Curtir comentário',
      child: InkWell(
        key: ValueKey('curtir-${c.id}'),
        onTap: ocupado ? null : () => _curtir(c),
        borderRadius: BorderRadius.circular(20),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 160),
                transitionBuilder: (child, animacao) =>
                    ScaleTransition(scale: animacao, child: child),
                child: Icon(
                  curtido
                      ? Icons.favorite_rounded
                      : Icons.favorite_border_rounded,
                  key: ValueKey(curtido),
                  size: 20,
                  color: cor,
                ),
              ),
              if (c.curtidas > 0) ...[
                const SizedBox(width: 4),
                Text(
                  '${c.curtidas}',
                  style: TextStyle(
                    color: cor,
                    fontSize: 12.5,
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
