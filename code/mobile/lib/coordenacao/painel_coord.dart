import 'package:flutter/material.dart';

import '../theme/colors.dart';
import 'componentes_coord.dart';

/// Padrão visual compartilhado pelos painéis da coordenação.
class CartaoPainelCoord extends StatelessWidget {
  const CartaoPainelCoord({
    super.key,
    required this.child,
    this.margin = const EdgeInsets.fromLTRB(16, 0, 16, 16),
    this.padding = const EdgeInsets.all(18),
  });
  final Widget child;
  final EdgeInsetsGeometry margin;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) => Padding(
    padding: margin,
    child: Material(
      color: Colors.white,
      shape: RoundedRectangleBorder(
        side: const BorderSide(color: Color(0xFFE4DFF0)),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Padding(padding: padding, child: child),
    ),
  );
}

class TituloPainelCoord extends StatelessWidget {
  const TituloPainelCoord({
    super.key,
    required this.titulo,
    this.descricao,
    this.numero,
  });
  final String titulo;
  final String? descricao;
  final String? numero;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (numero != null) ...[
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: AppColors.lavender,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              numero!,
              style: const TextStyle(
                color: AppColors.primary,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(width: 12),
        ],
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                titulo,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppColors.ink,
                ),
              ),
              if (descricao != null) ...[
                const SizedBox(height: 5),
                Text(
                  descricao!,
                  style: const TextStyle(
                    fontSize: 12,
                    color: corTextoSecundarioCoord,
                    height: 1.5,
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    ),
  );
}

class SeloPainelCoord extends StatelessWidget {
  const SeloPainelCoord(this.texto, {super.key, this.verde = false});
  final String texto;
  final bool verde;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    decoration: BoxDecoration(
      color: verde ? const Color(0xFFE8F6EF) : AppColors.lavender,
      borderRadius: BorderRadius.circular(6),
    ),
    child: Text(
      texto,
      style: TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w600,
        color: verde ? const Color(0xFF176C4B) : AppColors.primary,
      ),
    ),
  );
}

class IndicadorPainelCoord {
  const IndicadorPainelCoord(this.titulo, this.valor, this.detalhe, this.icone);
  final String titulo;
  final String valor;
  final String detalhe;
  final IconData icone;
}

class IndicadoresPainelCoord extends StatelessWidget {
  const IndicadoresPainelCoord({super.key, required this.itens});
  final List<IndicadorPainelCoord> itens;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final colunas = constraints.maxWidth >= 700 ? 4 : 2;
      final largura = (constraints.maxWidth - (colunas - 1) * 10) / colunas;
      return Wrap(
        spacing: 10,
        runSpacing: 10,
        children: [
          for (final item in itens)
            SizedBox(
              width: largura,
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border.all(color: const Color(0xFFE4DFF0)),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            item.titulo,
                            style: const TextStyle(
                              color: corTextoSecundarioCoord,
                              fontSize: 12,
                              height: 1.4,
                            ),
                          ),
                        ),
                        const SizedBox(width: 5),
                        Icon(item.icone, color: AppColors.primary, size: 17),
                      ],
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 7),
                      child: Text(
                        item.valor,
                        style: const TextStyle(
                          color: AppColors.ink,
                          fontSize: 27,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    Text(
                      item.detalhe,
                      style: const TextStyle(
                        color: corTextoSecundarioCoord,
                        fontSize: 11,
                        height: 1.5,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      );
    },
  );
}

class AbasPainelCoord extends StatelessWidget {
  const AbasPainelCoord({
    super.key,
    required this.itens,
    required this.selecionada,
    required this.onSelecionar,
  });
  final List<({String valor, String titulo, IconData icone})> itens;
  final String selecionada;
  final ValueChanged<String> onSelecionar;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 8, 16, 18),
    child: LayoutBuilder(
      builder: (context, constraints) {
        final colunas = constraints.maxWidth >= 700 ? itens.length : 2;
        final largura = (constraints.maxWidth - (colunas - 1) * 8) / colunas;
        return Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final item in itens)
              SizedBox(
                width: largura,
                child: Semantics(
                  selected: selecionada == item.valor,
                  child: OutlinedButton.icon(
                    onPressed: () => onSelecionar(item.valor),
                    icon: Icon(item.icone, size: 16),
                    label: Text(item.titulo, textAlign: TextAlign.center),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(56),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 12,
                      ),
                      foregroundColor: selecionada == item.valor
                          ? AppColors.primary
                          : corTextoSecundarioCoord,
                      backgroundColor: selecionada == item.valor
                          ? const Color(0xFFEDE5FA)
                          : Colors.transparent,
                      side: BorderSide(
                        color: selecionada == item.valor
                            ? const Color(0xFFB69BDE)
                            : const Color(0xFFE4DFF0),
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(9),
                      ),
                      textStyle: const TextStyle(
                        fontFamily: 'Inter',
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    ),
  );
}
