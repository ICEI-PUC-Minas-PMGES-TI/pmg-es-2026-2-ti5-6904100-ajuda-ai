import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

import 'campus_map_config.dart';
import 'campus_map_defaults.dart';

/// Mapa anônimo do campus. O token deve ser público e fornecido externamente.
class CampusMapView extends StatefulWidget {
  const CampusMapView({super.key, required this.config});

  final CampusMapConfig config;

  @override
  State<CampusMapView> createState() => _CampusMapViewState();
}

class _CampusMapViewState extends State<CampusMapView> {
  String? _configurationError;
  bool _loadError = false;
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    _configure();
  }

  @override
  void didUpdateWidget(covariant CampusMapView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.config.mapboxAccessToken != widget.config.mapboxAccessToken ||
        oldWidget.config.effectiveStyleUri != widget.config.effectiveStyleUri) {
      _generation++;
      _configure();
    }
  }

  void _configure() {
    _loadError = false;
    final token = widget.config.mapboxAccessToken.trim();
    if (token.isEmpty) {
      _configurationError =
          'Mapa indisponível neste ambiente.\n'
          'Configure MAPBOX_ACCESS_TOKEN para carregar o mapa.';
      return;
    }
    if (!token.startsWith('pk.')) {
      _configurationError =
          'Mapa indisponível neste ambiente.\n'
          'Configure um token público do Mapbox em MAPBOX_ACCESS_TOKEN.';
      return;
    }
    if (kIsWeb ||
        (defaultTargetPlatform != TargetPlatform.android &&
            defaultTargetPlatform != TargetPlatform.iOS)) {
      _configurationError = 'Mapa disponível apenas no Android e iOS.';
      return;
    }
    _configurationError = null;
    // A API oficial mantém o token no SDK; não o copiamos para estado global.
    // Executado antes do MapWidget, somente ao montar ou mudar a configuração.
    MapboxOptions.setAccessToken(token);
  }

  @override
  Widget build(BuildContext context) {
    if (_configurationError case final message?) {
      return _MapStatus(message: message);
    }

    final generation = _generation;
    return SizedBox.expand(
      child: Stack(
        fit: StackFit.expand,
        children: [
          MapWidget(
            key: ValueKey(generation),
            styleUri: widget.config.effectiveStyleUri,
            viewport: CameraViewportState(
              center: Point(
                coordinates: Position(
                  CampusMapDefaults.longitude,
                  CampusMapDefaults.latitude,
                ),
              ),
              zoom: CampusMapDefaults.zoom,
              pitch: CampusMapDefaults.pitch,
              bearing: CampusMapDefaults.bearing,
            ),
            onMapLoadErrorListener: (_) {
              if (!mounted || generation != _generation || _loadError) return;
              // Não exibir/logar mensagens do SDK: podem conter URLs e tokens.
              setState(() => _loadError = true);
            },
            onMapLoadedListener: (_) {
              if (!mounted || generation != _generation || !_loadError) return;
              setState(() => _loadError = false);
            },
          ),
          if (_loadError)
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: Material(
                color: Theme.of(context).colorScheme.surface,
                child: const Padding(
                  padding: EdgeInsets.all(16),
                  child: Text(
                    'Não foi possível carregar o mapa.\n'
                    'Verifique a conexão e a configuração do Mapbox.',
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _MapStatus extends StatelessWidget {
  const _MapStatus({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return SizedBox.expand(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            message,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ),
      ),
    );
  }
}
