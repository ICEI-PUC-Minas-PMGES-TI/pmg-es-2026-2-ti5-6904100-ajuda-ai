import 'dart:async';

import 'package:flutter/material.dart';

import 'campus_location_service.dart';
import 'campus_map_controller.dart';
import 'campus_place.dart';
import 'campus_route.dart';

/// Overlay isolado: digitação reconstrói somente os controles, não MapWidget.
class CampusMapControls extends StatefulWidget {
  const CampusMapControls({super.key, required this.controller});
  final CampusMapController controller;

  @override
  State<CampusMapControls> createState() => _CampusMapControlsState();
}

class _CampusMapControlsState extends State<CampusMapControls> {
  final _text = TextEditingController();
  final _focus = FocusNode();
  List<CampusPlace> _results = const [];
  bool _expanded = false;
  bool _searching = false;
  bool _searchError = false;
  bool _locating = false;
  int _request = 0;

  /// Local escolhido na busca: abre o card de rota.
  CampusPlace? _selected;
  CampusRoute? _route;
  bool _accessible = false;
  bool _routing = false;
  int _routeRequest = 0;

  @override
  void dispose() {
    _request++;
    _routeRequest++;
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant CampusMapControls oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      _request++;
      _clear();
    }
  }

  Future<void> _search(String query) async {
    final request = ++_request;
    setState(() {
      _expanded = query.trim().isNotEmpty;
      _searching = _expanded;
      _searchError = false;
      _results = const [];
    });
    if (!_expanded) return;
    try {
      final results = await widget.controller.search(query);
      if (!mounted || request != _request) return;
      setState(() {
        _results = results;
        _searching = false;
      });
    } catch (_) {
      if (!mounted || request != _request) return;
      setState(() {
        _searchError = true;
        _searching = false;
      });
    }
  }

  void _clear() {
    _request++;
    _text.clear();
    _focus.unfocus();
    _closeRoute();
    setState(() {
      _results = const [];
      _expanded = false;
    });
  }

  /// Fecha o card e apaga a linha (também cancela um cálculo pendente).
  void _closeRoute() {
    _routeRequest++;
    if (_selected != null || _route != null || _routing) {
      unawaited(widget.controller.clearRoute());
    }
    if (!mounted) return;
    setState(() {
      _selected = null;
      _route = null;
      _routing = false;
    });
  }

  Future<void> _select(CampusPlace place) async {
    _request++;
    _focus.unfocus();
    _text.text = place.displayName;
    // Outro destino: a rota anterior não vale mais.
    _closeRoute();
    setState(() {
      _expanded = false;
      _selected = place;
    });
    try {
      await widget.controller.focusPlace(place.id);
    } catch (_) {
      if (mounted) _message('Não foi possível focar o local. Tente novamente.');
    }
  }

  void _message(String message, {SnackBarAction? action}) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message), action: action));
  }

  Future<void> _settings(bool app) async {
    try {
      final service = widget.controller.locationService;
      final opened = await (app
          ? service.openAppSettings()
          : service.openLocationSettings());
      if (mounted && !opened) {
        _message('Não foi possível abrir as configurações.');
      }
    } catch (_) {
      if (mounted) _message('Não foi possível abrir as configurações.');
    }
  }

  Future<void> _traceRoute() async {
    final place = _selected;
    if (place == null || _routing) return;
    final request = ++_routeRequest;
    final accessible = _accessible;
    _focus.unfocus();
    setState(() => _routing = true);
    final result = await widget.controller.routeTo(
      place.id,
      accessible: accessible,
    );
    if (!mounted || request != _routeRequest || result.cancelled) return;
    setState(() {
      _routing = false;
      if (result.route != null) _route = result.route;
    });
    if (result.route != null) return;
    // Falhou: a linha anterior (de outro modo) não pode ficar como se valesse.
    if (_route != null) {
      unawaited(widget.controller.clearRoute());
      setState(() => _route = null);
    }
    if (result.location case final status?) {
      _locationMessage(status);
      return;
    }
    _message(switch (result.failure!) {
      CampusRouteFailure.unavailable =>
        'Não foi possível calcular a rota agora.',
      CampusRouteFailure.outsideCampus => 'Você está longe dos caminhos do campus. Aproxime-se para traçar a rota.',
      CampusRouteFailure.samePlace => 'Você já está neste local.',
      CampusRouteFailure.noPath =>
        accessible
            ? 'Não há rota acessível até este local.'
            : 'Não há rota até este local.',
      CampusRouteFailure.destinationUnavailable =>
        'Este local ainda não tem rota disponível.',
    });
  }

  void _setAccessible(bool value) {
    setState(() => _accessible = value);
    // Com uma rota na tela, refaz no novo modo.
    if (_route != null) unawaited(_traceRoute());
  }

  Future<void> _locate() async {
    _focus.unfocus();
    setState(() {
      _locating = true;
      _expanded = false;
    });
    final result = await widget.controller.moveToUser();
    if (!mounted) return;
    setState(() => _locating = false);
    _locationMessage(result.status);
  }

  void _locationMessage(CampusLocationStatus status) {
    switch (status) {
      case CampusLocationStatus.located:
        break;
      case CampusLocationStatus.serviceDisabled:
        _message(
          'Ative a localização do dispositivo para se encontrar no mapa.',
          action: SnackBarAction(
            label: 'Configurações',
            onPressed: () => _settings(false),
          ),
        );
      case CampusLocationStatus.denied:
        _message(
          'Permissão negada. Para se localizar no mapa, toque em Minha localização e permita o acesso.',
        );
      case CampusLocationStatus.deniedForever:
        _message(
          'Permissão de localização bloqueada. Você pode permitir nas configurações do aplicativo.',
          action: SnackBarAction(
            label: 'Configurações',
            onPressed: () => _settings(true),
          ),
        );
      case CampusLocationStatus.error:
        _message('Não foi possível obter sua localização. Tente novamente.');
      case CampusLocationStatus.mapUnavailable:
        _message('O mapa ainda não está pronto. Tente novamente.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Stack(
      children: [
        if (_selected case final place? when widget.controller.canRoute)
          Positioned(
            left: 12,
            right: 76, // Coluna do botão de localização.
            bottom: 44,
            child: _RouteCard(
              place: place,
              route: _route,
              accessible: _accessible,
              routing: _routing,
              onAccessible: _setAccessible,
              onTrace: _traceRoute,
              onClose: _closeRoute,
            ),
          ),
        Positioned(
          top: 12,
          left: 12,
          right: 12,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Material(
                color: colors.surface,
                elevation: 3,
                borderRadius: BorderRadius.circular(16),
                child: TextField(
                  controller: _text,
                  focusNode: _focus,
                  onChanged: _search,
                  onTap: () {
                    if (_text.text.isNotEmpty) _search(_text.text);
                  },
                  onTapOutside: (_) {
                    _focus.unfocus();
                    if (_expanded) setState(() => _expanded = false);
                  },
                  textInputAction: TextInputAction.search,
                  onSubmitted: _search,
                  decoration: InputDecoration(
                    labelText: 'Buscar local no campus',
                    hintText: 'Nome ou código do prédio',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: IconButton(
                      tooltip: 'Limpar busca',
                      onPressed: _clear,
                      icon: const Icon(Icons.close),
                    ),
                    border: InputBorder.none,
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 12,
                    ),
                  ),
                ),
              ),
              if (_expanded && !_searching)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  // Resultados e campo pertencem ao mesmo grupo de toque:
                  // selecionar não dispara onTapOutside antes do onTap.
                  child: TextFieldTapRegion(
                    child: Material(
                      color: colors.surface,
                      elevation: 3,
                      borderRadius: BorderRadius.circular(16),
                      clipBehavior: Clip.antiAlias,
                      child: ConstrainedBox(
                        constraints: BoxConstraints(
                          maxHeight: MediaQuery.sizeOf(context).height * .3,
                        ),
                        child: _results.isEmpty
                            ? Padding(
                                padding: const EdgeInsets.all(16),
                                child: Text(
                                  _searchError
                                      ? 'Não foi possível buscar locais. Tente novamente.'
                                      : 'Nenhum local encontrado.',
                                ),
                              )
                            : ListView.builder(
                                padding: EdgeInsets.zero,
                                shrinkWrap: true,
                                itemCount: _results.length,
                                itemBuilder: (context, index) {
                                  final place = _results[index];
                                  return ListTile(
                                    leading: const Icon(Icons.place_outlined),
                                    title: Text(place.displayName),
                                    subtitle:
                                        place.name != null && place.code != null
                                        ? Text(place.code!)
                                        : null,
                                    onTap: () => _select(place),
                                  );
                                },
                              ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        Positioned(
          right: 16,
          bottom: 52, // Reserva o rodapé para logo/attribution nativos.
          child: SizedBox(
            width: 48,
            height: 48,
            child: Material(
              color: colors.surface,
              elevation: 3,
              shape: const CircleBorder(),
              child: IconButton(
                tooltip: _locating
                    ? 'Obtendo localização'
                    : 'Minha localização',
                onPressed: _locating ? null : _locate,
                icon: _locating
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.my_location),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _RouteCard extends StatelessWidget {
  const _RouteCard({
    required this.place,
    required this.route,
    required this.accessible,
    required this.routing,
    required this.onAccessible,
    required this.onTrace,
    required this.onClose,
  });

  final CampusPlace place;
  final CampusRoute? route;
  final bool accessible;
  final bool routing;
  final ValueChanged<bool> onAccessible;
  final VoidCallback onTrace;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final route = this.route;
    return Material(
      key: const Key('campus-route-card'),
      color: colors.surface,
      elevation: 3,
      borderRadius: BorderRadius.circular(16),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 4, 4, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    place.displayName,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: text.titleSmall,
                  ),
                ),
                IconButton(
                  key: const Key('campus-route-clear'),
                  tooltip: 'Limpar rota',
                  onPressed: onClose,
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            if (route != null)
              Text(
                campusRouteSummary(route),
                key: const Key('campus-route-summary'),
                style: text.bodyMedium?.copyWith(color: colors.primary),
              ),
            SwitchListTile(
              key: const Key('campus-route-accessible'),
              dense: true,
              contentPadding: const EdgeInsets.only(right: 12),
              title: const Text('Rota acessível'),
              value: accessible,
              onChanged: routing ? null : onAccessible,
            ),
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: FilledButton.icon(
                key: const Key('campus-route-trace'),
                onPressed: routing ? null : onTrace,
                icon: routing
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.directions_walk),
                label: Text(routing ? 'Calculando rota' : 'Traçar rota'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// "8 min a pé · 650 m": minutos arredondados (mínimo 1), metros de 10 em 10.
String campusRouteSummary(CampusRoute route) {
  final minutes = (route.durationSeconds / 60).round().clamp(1, 999);
  final meters = route.distanceMeters;
  final distance = meters < 1000
      ? '${(meters / 10).round() * 10} m'
      : '${(meters / 1000).toStringAsFixed(1).replaceAll('.', ',')} km';
  return '$minutes min a pé · $distance';
}
