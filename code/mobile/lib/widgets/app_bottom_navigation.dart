import 'package:flutter/material.dart';

import '../theme/colors.dart';

enum AppDestination { mapa, missoes, inicio, feed, perfil }

/// Shared by Home and Feed so the reference navigation never changes shape.
class AppBottomNavigation extends StatelessWidget {
  const AppBottomNavigation({
    super.key,
    required this.selected,
    required this.onSelected,
  });

  final AppDestination selected;
  final ValueChanged<AppDestination> onSelected;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        // The reference has a 320 px wide screen and a 36 px home button.
        final scale = (constraints.maxWidth / 320).clamp(1.0, 1.25).toDouble();
        final bottomInset = MediaQuery.paddingOf(context).bottom;

        return Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(
              top: Radius.circular(24 * scale),
            ),
            boxShadow: const [
              BoxShadow(
                color: Color(0x0F1B1340),
                blurRadius: 12,
                offset: Offset(0, -3),
              ),
            ],
          ),
          child: Padding(
            padding: EdgeInsets.fromLTRB(
              3 * scale,
              0,
              3 * scale,
              bottomInset > 0 ? bottomInset : 12 * scale,
            ),
            child: SizedBox(
              height: 52 * scale,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final destination in AppDestination.values)
                    Expanded(child: _item(destination, scale)),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _item(AppDestination destination, double scale) {
    final isHome = destination == AppDestination.inicio;
    final isSelected = destination == selected;
    // The map and raised home button retain their branded purple appearance.
    final color = isSelected || isHome || destination == AppDestination.mapa
        ? AppColors.primary
        : AppAccents.navigationMuted;
    final label = switch (destination) {
      AppDestination.mapa => 'Mapa',
      AppDestination.missoes => 'Missões',
      AppDestination.inicio => 'Início',
      AppDestination.feed => 'Feed',
      AppDestination.perfil => 'Perfil',
    };

    return Semantics(
      button: true,
      selected: isSelected,
      label: label,
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTap: () => onSelected(destination),
          borderRadius: BorderRadius.circular(22),
          excludeFromSemantics: true,
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.topCenter,
            children: [
              Positioned(
                top: (isHome ? -7 : 10) * scale,
                child: isHome
                    ? Container(
                        width: 36 * scale,
                        height: 36 * scale,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: AppColors.primary,
                          boxShadow: [
                            BoxShadow(
                              color: Color(0x38420594),
                              blurRadius: 7,
                              offset: Offset(0, 3),
                            ),
                          ],
                        ),
                        child: Center(
                          child: _icon(destination, Colors.white, 20 * scale),
                        ),
                      )
                    : _icon(destination, color, 20 * scale),
              ),
              Positioned(
                top: 33 * scale,
                child: Text(
                  label,
                  style: TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 10 * scale,
                    height: 1.2,
                    fontWeight: FontWeight.w500,
                    color: color,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _icon(AppDestination destination, Color color, double size) {
    if (destination == AppDestination.missoes) {
      return SizedBox.square(
        dimension: size,
        child: Stack(
          alignment: Alignment.center,
          children: [
            Icon(Icons.hexagon_outlined, color: color, size: size),
            Icon(Icons.star_border_rounded, color: color, size: size * 0.48),
          ],
        ),
      );
    }
    return Icon(
      switch (destination) {
        AppDestination.mapa => Icons.map_rounded,
        AppDestination.inicio => Icons.home_outlined,
        AppDestination.feed => Icons.feed_outlined,
        AppDestination.perfil => Icons.person_outline_rounded,
        AppDestination.missoes => Icons.hexagon_outlined,
      },
      color: color,
      size: size,
    );
  }
}
