import 'package:flutter/material.dart';

import '../theme/colors.dart';

/// Quem curtiu um post ou comentário (`GET .../curtidas`) ou um dos curtidores
/// recentes que já vêm junto do feed.
class Curtidor {
  const Curtidor({required this.nome, this.fotoUrl, this.coordenacao = false});

  final String nome;
  final String? fotoUrl;

  /// Curtida da coordenação (selo, DP-01).
  final bool coordenacao;

  factory Curtidor.fromJson(Map<String, dynamic> json) {
    // A lista completa traz `autor: {nome, fotoUrl}`; os recentes do feed
    // trazem `nome` e `fotoUrl` direto.
    final autor = json['autor'] as Map<String, dynamic>? ?? json;
    return Curtidor(
      nome: autor['nome'] as String? ?? 'Usuário indisponível',
      fotoUrl: autor['fotoUrl'] as String?,
      coordenacao: json['coordenacao'] == true,
    );
  }

  String get iniciais => nome
      .split(RegExp(r'\s+'))
      .where((p) => p.isNotEmpty)
      .take(2)
      .map((p) => p[0].toUpperCase())
      .join();

  String get primeiroNome {
    final partes = nome.trim().split(RegExp(r'\s+'));
    return partes.isEmpty || partes.first.isEmpty ? nome : partes.first;
  }
}

/// "Curtido por Camila e outras 2 pessoas". `null` quando ninguém curtiu.
///
/// Usa só o que já veio no feed ([recentes], mais novos primeiro, e o
/// [total]); se faltarem nomes, cai para "N curtidas" em vez de inventar.
String? textoCurtidoPor(List<Curtidor> recentes, int total) {
  if (total <= 0) return null;
  if (total == 1 && recentes.isNotEmpty) {
    return 'Curtido por ${recentes.first.nome}';
  }
  if (total == 2 && recentes.length >= 2) {
    return 'Curtido por ${recentes[0].primeiroNome} e ${recentes[1].primeiroNome}';
  }
  if (total >= 3 && recentes.isNotEmpty) {
    return 'Curtido por ${recentes.first.primeiroNome} e outras ${total - 1} pessoas';
  }
  return total == 1 ? '1 curtida' : '$total curtidas';
}

/// Avatar de um curtidor (foto ou iniciais).
class _AvatarCurtidor extends StatelessWidget {
  const _AvatarCurtidor({required this.curtidor, required this.tamanho});

  final Curtidor curtidor;
  final double tamanho;

  @override
  Widget build(BuildContext context) {
    final iniciais = Center(
      child: Text(
        curtidor.iniciais,
        style: TextStyle(
          color: AppColors.primary,
          fontWeight: FontWeight.w700,
          fontSize: tamanho * 0.34,
        ),
      ),
    );
    return Container(
      width: tamanho,
      height: tamanho,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: AppColors.lavender,
        border: Border.all(color: Colors.white, width: 1.5),
      ),
      child: curtidor.fotoUrl == null
          ? iniciais
          : Image.network(
              curtidor.fotoUrl!,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) => iniciais,
            ),
    );
  }
}

/// Linha compacta sob as ações do post, no estilo do Instagram: avatares
/// sobrepostos + "Curtido por ...". Tocar abre a lista completa.
class CurtidoPorLinha extends StatelessWidget {
  const CurtidoPorLinha({
    super.key,
    required this.recentes,
    required this.total,
    required this.onTap,
  });

  final List<Curtidor> recentes;
  final int total;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final texto = textoCurtidoPor(recentes, total);
    if (texto == null) return const SizedBox.shrink();
    // Avatares só quando os nomes batem com o total (sem dado velho).
    final avatares = recentes.take(total.clamp(0, 3)).toList();
    const tamanho = 22.0;
    const sobreposicao = 8.0;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 40),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          child: Row(
            children: [
              if (avatares.isNotEmpty && texto.startsWith('Curtido por')) ...[
                SizedBox(
                  width:
                      tamanho +
                      (avatares.length - 1) * (tamanho - sobreposicao),
                  height: tamanho,
                  child: Stack(
                    children: [
                      for (var i = avatares.length - 1; i >= 0; i--)
                        Positioned(
                          left: i * (tamanho - sobreposicao),
                          child: _AvatarCurtidor(
                            curtidor: avatares[i],
                            tamanho: tamanho,
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
              ],
              Expanded(
                child: Text(
                  texto,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.ink,
                    fontFamily: 'Inter',
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

const _alturaLinha = 56.0;
const _fracaoMaxima = 0.65;

/// Folha "Quem curtiu".
///
/// A altura inicial vem do [total] já conhecido pelo feed (nada de abrir
/// enorme e encolher): enquanto carrega aparecem esqueletos na mesma
/// quantidade, e a chegada dos dados só ajusta a diferença, suavemente.
/// [emCache] mostra de imediato uma lista anterior que ainda bate com o total.
Future<void> mostrarCurtidores(
  BuildContext context, {
  required String titulo,
  required int total,
  required Future<List<Curtidor>> Function() buscar,
  List<Curtidor>? emCache,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (_) => FolhaCurtidores(
      titulo: titulo,
      total: total,
      buscar: buscar,
      emCache: emCache,
    ),
  );
}

class FolhaCurtidores extends StatefulWidget {
  const FolhaCurtidores({
    super.key,
    required this.titulo,
    required this.total,
    required this.buscar,
    this.emCache,
  });

  final String titulo;
  final int total;
  final Future<List<Curtidor>> Function() buscar;
  final List<Curtidor>? emCache;

  @override
  State<FolhaCurtidores> createState() => _FolhaCurtidoresState();
}

class _FolhaCurtidoresState extends State<FolhaCurtidores> {
  List<Curtidor>? _lista;
  bool _erro = false;
  int _consulta = 0;

  @override
  void initState() {
    super.initState();
    _lista = widget.emCache;
    _carregar();
  }

  Future<void> _carregar() async {
    final minha = ++_consulta;
    if (_erro) setState(() => _erro = false);
    try {
      final lista = await widget.buscar();
      // Janela fechada ou nova consulta: a resposta antiga não vale.
      if (!mounted || minha != _consulta) return;
      setState(() => _lista = lista);
    } catch (_) {
      if (!mounted || minha != _consulta) return;
      // Com uma lista já na tela, falha de rede não a apaga.
      if (_lista == null) setState(() => _erro = true);
    }
  }

  @override
  void dispose() {
    _consulta++;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tela = MediaQuery.sizeOf(context).height;
    final maximo = tela * _fracaoMaxima;
    final conhecido = _lista?.length ?? widget.total;
    // Quantas linhas cabem sem rolar; o resto rola dentro da folha.
    final cabem = ((maximo - 130) / _alturaLinha).floor().clamp(1, 12);
    final esqueletos = widget.total.clamp(1, cabem);

    Widget conteudo;
    if (_lista != null) {
      conteudo = ListView.builder(
        shrinkWrap: true,
        padding: EdgeInsets.zero,
        itemCount: _lista!.length,
        itemBuilder: (_, i) => _LinhaCurtidor(curtidor: _lista![i]),
      );
      if (_lista!.isEmpty) {
        conteudo = const SizedBox(
          height: _alturaLinha,
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text(
              'Ninguém curtiu ainda.',
              style: TextStyle(color: AppColors.muted),
            ),
          ),
        );
      }
    } else if (_erro) {
      conteudo = SizedBox(
        // Mesma altura dos esqueletos: nada pula quando a falha aparece.
        height: esqueletos * _alturaLinha,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text(
              'Não foi possível carregar quem curtiu.',
              style: TextStyle(color: AppColors.muted),
            ),
            TextButton(
              onPressed: _carregar,
              child: const Text('Tentar de novo'),
            ),
          ],
        ),
      );
    } else {
      conteudo = Column(
        // `min`: sem isso a coluna ocupava a altura toda da folha.
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < esqueletos; i++) const _LinhaEsqueleto(),
        ],
      );
    }

    return Container(
      constraints: BoxConstraints(maxHeight: maximo),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
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
              const SizedBox(height: 14),
              Row(
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: [
                  Text(
                    widget.titulo,
                    style: const TextStyle(
                      color: AppColors.ink,
                      fontSize: 19,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '$conhecido',
                    key: const ValueKey('total-curtidas'),
                    style: const TextStyle(
                      color: AppColors.muted,
                      fontFamily: 'Inter',
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Flexible(
                child: AnimatedSize(
                  duration: const Duration(milliseconds: 180),
                  curve: Curves.easeOutCubic,
                  alignment: Alignment.topCenter,
                  child: conteudo,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LinhaCurtidor extends StatelessWidget {
  const _LinhaCurtidor({required this.curtidor});

  final Curtidor curtidor;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: _alturaLinha,
      child: Row(
        children: [
          _AvatarCurtidor(curtidor: curtidor, tamanho: 40),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              curtidor.nome,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: AppColors.ink,
                fontSize: 14.5,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          if (curtidor.coordenacao) const SeloCoordenacao(),
        ],
      ),
    );
  }
}

/// Placeholder de uma linha enquanto a lista carrega (mesmo tamanho da real).
class _LinhaEsqueleto extends StatefulWidget {
  const _LinhaEsqueleto();

  @override
  State<_LinhaEsqueleto> createState() => _LinhaEsqueletoState();
}

class _LinhaEsqueletoState extends State<_LinhaEsqueleto>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulso = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _pulso.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduzir = MediaQuery.disableAnimationsOf(context);
    if (reduzir && _pulso.isAnimating) _pulso.stop();
    return SizedBox(
      key: const ValueKey('esqueleto-curtidor'),
      height: _alturaLinha,
      child: FadeTransition(
        opacity: Tween<double>(begin: 0.45, end: 1).animate(_pulso),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                color: AppColors.lavender,
              ),
            ),
            const SizedBox(width: 12),
            Container(
              width: 140,
              height: 12,
              decoration: BoxDecoration(
                color: AppColors.lavender,
                borderRadius: BorderRadius.circular(6),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Selo discreto para curtidas da coordenação.
class SeloCoordenacao extends StatelessWidget {
  const SeloCoordenacao({super.key, this.rotulo = 'Coordenação'});

  final String rotulo;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.lavender,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        rotulo,
        style: const TextStyle(
          color: AppColors.primary,
          fontFamily: 'Inter',
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
