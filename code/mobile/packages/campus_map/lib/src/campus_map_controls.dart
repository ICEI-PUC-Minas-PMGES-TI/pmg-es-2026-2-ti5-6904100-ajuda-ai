import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';

import 'campus_camera_policy.dart';
import 'campus_content.dart';
import 'campus_content_widgets.dart';
import 'campus_location_service.dart';
import 'campus_map_controller.dart';
import 'campus_map_defaults.dart';
import 'campus_map_icons.dart';
import 'campus_map_widgets.dart';
import 'campus_place.dart';
import 'campus_place_category.dart';
import 'campus_place_category_style.dart';
import 'campus_pucstop.dart';
import 'campus_route.dart';

/// Overlay isolado: digitação reconstrói somente os controles, não MapWidget.
/// Aparência do PUCMaps (`MapTemplate`, `MapControls`, `PlaceDetailSheet`);
/// cards de PucStop, eventos e restaurantes são próprios do Ajuda-aí.
class CampusMapControls extends StatefulWidget {
  const CampusMapControls({
    super.key,
    required this.controller,
    this.onPucStopClaimed,
    this.pucStopRewardNotice,
    this.showEvents = true,
    this.showRestaurants = true,
    this.openExternalUrl,
    this.canEditPlaces = false,
    this.onEditPlace,
    this.onDownloadPlaceImage,
  });
  final CampusMapController controller;

  /// Coleta confirmada pelo servidor (gancho para XP do app e som).
  final ValueChanged<CampusPucStopClaim>? onPucStopClaimed;
  final String? Function(CampusPucStop stop)? pucStopRewardNotice;

  /// Chips "Eventos" e "Onde comer" (só com serviço de conteúdo).
  final bool showEvents;
  final bool showRestaurants;

  /// Abre o cardápio em PDF fora do app; sem ele (ou se falhar) o link
  /// aparece para copiar.
  final Future<bool> Function(Uri url)? openExternalUrl;
  final bool canEditPlaces;
  final Future<bool> Function(CampusPlace place)? onEditPlace;
  final Future<void> Function(Uri originalUrl)? onDownloadPlaceImage;

  @override
  State<CampusMapControls> createState() => _CampusMapControlsState();
}

class _CampusMapControlsState extends State<CampusMapControls> {
  final _text = TextEditingController();
  final _focus = FocusNode();
  final _sheet = DraggableScrollableController();
  List<CampusPlace> _results = const [];
  bool _expanded = false;
  bool _searching = false;
  bool _searchError = false;
  bool _locating = false;
  int _request = 0;
  StreamSubscription<CampusPlace>? _placeSelections;
  StreamSubscription<String>? _pucStopSpins;

  /// Local escolhido (busca, marcador ou prédio tocado): abre o card.
  CampusPlace? _selected;
  CampusRoute? _route;

  /// Partida escolhida em "Escolher ponto de partida"; `null` = GPS.
  CampusPlace? _origin;
  bool _routing = false;
  int _routeRequest = 0;

  /// Altura atual do bottom sheet (fração da área do mapa; 0 = fechado).
  final _sheetExtent = ValueNotifier<double>(0);
  bool _sheetOpened = false;

  /// Card do PucStop: posição lida só enquanto ele está aberto (descartada
  /// ao fechar); a decisão da coleta é do servidor.
  String? _pucStopId;
  _PucStopView _pucStop = const _PucStopView();
  int _pucStopRequest = 0;

  /// Evento/restaurante no card (espelha `controller.selectedContent`).
  CampusContent? _content;
  bool _loadingMenu = false;
  int _menuRequest = 0;

  bool get _accessible => widget.controller.accessibleRoutes.value;

  @override
  void initState() {
    super.initState();
    _focus.addListener(_focusChanged);
    _sheet.addListener(_sheetMoved);
    _listen(widget.controller);
  }

  void _focusChanged() {
    if (mounted) setState(() {});
  }

  void _listen(CampusMapController controller) {
    _placeSelections = controller.placeSelections.listen(
      (place) => unawaited(_select(place)),
    );
    _pucStopSpins = controller.pucStopSpins.listen(_onPucStopSpun);
    controller.categoryFilter.addListener(_onCategoryChanged);
    controller.contentFilter.addListener(_onCategoryChanged);
    controller.savedPlaces.addListener(_onCategoryChanged);
    controller.accessibleRoutes.addListener(_onCategoryChanged);
    controller.lightMode.addListener(_onCategoryChanged);
    controller.activeRoute.addListener(_onRouteChanged);
    controller.selectedPucStop.addListener(_onPucStopSelected);
    controller.collectedPucStops.addListener(_onCollectedChanged);
    controller.selectedContent.addListener(_onContentSelected);
  }

  void _unlisten(CampusMapController controller) {
    unawaited(_placeSelections?.cancel());
    unawaited(_pucStopSpins?.cancel());
    try {
      controller.categoryFilter.removeListener(_onCategoryChanged);
      controller.contentFilter.removeListener(_onCategoryChanged);
      controller.savedPlaces.removeListener(_onCategoryChanged);
      controller.accessibleRoutes.removeListener(_onCategoryChanged);
      controller.lightMode.removeListener(_onCategoryChanged);
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
    try {
      widget.controller.selectedPlace.value = null;
    } catch (_) {
      // Controller já descartado pelo dono.
    }
    _sheet.removeListener(_sheetMoved);
    _sheet.dispose();
    _sheetExtent.dispose();
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

  // ─── Bottom sheet do local ──────────────────────────────────────────────

  /// Arrastar até o fim fecha o card, como no PUCMaps. Só depois de abrir:
  /// a animação de entrada começa em 0.
  void _sheetMoved() {
    if (!_sheet.isAttached) return;
    final size = _sheet.size;
    _sheetExtent.value = size;
    if (size >= CampusMapDefaults.placeSheetCollapsed * .8) {
      _sheetOpened = true;
    } else if (_sheetOpened && size <= 0.05 && _selected != null) {
      _closeRoute();
    }
  }

  /// Leva o sheet a [size] (abrir, recolher para a rota, nova seleção).
  void _moveSheet(double size) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_sheet.isAttached || _selected == null) return;
      unawaited(
        _sheet.animateTo(
          size,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOutQuart,
        ),
      );
    });
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

  /// O usuário girou o topo do totem em foco: só agora a coleta é pedida
  /// (o servidor confere o alcance). Já coletado ou indisponível: o giro é
  /// só visual.
  void _onPucStopSpun(String id) {
    if (!mounted || id != _pucStopId || _pucStop.claiming) return;
    if (widget.controller.collectedPucStops.value.contains(id) ||
        _pucStop.claim != null ||
        _pucStop.unavailable) {
      return;
    }
    if (!(widget.controller.pucStopService?.canClaim ?? false)) {
      _message('Entre na sua conta para coletar XP.');
      return;
    }
    unawaited(_claimPucStop());
  }

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

  void _onCategoryChanged() {
    if (mounted) setState(() {});
  }

  Future<void> _toggleCategory(CampusPlaceCategory category) async {
    _request++;
    _focus.unfocus();
    _text.clear();
    setState(() => _expanded = false);
    try {
      await widget.controller.toggleCategory(category);
    } catch (_) {
      if (mounted) {
        _message('Não foi possível mostrar os locais. Tente novamente.');
      }
    }
  }

  /// Chip "Eventos"/"Onde comer": filtra o mapa (como a categoria
  /// "Restaurantes" do PUCMaps) e abre a lista com cardápios e horários.
  Future<void> _toggleContent(CampusContentKind kind) async {
    _request++;
    _focus.unfocus();
    _text.clear();
    setState(() => _expanded = false);
    if (widget.controller.toggleContentFilter(kind)) await _openList(kind);
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

  /// Chip "Salvos": o mapa passa a mostrar só os pinos dos salvos e abre a
  /// lista; tocar de novo volta ao mapa completo.
  Future<void> _toggleSavedFilter() async {
    _request++;
    _focus.unfocus();
    _text.clear();
    setState(() => _expanded = false);
    if (widget.controller.toggleSavedFilter()) await _openSaved();
  }

  /// Lista dos salvos do aparelho; escolher foca o local e abre o card.
  Future<void> _openSaved() async {
    _request++;
    _focus.unfocus();
    setState(() => _expanded = false);
    final place = await showModalBottomSheet<CampusPlace>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _SavedPlacesSheet(controller: widget.controller),
    );
    if (!mounted || place == null) return;
    widget.controller.selectPlace(place);
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
    if (query.trim().isNotEmpty) widget.controller.clearCategory();
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

  /// Fecha o card, tira o destaque e apaga a linha (também cancela um cálculo
  /// pendente).
  void _closeRoute() {
    _routeRequest++;
    if (_selected != null || _route != null || _routing) {
      unawaited(widget.controller.clearRoute());
    }
    try {
      widget.controller.selectedPlace.value = null;
    } catch (_) {
      // Controller já descartado pelo dono.
    }
    _sheetOpened = false;
    _sheetExtent.value = 0;
    if (!mounted) return;
    setState(() {
      _selected = null;
      _route = null;
      _origin = null;
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
    final wasOpen = _selected != null && _sheet.isAttached;
    _closeRoute();
    widget.controller.selectedPlace.value = place;
    setState(() {
      _expanded = false;
      _selected = place;
    });
    // Sheet novo entra deslizando de 0 até a altura padrão (PUCMaps); um já
    // aberto só volta à altura padrão para o novo local.
    _sheetOpened = wasOpen;
    _moveSheet(CampusMapDefaults.placeSheetDefault);
    try {
      await widget.controller.focusSelection(place);
    } catch (_) {
      if (mounted) _message('Não foi possível focar o local. Tente novamente.');
    }
    try {
      final detalhado = await widget.controller.placeRepository.findById(
        place.id,
      );
      if (mounted && _selected?.id == place.id && detalhado != null) {
        setState(() => _selected = detalhado);
      }
    } catch (_) {
      // O resumo local continua funcional para rota mesmo sem conteúdo remoto.
    }
  }

  Future<void> _editarLocal() async {
    final place = _selected;
    final editar = widget.onEditPlace;
    if (place == null || editar == null) return;
    final salvo = await editar(place);
    if (!mounted || !salvo || _selected?.id != place.id) return;
    try {
      final atualizado = await widget.controller.placeRepository.findById(
        place.id,
      );
      if (mounted && atualizado != null && _selected?.id == place.id) {
        setState(() => _selected = atualizado);
      }
    } catch (_) {
      _message('As informações foram salvas. Reabra o local para atualizar.');
    }
  }

  Future<void> _toggleSaved() async {
    final place = _selected;
    if (place == null) return;
    try {
      final saved = await widget.controller.toggleSaved(place);
      if (mounted) {
        _message(saved ? 'Local salvo.' : 'Local removido dos salvos.');
      }
    } catch (_) {
      if (mounted) {
        _message('Não foi possível salvar o local. Tente novamente.');
      }
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

  /// "Ir até aqui": rota da posição atual (GPS) até o local do card.
  Future<void> _traceRoute() async {
    final content = _content;
    final place = _selected;
    if ((content == null && place == null) || _routing) return;
    final request = ++_routeRequest;
    final accessible = _accessible;
    _focus.unfocus();
    setState(() {
      _routing = true;
      _origin = null;
    });
    // Prédio pelo id; área/sala da busca e conteúdo pela coordenada.
    final result = content != null
        ? await widget.controller.routeToContent(
            content,
            accessible: accessible,
          )
        : await widget.controller.routeToPlace(place!, accessible: accessible);
    if (!mounted || request != _routeRequest) return;
    _routeFinished(result, accessible: accessible, fromPlace: false);
  }

  /// "Escolher ponto de partida": a partida é outro local do campus.
  Future<void> _chooseOrigin() async {
    final place = _selected;
    if (place == null || _routing) return;
    _focus.unfocus();
    final origin = await showModalBottomSheet<CampusPlace>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) =>
          _OriginPickerSheet(controller: widget.controller, destination: place),
    );
    if (!mounted || origin == null || _selected?.id != place.id) return;
    await _traceFrom(origin);
  }

  Future<void> _traceFrom(CampusPlace origin) async {
    final place = _selected;
    if (place == null) return;
    final request = ++_routeRequest;
    final accessible = _accessible;
    setState(() {
      _routing = true;
      _origin = origin;
    });
    final result = await widget.controller.routeBetween(
      origin,
      place,
      accessible: accessible,
    );
    if (!mounted || request != _routeRequest) return;
    _routeFinished(result, accessible: accessible, fromPlace: true);
  }

  void _routeFinished(
    CampusRouteResult result, {
    required bool accessible,
    required bool fromPlace,
  }) {
    setState(() {
      _routing = false;
      if (result.route != null) _route = result.route;
    });
    if (result.cancelled) return;
    if (result.route != null) {
      // Card recolhido: a linha fica visível sem perder o local.
      if (_selected != null) {
        _moveSheet(CampusMapDefaults.placeSheetCollapsed);
      }
      return;
    }
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
      CampusRouteFailure.outsideCampus =>
        fromPlace ? 'O ponto de partida fica longe dos caminhos do campus.' : 'Você está longe dos caminhos do campus. Aproxime-se para traçar a rota.',
      CampusRouteFailure.samePlace =>
        fromPlace
            ? 'A partida e o destino são o mesmo local.'
            : 'Você já está neste local.',
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

  /// Botão de cadeira de rodas (PUCMaps): vale para as próximas rotas e
  /// refaz a rota da tela no novo modo.
  void _setAccessible(bool value) {
    // Como no PUCMaps, o próprio botão (cor e descrição) indica o modo.
    widget.controller.accessibleRoutes.value = value;
    if (_route == null) return;
    final origin = _origin;
    if (origin != null && _content == null) {
      unawaited(_traceFrom(origin));
    } else {
      unawaited(_traceRoute());
    }
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

  // ─── Fileira de categorias ──────────────────────────────────────────────

  /// Ordem pedida para o Ajuda-aí: Eventos, Prédios acadêmicos, Onde comer;
  /// depois as demais categorias e os salvos, por rolagem horizontal.
  List<Widget> get _chips {
    final controller = widget.controller;
    final content = controller.contentFilter.value;
    final hasContent = controller.hasContent;
    Widget category(CampusPlaceCategory value) {
      final filter = controller.categoryFilter.value;
      final selected = filter.category == value;
      return CampusCategoryChip(
        key: Key('campus-category-quick-${value.name}'),
        label: value.label,
        icon: value.icon,
        selected: selected,
        loading: selected && filter.loading,
        onTap: () => _toggleCategory(value),
      );
    }

    return [
      if (hasContent && widget.showEvents)
        CampusCategoryChip(
          key: const Key('campus-events-button'),
          label: 'Eventos',
          icon: Icons.event,
          selected: content == CampusContentKind.event,
          onTap: () => _toggleContent(CampusContentKind.event),
        ),
      category(CampusPlaceCategory.academic),
      if (hasContent && widget.showRestaurants)
        CampusCategoryChip(
          key: const Key('campus-restaurants-button'),
          label: 'Onde comer',
          icon: Icons.restaurant,
          selected: content == CampusContentKind.restaurant,
          onTap: () => _toggleContent(CampusContentKind.restaurant),
        ),
      // Logo depois dos três principais: visível sem rolar a fileira.
      if (controller.canSavePlaces)
        CampusCategoryChip(
          key: const Key('campus-saved-button'),
          label: switch (controller.savedPlaces.value.length) {
            0 => 'Salvos',
            final n => 'Salvos ($n)',
          },
          icon: controller.savedFilter.value
              ? Icons.bookmark
              : Icons.bookmark_border,
          selected: controller.savedFilter.value,
          onTap: _toggleSavedFilter,
        ),
      for (final value in CampusPlaceCategory.values)
        if (value != CampusPlaceCategory.academic) category(value),
    ];
  }

  Widget get _chipRow => Semantics(
    label: 'Categorias de locais',
    child: SizedBox(
      height: 36,
      child: SingleChildScrollView(
        key: const Key('campus-category-shortcuts'),
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(
          horizontal: CampusMapStyle.sideMargin,
        ),
        child: Row(
          children: [
            for (final (i, chip) in _chips.indexed) ...[
              if (i > 0) const SizedBox(width: 8),
              chip,
            ],
          ],
        ),
      ),
    ),
  );

  // ─── Layout ─────────────────────────────────────────────────────────────

  Widget _placeCard(
    CampusPlace place, {
    ScrollController? scrollController,
    bool mobileSheet = false,
  }) => _PlaceCard(
    place: place,
    route: _route,
    origin: _origin,
    accessible: _accessible,
    routing: _routing,
    onTrace: _traceRoute,
    onChooseOrigin: widget.controller.canRouteBetween ? _chooseOrigin : null,
    onClose: _closeRoute,
    canRoute: widget.controller.canRoute,
    saved: widget.controller.isSaved(place.id),
    onToggleSaved: widget.controller.canSavePlaces ? _toggleSaved : null,
    canEdit: widget.canEditPlaces && widget.onEditPlace != null,
    onEdit: _editarLocal,
    onDownloadImage: widget.onDownloadPlaceImage,
    scrollController: scrollController,
    mobileSheet: mobileSheet,
  );

  @override
  Widget build(BuildContext context) => CampusMapTypography(
    child: LayoutBuilder(
      builder: (context, constraints) =>
          _buildControls(context, constraints.biggest),
    ),
  );

  Widget _buildControls(BuildContext context, Size size) {
    final sideCardWidth = CampusCameraPolicy.sideCardWidth(size);
    final pucStop = _pucStopId == null
        ? null
        : widget.controller.pucStop(_pucStopId!);
    // Acima do logo/atribuição do Mapbox e da área de gestos do aparelho.
    final controlsBottom = 32.0 + MediaQuery.paddingOf(context).bottom;
    final sheetOpen = _selected != null && sideCardWidth == null;
    final sideHeight = CampusMapSideControls.heightFor(
      accessibility: widget.controller.canRoute,
      compact: sheetOpen,
    );
    // Experiência do totem: só o totem e o painel de giro na tela.
    if (pucStop != null) {
      return Stack(
        children: [
          Positioned(
            left: 16,
            right: sideCardWidth == null ? 16 : null,
            width: sideCardWidth,
            bottom: 16 + MediaQuery.paddingOf(context).bottom,
            child: _PucStopCard(
              stop: pucStop,
              view: _pucStop,
              collected: widget.controller.collectedPucStops.value.contains(
                pucStop.id,
              ),
              canClaim: widget.controller.pucStopService?.canClaim ?? false,
              rewardNotice: widget.pucStopRewardNotice?.call(pucStop),
              onMeasure: _measurePucStop,
              onClose: _closePucStop,
            ),
          ),
        ],
      );
    }
    return Stack(
      children: [
        // Controles laterais do PUCMaps (direita, acima do rodapé). Sobem com
        // o bottom sheet e somem quando não cabem acima dele.
        ValueListenableBuilder<double>(
          valueListenable: _sheetExtent,
          builder: (context, extent, child) {
            final sheet = sheetOpen ? extent * size.height : 0.0;
            final bottom = math.max(controlsBottom, sheet + 12);
            final top = widget.controller.controlsHeight.value + 12;
            final fits = bottom + sideHeight <= size.height - top;
            return Positioned(
              right: 20,
              bottom: bottom,
              child: IgnorePointer(
                ignoring: !fits,
                child: AnimatedOpacity(
                  opacity: fits ? 1 : 0,
                  duration: const Duration(milliseconds: 150),
                  child: child,
                ),
              ),
            );
          },
          child: CampusMapSideControls(
            compact: sheetOpen,
            accessible: _accessible,
            onAccessible: widget.controller.canRoute
                ? () => _setAccessible(!_accessible)
                : null,
            locating: _locating,
            onLocate: _locate,
            onZoomIn: () => unawaited(widget.controller.zoomBy(1)),
            onZoomOut: () => unawaited(widget.controller.zoomBy(-1)),
          ),
        ),
        if (_content case final item?)
          Positioned(
            left: 12,
            right: sideCardWidth == null ? 82 : null,
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
          ),
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          child: _MedeAltura(
            onAltura: (height) {
              if (mounted) widget.controller.controlsHeight.value = height;
            },
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: CampusMapStyle.sideMargin,
                      ),
                      child: CampusSearchField(
                        controller: _text,
                        focusNode: _focus,
                        onChanged: _search,
                        onSubmitted: _search,
                        onClear: _clear,
                        onTap: () {
                          if (_text.text.isNotEmpty) _search(_text.text);
                        },
                        onTapOutside: (_) {
                          _focus.unfocus();
                          if (_expanded) setState(() => _expanded = false);
                        },
                      ),
                    ),
                    if (_expanded && !_searching)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(
                          CampusMapStyle.sideMargin,
                          8,
                          CampusMapStyle.sideMargin,
                          0,
                        ),
                        // Resultados e campo pertencem ao mesmo grupo de
                        // toque: selecionar não dispara onTapOutside antes.
                        child: TextFieldTapRegion(child: _searchResults()),
                      )
                    else if (_showSavedSuggestions)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(
                          CampusMapStyle.sideMargin,
                          8,
                          CampusMapStyle.sideMargin,
                          0,
                        ),
                        child: TextFieldTapRegion(child: _savedSuggestions()),
                      ),
                    const SizedBox(height: 12),
                    _chipRow,
                    if (!_expanded)
                      Padding(
                        padding: const EdgeInsets.only(left: 16, top: 14),
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: CampusLightButton(
                            label: widget.controller.lightMode.value.labelAt(
                              DateTime.now(),
                            ),
                            onTap: widget.controller.cycleLightMode,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
        if (_selected case final place?)
          if (sideCardWidth == null)
            Positioned.fill(
              child: DraggableScrollableSheet(
                key: const Key('campus-place-sheet'),
                controller: _sheet,
                initialChildSize: 0,
                minChildSize: 0,
                maxChildSize: CampusMapDefaults.placeSheetExpanded,
                snap: true,
                snapSizes: const [
                  CampusMapDefaults.placeSheetCollapsed,
                  CampusMapDefaults.placeSheetDefault,
                ],
                builder: (context, scrollController) => _placeCard(
                  place,
                  scrollController: scrollController,
                  mobileSheet: true,
                ),
              ),
            )
          else
            Positioned(
              left: 12,
              width: sideCardWidth,
              bottom: 44,
              child: _placeCard(place),
            ),
      ],
    );
  }

  /// Busca tocada e ainda vazia: os salvos aparecem como atalho.
  bool get _showSavedSuggestions =>
      _focus.hasFocus &&
      _text.text.trim().isEmpty &&
      widget.controller.savedPlaces.value.isNotEmpty;

  Widget _savedSuggestions() {
    final saved = widget.controller.savedPlaces.value;
    return Container(
      key: const Key('campus-search-saved'),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: const [CampusMapStyle.searchShadow],
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(16),
        clipBehavior: Clip.antiAlias,
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * .3,
          ),
          child: ListView(
            padding: EdgeInsets.zero,
            shrinkWrap: true,
            children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(16, 12, 16, 4),
                child: Text(
                  'Locais salvos',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: CampusMapStyle.save,
                  ),
                ),
              ),
              for (final place in saved)
                _PlaceTile(
                  key: Key('campus-search-saved-${place.id}'),
                  place: place,
                  saved: true,
                  onTap: () => _select(place),
                ),
            ],
          ),
        ),
      ),
    );
  }

  /// Sugestões no cartão branco do PUCMaps: ícone e cor da categoria,
  /// nome em negrito e tipo abaixo.
  Widget _searchResults() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: const [CampusMapStyle.searchShadow],
      ),
      child: Material(
        color: Colors.transparent,
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
                    style: const TextStyle(color: CampusMapStyle.muted),
                  ),
                )
              : ListView.builder(
                  padding: EdgeInsets.zero,
                  shrinkWrap: true,
                  itemCount: _results.length,
                  itemBuilder: (context, index) {
                    final place = _results[index];
                    return _PlaceTile(
                      key: Key('campus-search-result-${place.id}'),
                      place: place,
                      onTap: () => _select(place),
                    );
                  },
                ),
        ),
      ),
    );
  }
}

// ─── Visual por tipo de local ───────────────────────────────────────────────

/// Ícone e cor de um local na lista (mesma paleta dos pinos do mapa).
(IconData, Color) campusPlaceVisual(CampusPlace place) {
  final type = place.type?.trim().toUpperCase();
  if (type == 'GATE') {
    return (CampusMapIcons.gate.icon, CampusMapIcons.gate.color);
  }
  if (type == 'CAFETERIA' || type == 'RESTAURANT') {
    return (CampusMapIcons.food.icon, CampusMapIcons.food.color);
  }
  for (final category in CampusPlaceCategory.values) {
    if (category.types.contains(type)) {
      return (category.icon, category.markerColor);
    }
  }
  return (Icons.place_outlined, Colors.lightBlueAccent);
}

/// Tipo legível do local (subtítulo do card e das listas).
String? campusPlaceTypeLabel(String? value) =>
    switch (value?.trim().toUpperCase()) {
      'ACADEMIC' => 'Acadêmico',
      'CLASSROOM' => 'Salas de aula',
      'AUDITORIUM' => 'Auditório',
      'LAB' => 'Laboratório',
      'LIBRARY' => 'Biblioteca',
      'SPORTS' => 'Esportes',
      'GATE' => 'Portaria',
      'CAFETERIA' || 'RESTAURANT' => 'Alimentação',
      'SERVICE' => 'Serviço',
      'BANK' => 'Banco',
      'ADMIN' || 'ADMINISTRATIVE' || 'OFFICE' => 'Administração',
      'PARKING' || 'PARKING_LOT' => 'Estacionamento',
      'PARK' => 'Área verde',
      null || '' || 'UNKNOWN' => null,
      final other => other[0] + other.substring(1).toLowerCase(),
    };

String? _placeSubtitle(CampusPlace place) =>
    campusPlaceTypeLabel(place.type) ??
    (place.name != null && place.code != null ? place.code : null) ??
    switch (place.kind) {
      CampusPlaceKind.area => 'Área',
      CampusPlaceKind.room => 'Sala',
      _ => null,
    };

class _PlaceTile extends StatelessWidget {
  const _PlaceTile({
    super.key,
    required this.place,
    required this.onTap,
    this.trailing,
    this.saved = false,
  });

  final CampusPlace place;
  final VoidCallback onTap;
  final Widget? trailing;

  /// Item da lista de salvos: o marcador laranja do pino no mapa.
  final bool saved;

  @override
  Widget build(BuildContext context) {
    final (icon, color) = saved
        ? (CampusMapIcons.saved.icon, CampusMapIcons.saved.color)
        : campusPlaceVisual(place);
    final subtitle = _placeSubtitle(place);
    return ListTile(
      leading: Icon(icon, color: color),
      title: Text(
        place.displayName,
        style: const TextStyle(
          color: CampusMapStyle.text,
          fontWeight: FontWeight.w500,
        ),
      ),
      subtitle: subtitle == null
          ? null
          : Text(subtitle, style: const TextStyle(color: CampusMapStyle.muted)),
      trailing: trailing,
      onTap: onTap,
    );
  }
}

// ─── Card do local (PlaceDetailSheet do PUCMaps) ────────────────────────────

class _PlaceCard extends StatelessWidget {
  const _PlaceCard({
    required this.place,
    required this.route,
    required this.origin,
    required this.accessible,
    required this.routing,
    required this.onTrace,
    required this.onChooseOrigin,
    required this.onClose,
    required this.canRoute,
    required this.saved,
    required this.onToggleSaved,
    required this.canEdit,
    required this.onEdit,
    required this.onDownloadImage,
    this.scrollController,
    this.mobileSheet = false,
  });

  final CampusPlace place;
  final CampusRoute? route;
  final CampusPlace? origin;
  final bool accessible;
  final bool routing;
  final VoidCallback onTrace;

  /// `null`: o serviço de rota não aceita partida escolhida.
  final VoidCallback? onChooseOrigin;
  final VoidCallback onClose;
  final bool canRoute;
  final bool saved;

  /// `null`: sem store de salvos (botão não aparece).
  final VoidCallback? onToggleSaved;
  final bool canEdit;
  final VoidCallback onEdit;
  final Future<void> Function(Uri originalUrl)? onDownloadImage;
  final ScrollController? scrollController;
  final bool mobileSheet;

  @override
  Widget build(BuildContext context) {
    final route = this.route;
    // Tipo sob o nome (PUCMaps), omitido quando repete o nome ("Biblioteca").
    final type = switch (campusPlaceTypeLabel(place.type)) {
      final label? when label != place.displayName => label,
      _ => null,
    };
    final details = <String>[
      if (place.code?.trim().isNotEmpty == true) 'Código ${place.code}',
      if (place.heightMeters case final height? when height > 0)
        'Altura aproximada: ${_formatHeight(height)}',
    ];
    final fromGps = routing && origin == null;
    final fromPlace = routing && origin != null;
    final content = SingleChildScrollView(
      controller: scrollController,
      child: Padding(
        padding: EdgeInsets.fromLTRB(24, mobileSheet ? 16 : 12, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (mobileSheet)
              const CampusSheetHandle(key: Key('campus-place-sheet-handle')),
            Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: CampusMapStyle.brand.withValues(alpha: 0.1),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.location_on_rounded,
                    color: CampusMapStyle.brand,
                    size: 26,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        place.displayName,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w600,
                          color: CampusMapStyle.brand,
                        ),
                      ),
                      if (type != null)
                        Text(
                          type,
                          style: const TextStyle(
                            fontSize: 13,
                            color: CampusMapStyle.muted,
                          ),
                        ),
                    ],
                  ),
                ),
                IconButton(
                  key: const Key('campus-route-clear'),
                  tooltip: 'Fechar',
                  onPressed: onClose,
                  icon: const Icon(
                    Icons.close,
                    color: CampusMapStyle.muted,
                    size: 24,
                  ),
                ),
              ],
            ),
            if (details.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  details.join(' · '),
                  key: const Key('campus-place-details'),
                  style: const TextStyle(
                    fontSize: 13,
                    color: CampusMapStyle.muted,
                  ),
                ),
              ),
            if (route != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: _RouteSummary(route: route, origin: origin),
              ),
            const SizedBox(height: 24),
            const Divider(height: 1),
            const SizedBox(height: 20),
            if (canRoute) ...[
              CampusPlaceActionButton(
                key: const Key('campus-route-trace'),
                icon: Icons.near_me_rounded,
                label: fromGps ? 'Calculando rota' : 'Ir até aqui',
                subtitle: accessible
                    ? 'Da minha localização atual · rota acessível'
                    : 'Da minha localização atual',
                color: CampusMapStyle.brand,
                loading: fromGps,
                onTap: routing ? null : onTrace,
              ),
              const SizedBox(height: 12),
            ],
            if (canRoute && onChooseOrigin != null) ...[
              CampusPlaceActionButton(
                key: const Key('campus-route-origin'),
                icon: Icons.alt_route_rounded,
                label: fromPlace
                    ? 'Calculando rota'
                    : 'Escolher ponto de partida',
                subtitle: 'Traçar rota entre dois locais',
                color: CampusMapStyle.origin,
                loading: fromPlace,
                onTap: routing ? null : onChooseOrigin,
              ),
              const SizedBox(height: 12),
            ],
            if (onToggleSaved != null) ...[
              CampusPlaceActionButton(
                key: const Key('campus-place-save'),
                icon: saved ? Icons.bookmark : Icons.bookmark_border,
                label: saved ? 'Remover dos salvos' : 'Salvar local',
                subtitle: 'Salvar no dispositivo',
                color: CampusMapStyle.save,
                onTap: onToggleSaved,
              ),
              const SizedBox(height: 12),
            ],
            if (canEdit) ...[
              CampusPlaceActionButton(
                key: const Key('campus-place-edit'),
                icon: Icons.edit_outlined,
                label: 'Editar informações',
                subtitle: 'Descrição e imagens do local',
                color: const Color(0xFF455A64),
                onTap: onEdit,
              ),
              const SizedBox(height: 12),
            ],
            if (place.description.trim().isNotEmpty) ...[
              const SizedBox(height: 16),
              const Text(
                'Sobre este lugar',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: CampusMapStyle.brand,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                place.description,
                style: const TextStyle(
                  fontSize: 15,
                  height: 1.45,
                  color: CampusMapStyle.text,
                ),
              ),
            ],
            if (place.images.isNotEmpty) ...[
              const SizedBox(height: 20),
              const Text(
                'Imagens',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: CampusMapStyle.brand,
                ),
              ),
              const SizedBox(height: 8),
              SizedBox(
                height: 132,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: place.images.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 8),
                  itemBuilder: (context, index) {
                    final image = place.images[index];
                    return InkWell(
                      onTap: () =>
                          _showPlaceImage(context, image, onDownloadImage),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Image.network(
                          image.url.toString(),
                          width: 180,
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) => const SizedBox(
                            width: 180,
                            child: Center(
                              child: Icon(Icons.broken_image_outlined),
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ],
          ],
        ),
      ),
    );
    final decoration = BoxDecoration(
      color: Colors.white,
      borderRadius: mobileSheet
          ? const BorderRadius.vertical(top: Radius.circular(28))
          : BorderRadius.circular(16),
      boxShadow: const [
        BoxShadow(color: Colors.black12, blurRadius: 10, offset: Offset(0, -2)),
      ],
    );
    return Material(
      key: const Key('campus-route-card'),
      color: Colors.transparent,
      child: Container(
        decoration: decoration,
        clipBehavior: Clip.antiAlias,
        child: mobileSheet
            ? content
            : ConstrainedBox(
                constraints: BoxConstraints(
                  maxHeight: MediaQuery.sizeOf(context).height * .62,
                ),
                child: content,
              ),
      ),
    );
  }
}

/// Tempo, distância, partida e modo acessível da rota na tela.
class _RouteSummary extends StatelessWidget {
  const _RouteSummary({required this.route, required this.origin});

  final CampusRoute route;
  final CampusPlace? origin;

  @override
  Widget build(BuildContext context) {
    final origin = this.origin;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: CampusMapStyle.brand.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Icon(
            route.accessible ? Icons.accessible : Icons.directions_walk,
            color: CampusMapStyle.brand,
            size: 22,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  campusRouteSummary(route),
                  key: const Key('campus-route-summary'),
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: CampusMapStyle.brand,
                  ),
                ),
                Text(
                  [
                    origin == null
                        ? 'Da sua localização'
                        : 'Partindo de ${origin.displayName}',
                    if (route.accessible) 'rota acessível',
                  ].join(' · '),
                  key: const Key('campus-route-origin-label'),
                  style: const TextStyle(
                    fontSize: 12,
                    color: CampusMapStyle.muted,
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

// ─── Escolher ponto de partida (_OriginPickerSheet do PUCMaps) ──────────────

class _OriginPickerSheet extends StatefulWidget {
  const _OriginPickerSheet({
    required this.controller,
    required this.destination,
  });

  final CampusMapController controller;
  final CampusPlace destination;

  @override
  State<_OriginPickerSheet> createState() => _OriginPickerSheetState();
}

class _OriginPickerSheetState extends State<_OriginPickerSheet> {
  final _text = TextEditingController();
  List<CampusPlace> _results = const [];
  bool _searching = false;
  bool _error = false;
  int _request = 0;

  @override
  void dispose() {
    _request++;
    _text.dispose();
    super.dispose();
  }

  /// Sem texto: salvos e portarias, partidas comuns no campus.
  List<CampusPlace> get _suggestions {
    final seen = <String>{widget.destination.id};
    return [
      for (final place in [
        ...widget.controller.savedPlaces.value,
        ...widget.controller.pointsOfInterest.value.where(
          (p) => p.type?.toUpperCase() == 'GATE',
        ),
      ])
        if (seen.add(place.id)) place,
    ];
  }

  Future<void> _search(String query) async {
    final request = ++_request;
    if (query.trim().isEmpty) {
      setState(() {
        _results = const [];
        _searching = false;
        _error = false;
      });
      return;
    }
    setState(() {
      _searching = true;
      _error = false;
    });
    try {
      final results = await widget.controller.search(query);
      if (!mounted || request != _request) return;
      setState(() {
        _results = [
          for (final place in results)
            if (place.id != widget.destination.id) place,
        ];
        _searching = false;
      });
    } catch (_) {
      if (!mounted || request != _request) return;
      setState(() {
        _error = true;
        _searching = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final typing = _text.text.trim().isNotEmpty;
    final places = typing ? _results : _suggestions;
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.75,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (context, scrollController) => Container(
        key: const Key('campus-origin-sheet'),
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const CampusSheetHandle(margin: EdgeInsets.symmetric(vertical: 12)),
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: CampusMapStyle.sideMargin,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Escolher ponto de partida',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w600,
                            color: CampusMapStyle.brand,
                          ),
                        ),
                      ),
                      IconButton(
                        tooltip: 'Fechar',
                        onPressed: () => Navigator.pop(context),
                        icon: const Icon(
                          Icons.close,
                          color: CampusMapStyle.muted,
                          size: 24,
                        ),
                      ),
                    ],
                  ),
                  Text(
                    'Destino: ${widget.destination.displayName}',
                    style: const TextStyle(
                      fontSize: 13,
                      color: CampusMapStyle.muted,
                    ),
                  ),
                  const SizedBox(height: 16),
                  CampusSearchField(
                    controller: _text,
                    hintText: 'Buscar local de partida...',
                    onChanged: _search,
                    onSubmitted: _search,
                  ),
                ],
              ),
            ),
            Expanded(
              child: _searching
                  ? const Center(child: CircularProgressIndicator())
                  : places.isEmpty
                  ? Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        _error
                            ? 'Não foi possível buscar locais. Tente novamente.'
                            : typing
                            ? 'Nenhum local encontrado.'
                            : 'Digite o nome ou o número de um prédio.',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: CampusMapStyle.muted),
                      ),
                    )
                  : Padding(
                      padding: const EdgeInsets.fromLTRB(
                        CampusMapStyle.sideMargin,
                        8,
                        CampusMapStyle.sideMargin,
                        24,
                      ),
                      child: Container(
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(16),
                          boxShadow: const [CampusMapStyle.searchShadow],
                        ),
                        child: Material(
                          color: Colors.transparent,
                          borderRadius: BorderRadius.circular(16),
                          clipBehavior: Clip.antiAlias,
                          child: ListView.builder(
                            controller: scrollController,
                            padding: EdgeInsets.zero,
                            itemCount: places.length,
                            itemBuilder: (context, index) {
                              final place = places[index];
                              return _PlaceTile(
                                key: Key('campus-origin-${place.id}'),
                                place: place,
                                onTap: () => Navigator.pop(context, place),
                              );
                            },
                          ),
                        ),
                      ),
                    ),
            ),
            SizedBox(height: MediaQuery.paddingOf(context).bottom),
          ],
        ),
      ),
    );
  }
}

// ─── Locais salvos ─────────────────────────────────────────────────────────

class _SavedPlacesSheet extends StatelessWidget {
  const _SavedPlacesSheet({required this.controller});

  final CampusMapController controller;

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.6,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      builder: (context, scrollController) => Container(
        key: const Key('campus-saved-sheet'),
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: ValueListenableBuilder<List<CampusPlace>>(
          valueListenable: controller.savedPlaces,
          builder: (context, saved, _) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const CampusSheetHandle(
                margin: EdgeInsets.symmetric(vertical: 12),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: CampusMapStyle.sideMargin,
                ),
                child: Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Locais salvos',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w600,
                          color: CampusMapStyle.brand,
                        ),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Fechar',
                      onPressed: () => Navigator.pop(context),
                      icon: const Icon(
                        Icons.close,
                        color: CampusMapStyle.muted,
                        size: 24,
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: saved.isEmpty
                    ? const Padding(
                        padding: EdgeInsets.all(24),
                        child: Text(
                          'Nenhum local salvo. Abra um local no mapa e toque '
                          'em "Salvar local".',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: CampusMapStyle.muted),
                        ),
                      )
                    // Material próprio: o efeito de toque dos itens aparece
                    // sobre o fundo branco do sheet.
                    : Material(
                        color: Colors.transparent,
                        child: ListView.builder(
                          controller: scrollController,
                          itemCount: saved.length,
                          itemBuilder: (context, index) {
                            final place = saved[index];
                            return _PlaceTile(
                              key: Key('campus-saved-${place.id}'),
                              place: place,
                              saved: true,
                              onTap: () => Navigator.pop(context, place),
                              trailing: IconButton(
                                tooltip: 'Remover dos salvos',
                                icon: const Icon(
                                  Icons.bookmark_remove_outlined,
                                  color: CampusMapStyle.save,
                                ),
                                onPressed: () async {
                                  try {
                                    await controller.toggleSaved(place);
                                  } catch (_) {
                                    if (!context.mounted) return;
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      const SnackBar(
                                        content: Text(
                                          'Não foi possível remover o local.',
                                        ),
                                      ),
                                    );
                                  }
                                },
                              ),
                            );
                          },
                        ),
                      ),
              ),
              SizedBox(height: MediaQuery.paddingOf(context).bottom),
            ],
          ),
        ),
      ),
    );
  }
}

Future<void> _showPlaceImage(
  BuildContext context,
  CampusPlaceImage image,
  Future<void> Function(Uri originalUrl)? onDownload,
) => showDialog<void>(
  context: context,
  builder: (dialogContext) => Dialog.fullscreen(
    child: SafeArea(
      child: Column(
        children: [
          AppBar(
            title: const Text('Imagem do local'),
            leading: IconButton(
              onPressed: () => Navigator.pop(dialogContext),
              icon: const Icon(Icons.close),
            ),
            actions: [
              if (onDownload != null)
                TextButton.icon(
                  onPressed: () async {
                    try {
                      await onDownload(image.originalUrl);
                      if (dialogContext.mounted) {
                        ScaffoldMessenger.of(dialogContext).showSnackBar(
                          const SnackBar(content: Text('Imagem salva.')),
                        );
                      }
                    } catch (_) {
                      if (dialogContext.mounted) {
                        ScaffoldMessenger.of(dialogContext).showSnackBar(
                          const SnackBar(
                            content: Text('Não foi possível baixar a imagem.'),
                          ),
                        );
                      }
                    }
                  },
                  icon: const Icon(Icons.download_outlined),
                  label: const Text('Baixar imagem'),
                ),
            ],
          ),
          Expanded(
            child: InteractiveViewer(
              minScale: 1,
              maxScale: 6,
              child: Center(child: Image.network(image.originalUrl.toString())),
            ),
          ),
        ],
      ),
    ),
  ),
);

String _formatHeight(double value) => value == value.roundToDouble()
    ? '${value.toInt()} m'
    : '${value.toStringAsFixed(1)} m';

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
    required this.onMeasure,
    required this.onClose,
    this.rewardNotice,
  });

  final CampusPucStop stop;
  final _PucStopView view;
  final bool collected;
  final bool canClaim;

  /// Aviso antes do giro (teto do semestre); some depois da coleta.
  final String? rewardNotice;
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
        claim == null
            ? 'Já coletado'
            : claim.xpGained > 0
            ? 'XP coletado!'
            : 'Visita registrada',
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
    // Painel do foco no totem (`_TotemSpinHint` do PUCMaps), com o estado e
    // o XP do Ajuda-aí. A coleta vem do giro, não de um botão.
    return Material(
      key: const Key('campus-pucstop-card'),
      color: Colors.white,
      elevation: 4,
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
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: CampusMapStyle.brand,
                    ),
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
                      fontWeight: FontWeight.w600,
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
                CampusPucStopState.unavailable => const SizedBox.shrink(),
                CampusPucStopState.collected => _SpinHint(
                  claim != null && claim.xpGained > 0
                      ? 'Gire o topo quando quiser: o XP já é seu.'
                      : 'Já coletado neste semestre. Você ainda pode girar o topo.',
                ),
                _ when !canClaim => Text(
                  'Entre na sua conta para coletar XP.',
                  key: const Key('campus-pucstop-login'),
                  style: text.bodyMedium,
                ),
                _ when view.claiming => const _SpinHint(
                  'Coletando…',
                  busy: true,
                ),
                CampusPucStopState.outOfRange => Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const _SpinHint('Aproxime-se e gire o topo para coletar.'),
                    const SizedBox(height: 6),
                    OutlinedButton.icon(
                      key: const Key('campus-pucstop-measure'),
                      onPressed: view.locating ? null : onMeasure,
                      icon: const Icon(Icons.my_location),
                      label: const Text('Atualizar distância'),
                    ),
                  ],
                ),
                CampusPucStopState.available => Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (rewardNotice != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Text(
                          rewardNotice!,
                          key: const Key('campus-pucstop-notice'),
                          style: text.bodySmall?.copyWith(
                            color: const Color(0xFFB45309),
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    const _SpinHint(
                      'Arraste para os lados e gire o topo para coletar o XP.',
                    ),
                  ],
                ),
              },
            ),
          ],
        ),
      ),
    );
  }
}

/// Instrução do giro (texto do `_TotemSpinHint` do PUCMaps) com ícone.
class _SpinHint extends StatelessWidget {
  const _SpinHint(this.text, {this.busy = false});

  final String text;
  final bool busy;

  @override
  Widget build(BuildContext context) => Row(
    key: const Key('campus-pucstop-hint'),
    children: [
      if (busy)
        const SizedBox(
          width: 18,
          height: 18,
          child: CircularProgressIndicator(strokeWidth: 2),
        )
      else
        const Icon(Icons.swipe, size: 20, color: CampusMapStyle.brand),
      const SizedBox(width: 8),
      Flexible(
        child: Text(
          text,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w500,
            color: Color(0xFF1F1640),
          ),
        ),
      ),
    ],
  );
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
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              claim.xpGained > 0
                  ? '+${claim.xpGained} XP · +${claim.coinsGained} moedas'
                  : 'Sem XP desta vez',
              style: text.titleMedium?.copyWith(
                color: const Color(0xFF15803D),
                fontWeight: FontWeight.w700,
              ),
            ),
            if (claim.capReached)
              Text(
                claim.xpGained > 0
                    ? 'Você chegou ao limite de XP de totens deste semestre.'
                    : 'Limite de XP de totens do semestre já atingido: a visita fica registrada.',
                style: text.bodySmall,
              ),
            if (claim.levelUp && claim.levelNumber != null)
              Text(
                'Subiu para o nível ${claim.levelNumber}'
                '${claim.levelName == null ? '' : ' · ${claim.levelName}'}!',
                key: const Key('campus-pucstop-level-up'),
                style: text.bodyMedium?.copyWith(
                  color: const Color(0xFF6D28D9),
                  fontWeight: FontWeight.w700,
                ),
              ),
          ],
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
