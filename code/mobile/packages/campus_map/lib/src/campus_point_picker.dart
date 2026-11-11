import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart' hide Size;

import 'campus_data_source.dart';
import 'campus_map_config.dart';
import 'campus_map_defaults.dart';
import 'campus_map_layer_ids.dart';
import 'campus_map_renderer.dart';

/// Coordenada WGS84 escolhida no mapa. A serialização da API usa longitude
/// antes de latitude apenas dentro do GeoJSON/PostGIS.
class CampusMapPoint {
  const CampusMapPoint({required this.latitude, required this.longitude});

  final double latitude;
  final double longitude;
}

/// Seletor compacto usado pelos formulários administrativos do mapa.
/// Reaproveita o mesmo style, snapshot e renderer 2D do mapa dos alunos.
class CampusPointPicker extends StatefulWidget {
  const CampusPointPicker({
    super.key,
    required this.config,
    required this.onChanged,
    this.selected,
    this.campus,
    this.others = const [],
    this.dataSource = const LocalCampusDataSource(),
    this.centerPin = false,
    this.enable3d = false,
    this.showInstructions = true,
  });

  final CampusMapConfig config;
  final CampusMapPoint? selected;
  final ValueChanged<CampusMapPoint> onChanged;
  final Map<String, dynamic>? campus;
  final List<CampusMapPoint> others;
  final CampusDataSource dataSource;
  final bool centerPin;
  final bool enable3d;
  final bool showInstructions;

  @override
  State<CampusPointPicker> createState() => _CampusPointPickerState();
}

class _CampusPointPickerState extends State<CampusPointPicker> {
  static const _source = 'campus-point-picker';
  static const _boundarySource = 'campus-point-picker-boundary';
  static const _boundaryFill = 'campus-point-picker-boundary-fill';
  static const _boundaryLine = 'campus-point-picker-boundary-line';
  static const _others = 'campus-point-picker-others';
  static const _selected = 'campus-point-picker-selected';
  static const _buildings3d = 'campus-point-picker-buildings-3d';

  MapboxMap? _map;
  bool _styleReady = false;
  bool _loadError = false;
  String? _configurationError;
  late final CameraViewportState _initialViewport;
  Timer? _cameraSettle;
  Future<void> _paintQueue = Future<void>.value();

  @override
  void initState() {
    super.initState();
    final center =
        widget.selected ??
        CampusMapPoint(
          latitude:
              (widget.campus?['centro']?['latitude'] as num?)?.toDouble() ??
              CampusMapDefaults.latitude,
          longitude:
              (widget.campus?['centro']?['longitude'] as num?)?.toDouble() ??
              CampusMapDefaults.longitude,
        );
    _initialViewport = CameraViewportState(
      center: Point(coordinates: Position(center.longitude, center.latitude)),
      zoom: CampusMapDefaults.zoom,
      pitch: widget.enable3d ? CampusMapDefaults.pitch3d : 0,
      bearing: widget.enable3d ? -12 : 0,
    );
    _configure();
  }

  @override
  void dispose() {
    _cameraSettle?.cancel();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant CampusPointPicker oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.selected != widget.selected ||
        oldWidget.others != widget.others ||
        oldWidget.campus != widget.campus) {
      unawaited(_paintPoints());
    }
  }

  void _configure() {
    final token = widget.config.mapboxAccessToken.trim();
    if (token.isEmpty || !token.startsWith('pk.')) {
      _configurationError =
          'Mapa indisponível. Configure um MAPBOX_ACCESS_TOKEN público.';
      return;
    }
    if (kIsWeb ||
        (defaultTargetPlatform != TargetPlatform.android &&
            defaultTargetPlatform != TargetPlatform.iOS)) {
      _configurationError = 'Seleção no mapa disponível no Android e iOS.';
      return;
    }
    MapboxOptions.setAccessToken(token);
  }

  Map<String, dynamic> get _pointsGeoJson => {
    'type': 'FeatureCollection',
    'features': [
      for (final point in widget.others)
        {
          'type': 'Feature',
          'geometry': {
            'type': 'Point',
            'coordinates': [point.longitude, point.latitude],
          },
          'properties': {'selected': false},
        },
      if (!widget.centerPin)
        if (widget.selected case final point?)
          {
            'type': 'Feature',
            'geometry': {
              'type': 'Point',
              'coordinates': [point.longitude, point.latitude],
            },
            'properties': {'selected': true},
          },
    ],
  };

  Future<void> _paintPoints() {
    _paintQueue = _paintQueue.then((_) async {
      try {
        await _paintPointsNow();
      } catch (_) {
        if (mounted) setState(() => _loadError = true);
      }
    });
    return _paintQueue;
  }

  Future<void> _paintPointsNow() async {
    final map = _map;
    if (map == null || !_styleReady) return;
    final style = map.style;
    final data = _pointsGeoJson;
    if (await style.styleSourceExists(_source)) {
      await style.setStyleSourceProperty(_source, 'data', jsonEncode(data));
    } else {
      await style.addStyleSource(
        _source,
        jsonEncode({'type': 'geojson', 'data': data}),
      );
    }
    final layers = <Map<String, dynamic>>[
      {
        'id': _others,
        'type': 'circle',
        'source': _source,
        'slot': 'top',
        'filter': [
          '==',
          ['get', 'selected'],
          false,
        ],
        'paint': {
          'circle-radius': 5,
          'circle-color': '#7C3AED',
          'circle-opacity': .6,
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 2,
        },
      },
      {
        'id': _selected,
        'type': 'circle',
        'source': _source,
        'slot': 'top',
        'filter': [
          '==',
          ['get', 'selected'],
          true,
        ],
        'paint': {
          'circle-radius': 9,
          'circle-color': '#F59E0B',
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 3,
        },
      },
    ];
    for (final layer in layers) {
      if (!await style.styleLayerExists(layer['id'] as String)) {
        await style.addStyleLayer(jsonEncode(layer), null);
      }
    }

    final limite = widget.campus?['limite'];
    if (limite is Map) {
      final boundary = {
        'type': 'FeatureCollection',
        'features': [
          {'type': 'Feature', 'geometry': limite, 'properties': {}},
        ],
      };
      if (await style.styleSourceExists(_boundarySource)) {
        await style.setStyleSourceProperty(
          _boundarySource,
          'data',
          jsonEncode(boundary),
        );
      } else {
        await style.addStyleSource(
          _boundarySource,
          jsonEncode({'type': 'geojson', 'data': boundary}),
        );
      }
      final boundaryLayers = <Map<String, dynamic>>[
        {
          'id': _boundaryFill,
          'type': 'fill',
          'source': _boundarySource,
          'slot': 'middle',
          'paint': {'fill-color': '#7C3AED', 'fill-opacity': .08},
        },
        {
          'id': _boundaryLine,
          'type': 'line',
          'source': _boundarySource,
          'slot': 'top',
          'paint': {
            'line-color': '#7C3AED',
            'line-width': 2,
            'line-dasharray': [2, 2],
          },
        },
      ];
      for (final layer in boundaryLayers) {
        if (!await style.styleLayerExists(layer['id'] as String)) {
          await style.addStyleLayer(jsonEncode(layer), null);
        }
      }
    }
  }

  Future<void> _render() async {
    final map = _map;
    if (map == null || !_styleReady) return;
    try {
      final snapshot = await widget.dataSource.load();
      if (!mounted || !identical(map, _map)) return;
      await CampusMapRenderer(map.style).render(
        snapshot,
        isActive: () => mounted && identical(map, _map) && _styleReady,
      );
      if (widget.enable3d && !await map.style.styleLayerExists(_buildings3d)) {
        await map.style.addStyleLayer(
          jsonEncode({
            'id': _buildings3d,
            'type': 'fill-extrusion',
            'source': CampusMapLayerIds.footprintsSource,
            'slot': 'middle',
            'filter': ['has', 'height'],
            'paint': {
              'fill-extrusion-color': [
                'interpolate',
                ['linear'],
                [
                  'coalesce',
                  ['get', 'height'],
                  3,
                ],
                3,
                '#B9A5F5',
                12,
                '#5B21B6',
              ],
              'fill-extrusion-height': [
                'coalesce',
                ['get', 'height'],
                3,
              ],
              'fill-extrusion-base': [
                'coalesce',
                ['get', 'minHeight'],
                0,
              ],
              'fill-extrusion-opacity': .86,
            },
          }),
          null,
        );
      }
    } catch (_) {
      if (mounted) setState(() => _loadError = true);
    }
    await _paintPoints();
  }

  @override
  Widget build(BuildContext context) {
    if (_configurationError case final message?) {
      return _PickerStatus(message: message);
    }
    return Stack(
      fit: StackFit.expand,
      children: [
        MapWidget(
          styleUri: widget.config.effectiveStyleUri,
          viewport: _initialViewport,
          onMapCreated: (map) {
            _map = map;
            if (!widget.centerPin) {
              map.addInteraction(
                TapInteraction.onMap((context) {
                  final coordinates = context.point.coordinates;
                  widget.onChanged(
                    CampusMapPoint(
                      latitude: coordinates.lat.toDouble(),
                      longitude: coordinates.lng.toDouble(),
                    ),
                  );
                }),
                interactionID: 'campus-point-picker-tap',
              );
            }
          },
          onStyleLoadedListener: (_) {
            _styleReady = true;
            unawaited(_render());
          },
          onMapLoadErrorListener: (_) {
            if (mounted) setState(() => _loadError = true);
          },
          onCameraChangeListener: widget.centerPin
              ? (event) {
                  final coordinates = event.cameraState.center.coordinates;
                  final point = CampusMapPoint(
                    latitude: coordinates.lat.toDouble(),
                    longitude: coordinates.lng.toDouble(),
                  );
                  _cameraSettle?.cancel();
                  _cameraSettle = Timer(const Duration(milliseconds: 120), () {
                    if (mounted) widget.onChanged(point);
                  });
                }
              : null,
        ),
        if (_loadError)
          const Positioned(
            left: 8,
            right: 8,
            top: 8,
            child: Material(
              color: Color(0xEFFFFFFF),
              borderRadius: BorderRadius.all(Radius.circular(8)),
              child: Padding(
                padding: EdgeInsets.all(8),
                child: Text(
                  'Não foi possível carregar todos os dados do mapa.',
                ),
              ),
            ),
          ),
        if (widget.centerPin)
          Center(
            child: IgnorePointer(
              child: Transform.translate(
                offset: const Offset(0, -24),
                child: const Icon(
                  Icons.location_on,
                  key: Key('campus-point-picker-center-pin'),
                  size: 52,
                  color: Color(0xFFF59E0B),
                  shadows: [Shadow(color: Colors.white, blurRadius: 5)],
                ),
              ),
            ),
          ),
        if (widget.showInstructions)
          Positioned(
            left: 10,
            right: 10,
            bottom: 10,
            child: IgnorePointer(
              child: Material(
                color: Color(0xEFFFFFFF),
                borderRadius: BorderRadius.all(Radius.circular(8)),
                child: Padding(
                  padding: EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                  child: Text(
                    widget.centerPin
                        ? 'Mova o mapa para posicionar o pin'
                        : 'Toque no mapa para posicionar o marcador',
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _PickerStatus extends StatelessWidget {
  const _PickerStatus({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: const Color(0xFFF3F0FA),
    child: Center(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Text(message, textAlign: TextAlign.center),
      ),
    ),
  );
}
