import 'package:flutter/material.dart';

/// Medidas e cores da interface do mapa do PUCMaps (`AppTextField`,
/// `CategoryChip`, `AppIconButton`, `MapControls`, `PlaceDetailSheet`).
/// Copiadas dos componentes originais para o mapa do Ajuda-aí ter a mesma
/// aparência; não dependem do tema do app.
abstract final class CampusMapStyle {
  /// Azul dos chips selecionados e dos ícones dos botões do mapa.
  static const accent = Color(0xFF0D47A1);

  /// Azul institucional do card do local e do botão de luz.
  static const brand = Color(0xFF0F5983);

  /// Verde de "Escolher ponto de partida".
  static const origin = Color(0xFF2E7D32);

  /// Laranja de "Salvar local".
  static const save = Color(0xFFF57C00);

  static const hint = Color(0xFF8C8C8C);
  static const text = Color(0xFF333333);
  static const muted = Color(0xFF666666);
  static const handle = Color(0xFFBDBDBD);

  /// Margem lateral da busca e da fileira de categorias.
  static const sideMargin = 21.0;

  /// Altura dos botões redondos do mapa.
  static const buttonSize = 50.0;

  static const searchShadow = BoxShadow(
    color: Color(0x1A000000),
    blurRadius: 10,
    offset: Offset(0, 4),
  );

  /// Fonte do mapa. O app usa Poppins só com os pesos 400 e 800: qualquer
  /// texto de 600/700 caía no ExtraBold e deixava o mapa pesado. A Inter do
  /// app é variável (100–900), então cada peso é desenhado como pedido, mais
  /// perto da Manrope leve do PUCMaps. Sem a fonte (ex.: testes do pacote),
  /// o Flutter usa a padrão.
  static const fontFamily = 'Inter';

  /// Tema do app com a fonte do mapa (vale também para sheets e diálogos
  /// abertos a partir dos controles, que herdam o tema capturado).
  static ThemeData theme(ThemeData base) => base.copyWith(
    textTheme: base.textTheme.apply(fontFamily: fontFamily),
    primaryTextTheme: base.primaryTextTheme.apply(fontFamily: fontFamily),
  );
}

/// Aplica a fonte do mapa em [child]: tema e estilo de texto padrão (o
/// `Material` do Scaffold já fixou o estilo com a fonte do app).
class CampusMapTypography extends StatelessWidget {
  const CampusMapTypography({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => Theme(
    data: CampusMapStyle.theme(Theme.of(context)),
    child: DefaultTextStyle.merge(
      style: const TextStyle(fontFamily: CampusMapStyle.fontFamily),
      child: child,
    ),
  );
}

/// Campo de busca arredondado do PUCMaps (`AppTextField`): branco, raio 20,
/// sombra suave, texto 16/600 e lupa cinza à direita. Com texto, a lupa vira
/// o botão de limpar (o original não tinha como limpar a busca).
class CampusSearchField extends StatelessWidget {
  const CampusSearchField({
    super.key,
    required this.controller,
    this.focusNode,
    this.hintText = 'Pesquise um local...',
    this.onChanged,
    this.onSubmitted,
    this.onTap,
    this.onTapOutside,
    this.onClear,
  });

  final TextEditingController controller;
  final FocusNode? focusNode;
  final String hintText;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final VoidCallback? onTap;
  final TapRegionCallback? onTapOutside;

  /// Sem ele, a lupa fica sempre visível.
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: 50),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: const [CampusMapStyle.searchShadow],
      ),
      child: ValueListenableBuilder<TextEditingValue>(
        valueListenable: controller,
        builder: (context, value, _) {
          final canClear = onClear != null && value.text.isNotEmpty;
          return TextField(
            controller: controller,
            focusNode: focusNode,
            onChanged: onChanged,
            onSubmitted: onSubmitted,
            onTap: onTap,
            onTapOutside: onTapOutside,
            textInputAction: TextInputAction.search,
            textAlignVertical: TextAlignVertical.center,
            style: const TextStyle(
              color: CampusMapStyle.text,
              fontSize: 16,
              fontWeight: FontWeight.w500,
            ),
            decoration: InputDecoration(
              hintText: hintText,
              hintStyle: const TextStyle(
                color: CampusMapStyle.hint,
                fontSize: 16,
                fontWeight: FontWeight.w400,
              ),
              isDense: true,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 24,
                vertical: 14,
              ),
              border: InputBorder.none,
              suffixIcon: canClear
                  ? IconButton(
                      tooltip: 'Limpar busca',
                      onPressed: onClear,
                      icon: const Icon(
                        Icons.close,
                        color: CampusMapStyle.hint,
                        size: 20,
                      ),
                    )
                  : Transform.translate(
                      offset: const Offset(-2, 0),
                      child: const Icon(
                        Icons.search,
                        color: CampusMapStyle.hint,
                        size: 20,
                      ),
                    ),
            ),
          );
        },
      ),
    );
  }
}

/// Chip de categoria do PUCMaps (`CategoryChip`): 36 de altura, raio 20,
/// borda azul de 2 px quando selecionado e preta translúcida quando não.
class CampusCategoryChip extends StatelessWidget {
  const CampusCategoryChip({
    super.key,
    required this.label,
    required this.icon,
    required this.onTap,
    this.selected = false,
    this.loading = false,
  });

  final String label;
  final IconData icon;
  final bool selected;

  /// Pontos da categoria ainda carregando: troca o ícone por um indicador.
  final bool loading;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected ? CampusMapStyle.accent : Colors.black;
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      excludeSemantics: true,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          height: 36,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: selected
                  ? CampusMapStyle.accent
                  : Colors.black.withValues(alpha: 0.2),
              width: selected ? 2 : 1,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (loading)
                SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: color,
                  ),
                )
              else
                Icon(icon, size: 18, color: color),
              const SizedBox(width: 8),
              Text(
                label,
                style: TextStyle(
                  color: color,
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Botão redondo do PUCMaps (`AppIconButton`): 50 px, branco, sombra
/// 20 % com blur 12 e ícone azul com metade do diâmetro.
class CampusMapIconButton extends StatelessWidget {
  const CampusMapIconButton({
    super.key,
    required this.icon,
    required this.tooltip,
    required this.onPressed,
    this.backgroundColor = Colors.white,
    this.iconColor = CampusMapStyle.accent,
    this.busy = false,
    this.selected,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final Color backgroundColor;
  final Color iconColor;

  /// Ação em andamento (ex.: obtendo localização): indicador no lugar do ícone.
  final bool busy;

  /// Estado de alternância anunciado à acessibilidade (`null` = botão comum).
  final bool? selected;

  @override
  Widget build(BuildContext context) {
    const size = CampusMapStyle.buttonSize;
    return Semantics(
      toggled: selected,
      child: Tooltip(
        message: tooltip,
        child: Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            color: backgroundColor,
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.2),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Material(
            color: Colors.transparent,
            shape: const CircleBorder(),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: onPressed,
              child: Center(
                child: busy
                    ? SizedBox(
                        width: size * .4,
                        height: size * .4,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: iconColor,
                        ),
                      )
                    : Icon(icon, size: size * 0.5, color: iconColor),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Coluna lateral do PUCMaps (`MapControls`): acessibilidade, minha
/// localização, menos e mais, de cima para baixo, separados por 16 px.
class CampusMapSideControls extends StatelessWidget {
  const CampusMapSideControls({
    super.key,
    required this.accessible,
    required this.onAccessible,
    required this.locating,
    required this.onLocate,
    required this.onZoomIn,
    required this.onZoomOut,
    this.compact = false,
  });

  /// Altura da coluna (botões de 50 px separados por 16 px).
  static double heightFor({
    required bool accessibility,
    required bool compact,
  }) {
    final buttons = (compact ? 1 : 3) + (accessibility ? 1 : 0);
    return buttons * CampusMapStyle.buttonSize + (buttons - 1) * 16;
  }

  /// Com o card do local aberto: só acessibilidade e localização, para
  /// caberem acima do sheet (o zoom continua no gesto de pinça).
  final bool compact;

  final bool accessible;

  /// `null` esconde o botão (sem serviço de rota não há rota acessível).
  final VoidCallback? onAccessible;
  final bool locating;
  final VoidCallback onLocate;
  final VoidCallback onZoomIn;
  final VoidCallback onZoomOut;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (onAccessible != null) ...[
          CampusMapIconButton(
            key: const Key('campus-accessible-routes'),
            icon: accessible ? Icons.accessible : Icons.accessible_outlined,
            tooltip: accessible
                ? 'Rotas acessíveis ativadas'
                : 'Ativar rotas acessíveis',
            selected: accessible,
            backgroundColor: accessible ? CampusMapStyle.accent : Colors.white,
            iconColor: accessible ? Colors.white : CampusMapStyle.accent,
            onPressed: onAccessible,
          ),
          const SizedBox(height: 16),
        ],
        CampusMapIconButton(
          icon: Icons.my_location,
          tooltip: locating ? 'Obtendo localização' : 'Minha localização',
          busy: locating,
          onPressed: locating ? null : onLocate,
        ),
        if (!compact) ...[
          const SizedBox(height: 16),
          CampusMapIconButton(
            key: const Key('campus-zoom-out'),
            icon: Icons.remove,
            tooltip: 'Diminuir zoom',
            onPressed: onZoomOut,
          ),
          const SizedBox(height: 16),
          CampusMapIconButton(
            key: const Key('campus-zoom-in'),
            icon: Icons.add,
            tooltip: 'Aumentar zoom',
            onPressed: onZoomIn,
          ),
        ],
      ],
    );
  }
}

/// Botão "Luz: …" do PUCMaps (`_LightTestButton`): pílula branca com o ícone
/// de entardecer e o rótulo em azul institucional.
class CampusLightButton extends StatelessWidget {
  const CampusLightButton({
    super.key,
    required this.label,
    required this.onTap,
  });

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      key: const Key('campus-light-button'),
      color: Colors.white,
      elevation: 3,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.wb_twilight,
                size: 18,
                color: CampusMapStyle.brand,
              ),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  'Luz: $label',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    color: CampusMapStyle.brand,
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

/// Ação do card do local (`_RouteButton` do PUCMaps): faixa colorida a 8 %,
/// quadrado de 40 px com o ícone, título, subtítulo e seta.
class CampusPlaceActionButton extends StatelessWidget {
  const CampusPlaceActionButton({
    super.key,
    required this.icon,
    required this.label,
    required this.subtitle,
    required this.color,
    required this.onTap,
    this.loading = false,
  });

  final IconData icon;
  final String label;
  final String subtitle;
  final Color color;

  /// `null` desabilita (cinza), como no original.
  final VoidCallback? onTap;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    return Material(
      color: enabled ? color.withValues(alpha: 0.08) : Colors.grey.shade100,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: enabled || loading ? color : Colors.grey,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: loading
                    ? const Padding(
                        padding: EdgeInsets.all(10),
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : Icon(icon, color: Colors.white, size: 22),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: enabled || loading ? color : Colors.grey,
                      ),
                    ),
                    Text(
                      subtitle,
                      style: TextStyle(
                        fontSize: 12,
                        color: enabled || loading
                            ? CampusMapStyle.muted
                            : Colors.grey.shade400,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                Icons.chevron_right,
                color: enabled ? color : Colors.grey.shade400,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Alça do bottom sheet do PUCMaps: 64 × 6, cinza, totalmente arredondada.
class CampusSheetHandle extends StatelessWidget {
  const CampusSheetHandle({super.key, this.margin});

  final EdgeInsetsGeometry? margin;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: 64,
        height: 6,
        margin: margin ?? const EdgeInsets.only(bottom: 20),
        decoration: BoxDecoration(
          color: CampusMapStyle.handle,
          borderRadius: BorderRadius.circular(99),
        ),
      ),
    );
  }
}
