import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'campus_map_defaults.dart';

import 'campus_content.dart';
import 'campus_content_format.dart';
import 'campus_map_controller.dart';
import 'campus_map_controls.dart';
import 'campus_route.dart';

const campusEventColor = Color(0xFF7C3AED);
const campusRestaurantColor = Color(0xFFEA580C);
const _activeColor = Color(0xFF15803D);

/// Lista de eventos ou restaurantes (bottom sheet). Escolher um item fecha a
/// lista devolvendo o item (`Navigator.pop`); a tela foca o mapa e abre o card.
class CampusContentSheet extends StatefulWidget {
  const CampusContentSheet({
    super.key,
    required this.controller,
    required this.kind,
    this.now,
  });

  final CampusMapController controller;
  final CampusContentKind kind;

  /// Relógio para os rótulos de dia/horário (testes); padrão: agora.
  final DateTime? now;

  @override
  State<CampusContentSheet> createState() => _CampusContentSheetState();
}

class _CampusContentSheetState extends State<CampusContentSheet> {
  bool get _events => widget.kind == CampusContentKind.event;

  @override
  void initState() {
    super.initState();
    // Depois do frame: a carga muda notifiers que outras telas escutam.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) widget.controller.loadContent();
    });
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    final text = Theme.of(context).textTheme;
    final ValueNotifier<CampusContentStatus> status = _events
        ? controller.eventsStatus
        : controller.restaurantsStatus;
    final ValueNotifier<List<CampusContent>> items = _events
        ? controller.events
        : controller.restaurants;
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * .7,
        ),
        child: Column(
          key: Key(
            _events ? 'campus-events-sheet' : 'campus-restaurants-sheet',
          ),
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
              child: Text(
                _events ? 'Eventos no campus' : 'Onde comer',
                style: text.titleMedium,
              ),
            ),
            Flexible(
              child: AnimatedBuilder(
                animation: Listenable.merge([status, items]),
                builder: (context, _) => _body(status.value, items.value),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _body(CampusContentStatus status, List<CampusContent> items) {
    final colors = Theme.of(context).colorScheme;
    switch (status) {
      case CampusContentStatus.idle:
      case CampusContentStatus.loading:
        return const Padding(
          padding: EdgeInsets.all(32),
          child: Center(child: CircularProgressIndicator()),
        );
      case CampusContentStatus.failed:
        return Padding(
          key: const Key('campus-content-error'),
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                _events
                    ? 'Não foi possível carregar os eventos. Verifique a conexão.'
                    : 'Não foi possível carregar os restaurantes. Verifique a conexão.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                key: const Key('campus-content-retry'),
                onPressed: widget.controller.reloadContent,
                icon: const Icon(Icons.refresh),
                label: const Text('Tentar novamente'),
              ),
            ],
          ),
        );
      case CampusContentStatus.ready:
        if (items.isEmpty) {
          return Padding(
            key: const Key('campus-content-empty'),
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
            child: Text(
              _events
                  ? 'Nenhum evento programado.'
                  : 'Nenhum restaurante cadastrado.',
              style: TextStyle(color: colors.onSurfaceVariant),
            ),
          );
        }
        return ListView.separated(
          shrinkWrap: true,
          padding: const EdgeInsets.only(bottom: 12),
          itemCount: items.length,
          separatorBuilder: (_, _) => const Divider(height: 1),
          itemBuilder: (context, index) {
            final item = items[index];
            return _ContentTile(
              key: Key('campus-content-item-${item.id}'),
              item: item,
              now: widget.now,
              onTap: () => Navigator.of(context).pop(item),
            );
          },
        );
    }
  }
}

class _ContentTile extends StatelessWidget {
  const _ContentTile({
    super.key,
    required this.item,
    required this.now,
    required this.onTap,
  });

  final CampusContent item;
  final DateTime? now;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final muted = text.bodySmall?.copyWith(color: colors.onSurfaceVariant);
    final item = this.item;
    final local = item.location?.name;
    final (icon, color) = switch (item) {
      CampusEvent() => (Icons.event, campusEventColor),
      CampusRestaurant() => (Icons.restaurant, campusRestaurantColor),
    };
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.title, style: text.titleSmall),
                  const SizedBox(height: 2),
                  switch (item) {
                    CampusEvent() => Text(
                      campusEventSchedule(item, now: now),
                      style: text.bodyMedium,
                    ),
                    CampusRestaurant() => Text(
                      campusRestaurantHoursToday(item, now: now),
                      style: text.bodyMedium,
                    ),
                  },
                  if (local != null && local.trim().isNotEmpty)
                    Text(local, style: muted),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: campusContentBadges(item),
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

/// Selos de estado em texto e ícone (não só cor).
List<Widget> campusContentBadges(CampusContent item) => switch (item) {
  CampusEvent(:final status) => [
    _Badge(
      label: campusEventStatusLabel(status),
      icon: status == CampusEventStatus.ongoing ? Icons.circle : Icons.schedule,
      color: status == CampusEventStatus.ongoing
          ? _activeColor
          : campusEventColor,
    ),
  ],
  CampusRestaurant(:final openNow, :final menuToday, :final hours) => [
    // Aberto/fechado só com horário cadastrado (sem ele, situação desconhecida).
    if (hours.isNotEmpty)
      _Badge(
        label: openNow ? 'Aberto agora' : 'Fechado',
        icon: openNow ? Icons.circle : Icons.do_not_disturb_on_outlined,
        color: openNow ? _activeColor : const Color(0xFF6B7280),
      ),
    if (menuToday)
      const _Badge(
        label: 'Cardápio de hoje',
        icon: Icons.menu_book_outlined,
        color: campusRestaurantColor,
      ),
  ],
};

class _Badge extends StatelessWidget {
  const _Badge({required this.label, required this.icon, required this.color});

  final String label;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 10, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: Theme.of(context).textTheme.labelSmall
                ?.copyWith(color: color, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

/// Card do evento/restaurante tocado no mapa ou escolhido na lista.
class CampusContentCard extends StatelessWidget {
  const CampusContentCard({
    super.key,
    required this.item,
    required this.canRoute,
    required this.route,
    required this.routing,
    required this.accessible,
    required this.loadingMenu,
    required this.onFocus,
    required this.onTrace,
    required this.onAccessible,
    required this.onMenu,
    required this.onClose,
    this.now,
  });

  final CampusContent item;

  /// Há serviço de rota no mapa.
  final bool canRoute;
  final CampusRoute? route;
  final bool routing;
  final bool accessible;
  final bool loadingMenu;
  final VoidCallback onFocus;
  final VoidCallback onTrace;
  final ValueChanged<bool> onAccessible;
  final VoidCallback onMenu;
  final VoidCallback onClose;
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final muted = text.bodySmall?.copyWith(color: colors.onSurfaceVariant);
    final item = this.item;
    final location = item.location;
    final hasRoute = canRoute && location?.routeTarget != null;
    final (icon, color) = switch (item) {
      CampusEvent() => (Icons.event, campusEventColor),
      CampusRestaurant() => (Icons.restaurant, campusRestaurantColor),
    };
    final description = switch (item) {
      CampusEvent(:final description) => description,
      CampusRestaurant(:final description) => description,
    };
    final route = this.route;
    return Material(
      key: const Key('campus-content-card'),
      color: colors.surface,
      elevation: 3,
      borderRadius: BorderRadius.circular(16),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight:
              MediaQuery.sizeOf(context).height *
              CampusMapDefaults.contentCardHeightFraction,
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 4, 4, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(icon, size: 20, color: color),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      item.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: text.titleSmall,
                    ),
                  ),
                  IconButton(
                    key: const Key('campus-content-close'),
                    tooltip: 'Fechar',
                    onPressed: onClose,
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
              Padding(
                padding: const EdgeInsets.only(right: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      children: campusContentBadges(item),
                    ),
                    const SizedBox(height: 4),
                    Text(switch (item) {
                      CampusEvent() => campusEventSchedule(item, now: now),
                      CampusRestaurant() => campusRestaurantHoursToday(
                        item,
                        now: now,
                      ),
                    }, style: text.bodyMedium),
                    if (location?.name case final name?
                        when name.trim().isNotEmpty)
                      Text(name, style: muted),
                    if (location == null || !location.hasPosition)
                      Text(
                        'Local sem posição no mapa.',
                        key: const Key('campus-content-no-position'),
                        style: muted,
                      ),
                    if (description != null && description.trim().isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          description,
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                          style: text.bodySmall,
                        ),
                      ),
                    if (route != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          campusRouteSummary(route),
                          key: const Key('campus-content-route-summary'),
                          style: text.bodyMedium?.copyWith(
                            color: colors.primary,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              if (hasRoute)
                SwitchListTile(
                  key: const Key('campus-content-accessible'),
                  dense: true,
                  contentPadding: const EdgeInsets.only(right: 12),
                  title: const Text('Rota acessível'),
                  value: accessible,
                  onChanged: routing ? null : onAccessible,
                )
              else
                const SizedBox(height: 8),
              Padding(
                padding: const EdgeInsets.only(right: 12),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    if (location?.hasPosition == true)
                      OutlinedButton.icon(
                        key: const Key('campus-content-focus'),
                        onPressed: onFocus,
                        icon: const Icon(Icons.center_focus_strong_outlined),
                        label: const Text('Ver no mapa'),
                      ),
                    if (hasRoute)
                      FilledButton.icon(
                        key: const Key('campus-content-trace'),
                        onPressed: routing ? null : onTrace,
                        icon: routing
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(Icons.directions_walk),
                        label: Text(
                          routing ? 'Calculando rota' : 'Traçar rota',
                        ),
                      ),
                    if (item is CampusRestaurant)
                      OutlinedButton.icon(
                        key: const Key('campus-content-menu'),
                        onPressed: loadingMenu ? null : onMenu,
                        icon: loadingMenu
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(Icons.menu_book_outlined),
                        label: const Text('Ver cardápio'),
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

/// Cardápio em imagem, em tela cheia, com zoom.
class CampusMenuImageViewer extends StatelessWidget {
  const CampusMenuImageViewer({
    super.key,
    required this.restaurant,
    required this.menu,
  });

  final CampusRestaurant restaurant;
  final CampusMenu menu;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Dialog.fullscreen(
      key: const Key('campus-menu-image'),
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            tooltip: 'Fechar',
            onPressed: () => Navigator.of(context).pop(),
            icon: const Icon(Icons.close),
          ),
          title: Text('Cardápio · ${restaurant.name}'),
        ),
        body: InteractiveViewer(
          maxScale: 5,
          child: Center(
            child: Image.network(
              menu.url.toString(),
              fit: BoxFit.contain,
              semanticLabel: 'Cardápio de ${restaurant.name}',
              loadingBuilder: (context, child, progress) => progress == null
                  ? child
                  : const Center(child: CircularProgressIndicator()),
              errorBuilder: (context, _, _) => Padding(
                key: const Key('campus-menu-image-error'),
                padding: const EdgeInsets.all(24),
                child: Text(
                  'Não foi possível carregar a imagem do cardápio.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: colors.onSurfaceVariant),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// PDF sem app para abrir: mostra o endereço para copiar.
class CampusMenuLinkDialog extends StatelessWidget {
  const CampusMenuLinkDialog({super.key, required this.menu});

  final CampusMenu menu;

  @override
  Widget build(BuildContext context) {
    final link = menu.url.toString();
    return AlertDialog(
      key: const Key('campus-menu-link'),
      title: const Text('Cardápio em PDF'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Não foi possível abrir o PDF neste aparelho. Copie o link e '
            'abra no navegador.',
          ),
          const SizedBox(height: 8),
          SelectableText(link),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Fechar'),
        ),
        FilledButton.icon(
          key: const Key('campus-menu-copy'),
          onPressed: () async {
            var copied = true;
            try {
              await Clipboard.setData(ClipboardData(text: link));
            } catch (_) {
              copied =
                  false; // Sem área de transferência: o link segue na tela.
            }
            if (context.mounted && copied) Navigator.of(context).pop(true);
          },
          icon: const Icon(Icons.copy),
          label: const Text('Copiar link'),
        ),
      ],
    );
  }
}
