import 'package:flutter/material.dart';

import 'campus_location_service.dart';
import 'campus_map_controller.dart';
import 'campus_place.dart';

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

  @override
  void dispose() {
    _request++;
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
    setState(() {
      _results = const [];
      _expanded = false;
    });
  }

  Future<void> _select(CampusPlace place) async {
    _request++;
    _focus.unfocus();
    _text.text = place.displayName;
    setState(() => _expanded = false);
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

  Future<void> _locate() async {
    _focus.unfocus();
    setState(() {
      _locating = true;
      _expanded = false;
    });
    final result = await widget.controller.moveToUser();
    if (!mounted) return;
    setState(() => _locating = false);
    switch (result.status) {
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
