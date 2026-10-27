import 'package:flutter/material.dart';

import 'services/lojinha_api.dart';
import 'sessao_usuario.dart';
import 'theme/colors.dart';
import 'widgets/cabecalho_logos.dart';

/// Item que pode ser trocado por XP. Será cadastrado pela coordenação.
class ItemResgate {
  const ItemResgate({
    required this.id,
    required this.nome,
    required this.descricao,
    required this.custoXp,
    this.estoque,
    this.condicoesRetirada = '',
  });

  final Object id;
  final String nome;
  final String descricao;
  final int custoXp;

  /// `null` quando o item não tem limite de unidades.
  final int? estoque;
  final String condicoesRetirada;

  factory ItemResgate.fromJson(Map<String, dynamic> json) => ItemResgate(
    id: json['id'] as String,
    nome: json['nome'] as String,
    descricao: json['descricao'] as String,
    custoXp: json['custoXp'] as int,
    estoque: json['estoque'] as int?,
    condicoesRetirada: json['condicoesRetirada'] as String? ?? '',
  );

  bool get esgotado => estoque != null && estoque! <= 0;
}

String formatarXp(int valor) => valor.toString().replaceAllMapped(
  RegExp(r'(\d)(?=(\d{3})+$)'),
  (encontrado) => '${encontrado[1]}.',
);

class ResgatarPage extends StatefulWidget {
  const ResgatarPage({super.key, required this.saldoXp, this.itens, this.api});

  final int saldoXp;

  /// Enquanto a coordenação não cadastra itens, a lista fica vazia.
  final List<ItemResgate>? itens;
  final LojinhaApi? api;

  @override
  State<ResgatarPage> createState() => _ResgatarPageState();
}

class _ResgatarPageState extends State<ResgatarPage> {
  late final LojinhaApi _api = widget.api ?? LojinhaApi();
  List<ItemResgate> _itens = const [];
  bool _carregando = false;
  bool _resgatando = false;
  String? _erro;
  String? _chavePendente;
  String? _itemPendente;
  late int _saldoXp = widget.saldoXp;

  @override
  void initState() {
    super.initState();
    _itens = widget.itens ?? const [];
    if (widget.itens == null && SessaoUsuario.atual.accessToken != null) {
      _carregar();
    }
  }

  Future<void> _carregar() async {
    final token = SessaoUsuario.atual.accessToken;
    if (token == null) return;
    setState(() {
      _carregando = true;
      _erro = null;
    });
    try {
      final itens = await _api.listar(token);
      if (!mounted || SessaoUsuario.atual.accessToken != token) return;
      setState(() {
        _itens = itens.map(ItemResgate.fromJson).toList();
        _carregando = false;
      });
    } catch (erro) {
      if (!mounted) return;
      setState(() {
        _erro = '$erro';
        _carregando = false;
      });
    }
  }

  Future<void> _confirmar(ItemResgate item) async {
    final confirmou = await showDialog<bool>(
      context: context,
      builder: (contexto) => AlertDialog(
        title: Text('Resgatar ${item.nome}?'),
        content: Text(
          'Serão descontados ${formatarXp(item.custoXp)} XP do seu saldo.\n\n'
          'Retirada: ${item.condicoesRetirada.isEmpty ? 'Consulte a coordenação' : item.condicoesRetirada}',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(contexto).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(contexto).pop(true),
            child: const Text('Resgatar'),
          ),
        ],
      ),
    );
    if (confirmou != true || !mounted || _resgatando) return;
    final token = SessaoUsuario.atual.accessToken;
    if (token == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Entre na sua conta para resgatar.')),
      );
      return;
    }
    if (_itemPendente != item.id.toString()) {
      _itemPendente = item.id.toString();
      _chavePendente = LojinhaApi.novaChave();
    }
    setState(() => _resgatando = true);
    try {
      final resgate = await _api.resgatar(
        token,
        item.id.toString(),
        _chavePendente!,
      );
      if (!mounted || SessaoUsuario.atual.accessToken != token) return;
      _chavePendente = null;
      _itemPendente = null;
      final saldo = resgate['saldoAtual'] as int;
      SessaoUsuario.atual.xp.value = saldo;
      setState(() {
        _saldoXp = saldo;
        _resgatando = false;
      });
      await _carregar();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Resgate confirmado: ${resgate['id']}')),
      );
    } catch (erro) {
      if (!mounted) return;
      setState(() => _resgatando = false);
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('$erro')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const CabecalhoLogos(),
              const SizedBox(height: 16),
              const Text(
                'Resgatar itens',
                style: TextStyle(
                  color: AppColors.ink,
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.4,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'Troque seus pontos por itens oferecidos pela coordenação.',
                style: TextStyle(
                  fontFamily: 'Inter',
                  color: AppColors.muted,
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: 20),
              _CardSaldo(saldoXp: _saldoXp),
              const SizedBox(height: 24),
              if (_carregando)
                const Center(child: CircularProgressIndicator())
              else if (_erro != null)
                TextButton(
                  onPressed: _carregar,
                  child: Text('$_erro — Tentar novamente'),
                )
              else if (_itens.isEmpty)
                const _SemItens()
              else
                for (final item in _itens) ...[
                  _CardItem(
                    item: item,
                    saldoXp: _saldoXp,
                    onResgatar: _resgatando ? null : _confirmar,
                  ),
                  const SizedBox(height: 12),
                ],
            ],
          ),
        ),
      ),
    );
  }
}

class _CardSaldo extends StatelessWidget {
  const _CardSaldo({required this.saldoXp});

  final int saldoXp;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppAccents.headerTop, AppAccents.headerBottom],
        ),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: [
          const Icon(Icons.star_rounded, size: 34, color: AppAccents.star),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Saldo disponível',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    color: Color(0xFFD9CCEC),
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${formatarXp(saldoXp)} XP',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.5,
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

class _SemItens extends StatelessWidget {
  const _SemItens();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 32),
      decoration: BoxDecoration(
        color: AppAccents.cardBg,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppAccents.cardBorder),
      ),
      child: Column(
        children: [
          Container(
            width: 64,
            height: 64,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: AppColors.lavender,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.card_giftcard_rounded,
              size: 32,
              color: AppColors.primary,
            ),
          ),
          const SizedBox(height: 14),
          const Text(
            'Nenhum item disponível ainda',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: AppColors.ink,
              fontSize: 16,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'A coordenação vai cadastrar os itens em breve. '
            'Continue acumulando XP!',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontFamily: 'Inter',
              color: AppColors.muted,
              fontSize: 13,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }
}

class _CardItem extends StatelessWidget {
  const _CardItem({
    required this.item,
    required this.saldoXp,
    required this.onResgatar,
  });

  final ItemResgate item;
  final int saldoXp;
  final Future<void> Function(ItemResgate)? onResgatar;

  @override
  Widget build(BuildContext context) {
    final faltam = item.custoXp - saldoXp;
    final disponivel = !item.esgotado && faltam <= 0;
    final String status;
    if (item.esgotado) {
      status = 'Esgotado';
    } else if (faltam > 0) {
      status = 'Faltam ${formatarXp(faltam)} XP';
    } else {
      status = item.estoque == null
          ? 'Disponível'
          : '${item.estoque} disponíveis';
    }

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppAccents.cardBg,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppAccents.cardBorder),
      ),
      child: Row(
        children: [
          Container(
            width: 56,
            height: 56,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppAccents.tileLilas,
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Icon(
              Icons.card_giftcard_rounded,
              size: 28,
              color: AppColors.primary,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.nome,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.ink,
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  item.descricao,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.muted,
                    fontSize: 12,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  '${formatarXp(item.custoXp)} XP · $status',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    color: disponivel ? AppAccents.success : AppColors.muted,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          FilledButton(
            onPressed: disponivel && onResgatar != null
                ? () => onResgatar!(item)
                : null,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.primary,
              minimumSize: const Size(0, 40),
              padding: const EdgeInsets.symmetric(horizontal: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: const Text(
              'Resgatar',
              style: TextStyle(
                fontFamily: 'Inter',
                fontSize: 13,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
