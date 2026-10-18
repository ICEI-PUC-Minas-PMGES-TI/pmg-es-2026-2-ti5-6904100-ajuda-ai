import 'dart:async';

import 'package:flutter/material.dart';

import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';

import 'campus_camera_policy.dart';
import 'campus_content.dart';
import 'campus_content_widgets.dart';
import 'campus_location_service.dart';
import 'campus_map_controller.dart';
import 'campus_place.dart';
import 'campus_place_category_sheet.dart';
import 'campus_pucstop.dart';
import 'campus_route.dart';

/// Overlay isolado: digitação reconstrói somente os controles, não MapWidget.
class CampusMapControls extends StatefulWidget {
  const CampusMapControls({
    super.key,
    required this.controller,
    this.onPucStopClaimed,
    this.showEvents = true,
    this.showRestaurants = true,
    this.openExternalUrl,
  });
  final CampusMapController controller;

  /// Coleta confirmada pelo servidor (gancho para XP do app e som).
  final ValueChanged<CampusPucStopClaim>? onPucStopClaimed;

  /// Atalhos "Eventos" e "Onde comer" (só com serviço de conteúdo).
  final bool showEvents;
  final bool showRestaurants;

  /// Abre o cardápio em PDF fora do app; sem ele (ou se falhar) o link
  /// aparece para copiar.
  final Future<bool> Function(Uri url)? openExternalUrl;

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

  /// Card do PucStop: posição lida só enquanto ele está aberto (descartada
  /// ao fechar); a decisão da coleta é do servidor.
  String? _pucStopId;
  _PucStopView _pucStop = const _PucStopView();
  int _pucStopRequest = 0;

  /// Evento/restaurante no card (espelha `controller.selectedContent`).
  CampusContent? _content;
  bool _loadingMenu = false;
  int _menuRequest = 0;

  @override
  void initState() {
    super.initState();
    _listen(widget.controller);
  }

  void _listen(CampusMapController controller) {
    controller.activeRoute.addListener(_onRouteChanged);
    controller.selectedPucStop.addListener(_onPucStopSelected);
    controller.collectedPucStops.addListener(_onCollectedChanged);
    controller.selectedContent.addListener(_onContentSelected);
  }

  void _unlisten(CampusMapController controller) {
    try {
      controller.activeRoute.removeListener(_onRouteChanged);
      controller.selectedPucStop.removeListener(_onPucStopSelected);
      controller.collectedPucStops.removeListener(_onCollectedChanged);
      controller.selectedContent.removeListener(_onContentSelected);
    } catch (_) {
      // Controller já descartado pelo dono.
    }
  }

  @override
  void dispose() {
    _request++;
    _routeRequest++;
    _pucStopRequest++;
    _menuRequest++;
    _unlisten(widget.controller);
    unawaited(widget.controller.clearRoute());
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant CampusMapControls oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      _unlisten(oldWidget.controller);
      _listen(widget.controller);
      _request++;
      _pucStopRequest++;
      _menuRequest++;
      _pucStopId = null;
      _content = null;
      _loadingMenu = false;
      _clear();
    }
  }

  void _onCollectedChanged() {
    if (mounted && _pucStopId != null) setState(() {});
  }

  void _onRouteChanged() {
    if (mounted) setState(() => _route = widget.controller.activeRoute.value);
  }

  void _onPucStopSelected() {
    final id = widget.controller.selectedPucStop.value;
    if (!mounted || id == _pucStopId) return;
    _pucStopRequest++;
    if (id != null) {
      // Um card por vez: escolher um PucStop fecha a rota e a busca.
      _request++;
      _focus.unfocus();
      _closeRoute();
      _expanded = false;
    }
    setState(() {
      _pucStopId = id;
      _pucStop = const _PucStopView();
    });
    if (id != null) unawaited(_measurePucStop());
  }

  void _closePucStop() => widget.controller.selectPucStop(null);

  void _onContentSelected() {
    final item = widget.controller.selectedContent.value;
    if (!mounted) return;
    final previous = _content;
    // Mesmo item atualizado pela recarga: só redesenha (rota continua).
    if (item != null &&
        previous != null &&
        item.kind == previous.kind &&
        item.id == previous.id) {
      setState(() => _content = item);
      return;
    }
    if (item == null && previous == null) return;
    _menuRequest++;
    // Um card por vez: trocar/fechar o item fecha a rota e a busca.
    _request++;
    _focus.unfocus();
    _closeRoute();
    setState(() {
      _content = item;
      _loadingMenu = false;
      _expanded = false;
    });
  }

  /// Altura do card de conteúdo na tela (para a câmera não esconder o local).
  void _medirCardConteudo(double altura) {
    if (!mounted || _content == null) return;
    widget.controller.contentCardHeight.value = altura;
  }

  void _closeContent() => widget.controller.selectContent(null);

  Future<void> _openCategories() async {
    final controller = widget.controller;
    _request++;
    _focus.unfocus();
    setState(() => _expanded = false);
    final place = await showModalBottomSheet<CampusPlace>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: CampusPlaceCategorySheet(controller: controller),
      ),
    );
    if (!mounted || controller != widget.controller || place == null) return;
    await _select(place);
  }

  Future<void> _openList(CampusContentKind kind) async {
    _focus.unfocus();
    setState(() => _expanded = false);
    final item = await showModalBottomSheet<CampusContent>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) =>
          CampusContentSheet(controller: widget.controller, kind: kind),
    );
    if (!mounted || item == null) return;
    // Item pode ter sido trocado por uma recarga enquanto a lista estava aberta.
    final current = widget.controller.content(item.kind, item.id) ?? item;
    widget.controller.selectContent(current);
    if (current.location?.hasPosition == true) await _focusContent();
  }

  Future<void> _focusContent() async {
    final item = _content;
    if (item == null) return;
    try {
      await widget.controller.focusContent(item);
    } catch (_) {
      if (mounted) _message('Não foi possível focar o local. Tente novamente.');
    }
  }

  Future<void> _openMenu() async {
    final item = _content;
    if (item is! CampusRestaurant || _loadingMenu) return;
    final request = ++_menuRequest;
    setState(() => _loadingMenu = true);
    CampusMenu? menu;
    CampusContentFailure? failure;
    try {
      menu = await widget.controller.menuFor(item.id);
    } on CampusContentException catch (erro) {
      failure = erro.failure;
    } catch (_) {
      failure = CampusContentFailure.offline;
    }
    if (!mounted || request != _menuRequest) return;
    setState(() => _loadingMenu = false);
    if (failure != null) {
      _message(switch (failure) {
        CampusContentFailure.notFound =>
          'Este restaurante não está mais disponível.',
        CampusContentFailure.offline =>
          'Não foi possível carregar o cardápio. Verifique a conexão.',
      });
      return;
    }
    if (menu == null) {
      _message('Sem cardápio publicado para hoje.');
      return;
    }
    if (menu.isImage) {
      await showDialog<void>(
        context: context,
        builder: (_) => CampusMenuImageViewer(restaurant: item, menu: menu!),
      );
      return;
    }
    // PDF: visualizador do aparelho; sem ele, o link para copiar.
    var opened = false;
    try {
      opened = await widget.openExternalUrl?.call(menu.url) ?? false;
    } catch (_) {
      opened = false;
    }
    if (!mounted || opened) return;
    final copied = await showDialog<bool>(
      context: context,
      builder: (_) => CampusMenuLinkDialog(menu: menu!),
    );
    if (mounted && copied == true) _message('Link copiado.');
  }

  /// Uma leitura de GPS para mostrar a distância (dica de interface).
  Future<void> _measurePucStop() async {
    final id = _pucStopId;
    if (id == null) return;
    final request = ++_pucStopRequest;
    setState(() => _pucStop = _pucStop.copyWith(locating: true));
    final result = await widget.controller.locateOnce();
    if (!mounted || request != _pucStopRequest) return;
    final stop = widget.controller.pucStop(id);
    final location = result.location;
    setState(() {
      _pucStop = _pucStop.copyWith(
        locating: false,
        locationStatus: result.status,
        distance: stop != null && location != null
            ? stop.distanceFrom(location)
            : null,
        clearDistance: location == null,
      );
    });
    if (result.status != CampusLocationStatus.located) {
      _locationMessage(result.status);
    }
  }

  Future<void> _claimPucStop() async {
    final id = _pucStopId;
    if (id == null || _pucStop.claiming) return;
    final request = ++_pucStopRequest;
    setState(() => _pucStop = _pucStop.copyWith(claiming: true));
    final result = await widget.controller.claimPucStop(id);
    if (!mounted || request != _pucStopRequest) return;
    setState(() => _pucStop = _pucStop.copyWith(claiming: false));
    if (result.cancelled) return;
    if (result.claim case final claim?) {
      unawaited(HapticFeedback.mediumImpact());
      setState(
        () => _pucStop = _pucStop.copyWith(
          claim: claim,
          distance: claim.distanceMeters,
        ),
      );
      widget.onPucStopClaimed?.call(claim);
      return;
    }
    if (result.location case final status?) {
      _locationMessage(status);
      return;
    }
    final failure = result.failure!;
    setState(() {
      _pucStop = _pucStop.copyWith(
        unavailable: failure == CampusPucStopFailure.unavailable,
        distance: result.distanceMeters,
      );
    });
    final stop = widget.controller.pucStop(id);
    _message(switch (failure) {
      CampusPucStopFailure.alreadyCollected => 'Você já coletou este PucStop.',
      CampusPucStopFailure.outOfRange =>
        result.distanceMeters != null && stop != null
            ? 'Você está a ${campusDistanceLabel(result.distanceMeters!)}. '
                  'Chegue a ${stop.radiusMeters.round()} m para coletar.'
            : 'Aproxime-se do PucStop para coletar.',
      CampusPucStopFailure.imprecise =>
        'Localização imprecisa. Tente novamente ao ar livre.',
      CampusPucStopFailure.unavailable => 'Este PucStop está indisponível.',
      CampusPucStopFailure.unauthenticated =>
        'Entre na sua conta para coletar XP.',
      CampusPucStopFailure.offline =>
        'Não foi possível coletar agora. Verifique a conexão.',
    });
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
    if (_pucStopId != null) _closePucStop();
    if (_content != null) _closeContent();
    // Outro destino: a rota anterior não vale mais.
    _closeRoute();
    setState(() {
      _expanded = false;
      _selected = place;
    });
    try {
      await widget.controller.focusSelection(place);
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
    final content = _content;
    final place = _selected;
    if ((content == null && place == null) || _routing) return;
    final request = ++_routeRequest;
    final accessible = _accessible;
    _focus.unfocus();
    setState(() => _routing = true);
    // Prédio pelo id; área/sala da busca e conteúdo pela coordenada.
    final result = content != null
        ? await widget.controller.routeToContent(
            content,
            accessible: accessible,
          )
        : await widget.controller.routeToPlace(place!, accessible: accessible);
    if (!mounted || request != _routeRequest) return;
    setState(() {
      _routing = false;
      if (result.route != null) _route = result.route;
    });
    if (result.cancelled) return;
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
      CampusRouteFailure.destinationOutside =>
        'Este local fica longe dos caminhos do campus.',
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

  /// Atalhos leves sob a busca; somem enquanto há resultados abertos.
  List<Widget> get _shortcuts {
    if (!widget.controller.hasContent) return const [];
    final colors = Theme.of(context).colorScheme;
    Widget chip(String label, IconData icon, Key key, CampusContentKind kind) =>
        ActionChip(
          key: key,
          avatar: Icon(icon, size: 18),
          label: Text(label),
          backgroundColor: colors.surface,
          elevation: 2,
          onPressed: () => _openList(kind),
        );
    return [
      if (widget.showEvents)
        chip(
          'Eventos',
          Icons.event,
          const Key('campus-events-button'),
          CampusContentKind.event,
        ),
      if (widget.showRestaurants)
        chip(
          'Onde comer',
          Icons.restaurant,
          const Key('campus-restaurants-button'),
          CampusContentKind.restaurant,
        ),
    ];
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) =>
        _buildControls(context, constraints.biggest),
  );

  Widget _buildControls(BuildContext context, Size size) {
    final colors = Theme.of(context).colorScheme;
    final sideCardWidth = CampusCameraPolicy.sideCardWidth(size);
    final pucStop = _pucStopId == null
        ? null
        : widget.controller.pucStop(_pucStopId!);
    return Stack(
      children: [
        if (pucStop != null)
          Positioned(
            left: 12,
            right: sideCardWidth == null ? 76 : null,
            width: sideCardWidth,
            bottom: 44,
            child: _PucStopCard(
              stop: pucStop,
              view: _pucStop,
              collected: widget.controller.collectedPucStops.value.contains(
                pucStop.id,
              ),
              canClaim: widget.controller.pucStopService?.canClaim ?? false,
              onClaim: _claimPucStop,
              onMeasure: _measurePucStop,
              onClose: _closePucStop,
            ),
          )
        else if (_content case final item?)
          Positioned(
            left: 12,
            right: sideCardWidth == null ? 76 : null,
            width: sideCardWidth,
            bottom: 44,
            child: _MedeAltura(
              onAltura: _medirCardConteudo,
              child: CampusContentCard(
                item: item,
                canRoute: widget.controller.canRoute,
                route: _route,
                routing: _routing,
                accessible: _accessible,
                loadingMenu: _loadingMenu,
                onFocus: _focusContent,
                onTrace: _traceRoute,
                onAccessible: _setAccessible,
                onMenu: _openMenu,
                onClose: _closeContent,
              ),
            ),
          )
        else if (_selected case final place? when widget.controller.canRoute)
          Positioned(
            left: 12,
            right: sideCardWidth == null ? 76 : null,
            width: sideCardWidth,
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
                    suffixIcon: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          tooltip: 'Categorias de locais',
                          onPressed: _openCategories,
                          icon: const Icon(Icons.filter_list),
                        ),
                        IconButton(
                          tooltip: 'Limpar busca',
                          onPressed: _clear,
                          icon: const Icon(Icons.close),
                        ),
                      ],
                    ),
                    border: InputBorder.none,
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 12,
                    ),
                  ),
                ),
              ),
              if (!_expanded && _shortcuts.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Wrap(spacing: 8, children: _shortcuts),
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

/// Estado do card do PucStop (só da tela; nada persiste).
class _PucStopView {
  const _PucStopView({
    this.locating = false,
    this.claiming = false,
    this.unavailable = false,
    this.locationStatus,
    this.distance,
    this.claim,
  });

  final bool locating;
  final bool claiming;
  final bool unavailable;
  final CampusLocationStatus? locationStatus;
  final double? distance;
  final CampusPucStopClaim? claim;

  _PucStopView copyWith({
    bool? locating,
    bool? claiming,
    bool? unavailable,
    CampusLocationStatus? locationStatus,
    double? distance,
    bool clearDistance = false,
    CampusPucStopClaim? claim,
  }) => _PucStopView(
    locating: locating ?? this.locating,
    claiming: claiming ?? this.claiming,
    unavailable: unavailable ?? this.unavailable,
    locationStatus: locationStatus ?? this.locationStatus,
    distance: clearDistance ? null : distance ?? this.distance,
    claim: claim ?? this.claim,
  );
}

/// Estados visíveis do PucStop. Cada um tem ícone e texto (não só cor).
enum CampusPucStopState { available, outOfRange, collected, unavailable }

class _PucStopCard extends StatelessWidget {
  const _PucStopCard({
    required this.stop,
    required this.view,
    required this.collected,
    required this.canClaim,
    required this.onClaim,
    required this.onMeasure,
    required this.onClose,
  });

  final CampusPucStop stop;
  final _PucStopView view;
  final bool collected;
  final bool canClaim;
  final VoidCallback onClaim;
  final VoidCallback onMeasure;
  final VoidCallback onClose;

  CampusPucStopState get state {
    if (collected || view.claim != null) return CampusPucStopState.collected;
    if (view.unavailable) return CampusPucStopState.unavailable;
    final distance = view.distance;
    if (distance != null && distance > stop.radiusMeters) {
      return CampusPucStopState.outOfRange;
    }
    return CampusPucStopState.available;
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final state = this.state;
    final claim = view.claim;
    final (icon, label, color) = switch (state) {
      CampusPucStopState.collected => (
        Icons.check_circle,
        claim != null ? 'XP coletado!' : 'Já coletado',
        const Color(0xFF15803D),
      ),
      CampusPucStopState.unavailable => (
        Icons.block,
        'Indisponível no momento',
        colors.onSurfaceVariant,
      ),
      CampusPucStopState.outOfRange => (
        Icons.near_me_outlined,
        'Fora de alcance: aproxime-se',
        const Color(0xFFB45309),
      ),
      CampusPucStopState.available => (
        Icons.auto_awesome,
        view.distance == null ? 'Disponível' : 'Você está no alcance',
        const Color(0xFFB45309),
      ),
    };
    final distance = view.locating
        ? 'Calculando distância…'
        : view.distance != null
        ? 'A ${campusDistanceLabel(view.distance!)} · raio de ${stop.radiusMeters.round()} m'
        : 'Distância indisponível';
    return Material(
      key: const Key('campus-pucstop-card'),
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
                    stop.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: text.titleSmall,
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFF3C4),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    '+${stop.xp} XP',
                    key: const Key('campus-pucstop-xp'),
                    style: text.labelMedium?.copyWith(
                      color: const Color(0xFF92400E),
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                IconButton(
                  key: const Key('campus-pucstop-close'),
                  tooltip: 'Fechar',
                  onPressed: onClose,
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            Row(
              key: const Key('campus-pucstop-state'),
              children: [
                Icon(icon, size: 18, color: color),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    label,
                    style: text.bodyMedium?.copyWith(color: color),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 2),
            Text(
              distance,
              key: const Key('campus-pucstop-distance'),
              style: text.bodySmall?.copyWith(color: colors.onSurfaceVariant),
            ),
            if (claim != null)
              _ClaimReward(
                key: const Key('campus-pucstop-reward'),
                claim: claim,
              ),
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: switch (state) {
                CampusPucStopState.collected ||
                CampusPucStopState.unavailable => const SizedBox.shrink(),
                _ when !canClaim => Text(
                  'Entre na sua conta para coletar XP.',
                  key: const Key('campus-pucstop-login'),
                  style: text.bodyMedium,
                ),
                CampusPucStopState.outOfRange => OutlinedButton.icon(
                  key: const Key('campus-pucstop-measure'),
                  onPressed: view.locating ? null : onMeasure,
                  icon: const Icon(Icons.my_location),
                  label: const Text('Atualizar distância'),
                ),
                CampusPucStopState.available => FilledButton.icon(
                  key: const Key('campus-pucstop-claim'),
                  onPressed: view.claiming || view.locating ? null : onClaim,
                  icon: view.claiming
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.auto_awesome),
                  label: Text(view.claiming ? 'Coletando…' : 'Coletar XP'),
                ),
              },
            ),
          ],
        ),
      ),
    );
  }
}

/// "+50 XP" que cresce uma vez e o saldo novo. Animação curta, sem loop.
class _ClaimReward extends StatelessWidget {
  const _ClaimReward({super.key, required this.claim});
  final CampusPucStopClaim claim;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.6, end: 1),
      duration: const Duration(milliseconds: 450),
      curve: Curves.elasticOut,
      builder: (context, scale, child) => Transform.scale(
        scale: scale,
        alignment: Alignment.centerLeft,
        child: child,
      ),
      child: Padding(
        padding: const EdgeInsets.only(top: 6),
        child: Text(
          '+${claim.xpGained} XP · total ${claim.xpTotal} XP',
          style: text.titleMedium?.copyWith(
            color: const Color(0xFF15803D),
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }
}

/// "35 m" (metros inteiros) ou "1,2 km".
String campusDistanceLabel(double meters) => meters < 1000
    ? '${meters.round()} m'
    : '${(meters / 1000).toStringAsFixed(1).replaceAll('.', ',')} km';

/// "8 min a pé · 650 m": minutos arredondados (mínimo 1), metros de 10 em 10.
String campusRouteSummary(CampusRoute route) {
  final minutes = (route.durationSeconds / 60).round().clamp(1, 999);
  final meters = route.distanceMeters;
  final distance = meters < 1000
      ? '${(meters / 10).round() * 10} m'
      : '${(meters / 1000).toStringAsFixed(1).replaceAll('.', ',')} km';
  return '$minutes min a pé · $distance';
}

/// Informa a altura do filho a cada layout que a muda (fora do layout).
class _MedeAltura extends SingleChildRenderObjectWidget {
  const _MedeAltura({required this.onAltura, required super.child});

  final ValueChanged<double> onAltura;

  @override
  RenderObject createRenderObject(BuildContext context) =>
      _RenderMedeAltura(onAltura);

  @override
  void updateRenderObject(BuildContext context, _RenderMedeAltura render) =>
      render.onAltura = onAltura;
}

class _RenderMedeAltura extends RenderProxyBox {
  _RenderMedeAltura(this.onAltura);

  ValueChanged<double> onAltura;
  double? _ultima;

  @override
  void performLayout() {
    super.performLayout();
    final altura = size.height;
    if (altura == _ultima) return;
    _ultima = altura;
    WidgetsBinding.instance.addPostFrameCallback((_) => onAltura(altura));
  }
}
