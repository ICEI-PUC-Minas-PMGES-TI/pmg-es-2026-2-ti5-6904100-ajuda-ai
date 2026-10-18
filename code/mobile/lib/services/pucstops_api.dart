import 'dart:async';
import 'dart:convert';

import 'package:campus_map/campus_map.dart';
import 'package:http/http.dart' as http;

import 'api_config.dart';

/// PucStops pela API do Ajuda-aí: lista pública (`GET /mapa/pucstops`),
/// coletados do usuário (`GET /me/pucstops`) e coleta
/// (`POST /mapa/pucstops/:id/claim`). O servidor decide a coleta (geofence
/// PostGIS); o app só envia a leitura de GPS daquele instante, no corpo do
/// POST, sem gravar nem registrar a posição.
class MapaApiPucStopService implements CampusPucStopService {
  MapaApiPucStopService({
    required this.accessToken,
    http.Client? client,
    this.baseUrl = apiBaseUrl,
    this.timeout = const Duration(seconds: 8),
  }) : _client = client ?? http.Client();

  /// JWT da sessão atual (lido a cada chamada; `null` = sem login).
  final String? Function() accessToken;
  final http.Client _client;
  final String baseUrl;
  final Duration timeout;

  static const _falhas = {
    'ja-coletado': CampusPucStopFailure.alreadyCollected,
    'fora-do-alcance': CampusPucStopFailure.outOfRange,
    'precisao-insuficiente': CampusPucStopFailure.imprecise,
    'inativo': CampusPucStopFailure.unavailable,
  };

  @override
  bool get canClaim => accessToken() != null;

  Map<String, String> _headers({String? token, bool json = false}) => {
    'accept': 'application/json',
    if (json) 'content-type': 'application/json',
    if (token != null) 'authorization': 'Bearer $token',
  };

  @override
  Future<List<CampusPucStop>> list() async {
    final resposta = await executarRequisicao(
      () =>
          _client.get(Uri.parse('$baseUrl/mapa/pucstops'), headers: _headers()),
      erroPadrao: 'Não foi possível carregar os PucStops',
      timeout: timeout,
    );
    final corpo = decodificarJson(resposta);
    if (corpo is! List) throw const FormatException('Resposta inválida.');
    return List.unmodifiable([for (final item in corpo) ?_pucStop(item)]);
  }

  @override
  Future<Set<String>> collected() async {
    final token = accessToken();
    if (token == null) return const {};
    final resposta = await executarRequisicao(
      () => _client.get(
        Uri.parse('$baseUrl/me/pucstops'),
        headers: _headers(token: token),
      ),
      erroPadrao: 'Não foi possível carregar suas coletas',
      timeout: timeout,
    );
    final corpo = decodificarJson(resposta);
    if (corpo is! List) throw const FormatException('Resposta inválida.');
    return {
      for (final item in corpo)
        if (item is Map && item['pucstopId'] is String)
          item['pucstopId'] as String,
    };
  }

  @override
  Future<CampusPucStopClaim> claim(
    String pucStopId,
    CampusUserLocation location,
  ) async {
    final token = accessToken();
    if (token == null) {
      throw const CampusPucStopException(CampusPucStopFailure.unauthenticated);
    }
    final http.Response resposta;
    try {
      resposta = await _client
          .post(
            Uri.parse(
              '$baseUrl/mapa/pucstops/${Uri.encodeComponent(pucStopId)}/claim',
            ),
            headers: _headers(token: token, json: true),
            body: jsonEncode({
              'latitude': location.latitude,
              'longitude': location.longitude,
              'accuracy': location.accuracy,
            }),
          )
          .timeout(timeout);
    } catch (_) {
      throw const CampusPucStopException(CampusPucStopFailure.offline);
    }
    Object? corpo;
    try {
      corpo = decodificarJson(resposta);
    } catch (_) {
      corpo = null;
    }
    final status = resposta.statusCode;
    if (status == 401 || status == 403) {
      throw const CampusPucStopException(CampusPucStopFailure.unauthenticated);
    }
    if (status == 404) {
      throw const CampusPucStopException(CampusPucStopFailure.unavailable);
    }
    if (status == 409 || status == 422) {
      final motivo = corpo is Map ? corpo['motivo'] : null;
      final distancia = corpo is Map ? corpo['distanciaMetros'] : null;
      throw CampusPucStopException(
        _falhas[motivo] ?? CampusPucStopFailure.offline,
        distanceMeters: distancia is num ? distancia.toDouble() : null,
      );
    }
    if (!responseOk(status) || corpo is! Map) {
      throw const CampusPucStopException(CampusPucStopFailure.offline);
    }
    final ganho = corpo['xpGanho'];
    final total = corpo['xpTotal'];
    final distancia = corpo['distanciaMetros'];
    if (corpo['pucstopId'] != pucStopId ||
        ganho is! int ||
        total is! int ||
        distancia is! num) {
      throw const CampusPucStopException(CampusPucStopFailure.offline);
    }
    return CampusPucStopClaim(
      pucStopId: pucStopId,
      xpGained: ganho,
      xpTotal: total,
      distanceMeters: distancia.toDouble(),
    );
  }

  /// Item fora do contrato é ignorado (não derruba a lista inteira).
  static CampusPucStop? _pucStop(Object? item) {
    if (item is! Map) return null;
    final id = item['id'];
    final nome = item['nome'];
    final latitude = item['latitude'];
    final longitude = item['longitude'];
    final raio = item['raioMetros'];
    final xp = item['xp'];
    if (id is! String ||
        nome is! String ||
        latitude is! num ||
        longitude is! num ||
        raio is! num ||
        xp is! int) {
      return null;
    }
    try {
      return CampusPucStop(
        id: id,
        name: nome,
        latitude: latitude.toDouble(),
        longitude: longitude.toDouble(),
        radiusMeters: raio.toDouble(),
        xp: xp,
      );
    } on ArgumentError {
      return null;
    }
  }
}

/// XP global do usuário (`GET /me/xp`).
class XpApi {
  XpApi({http.Client? client, this.baseUrl = apiBaseUrl})
    : _client = client ?? http.Client();

  final http.Client _client;
  final String baseUrl;

  Future<int> saldo(String accessToken) async {
    final resposta = await executarRequisicao(
      () => _client.get(
        Uri.parse('$baseUrl/me/xp'),
        headers: {
          'accept': 'application/json',
          'authorization': 'Bearer $accessToken',
        },
      ),
      erroPadrao: 'Não foi possível carregar seu XP',
      timeout: const Duration(seconds: 5),
    );
    final corpo = decodificarJson(resposta);
    final saldo = corpo is Map ? corpo['saldo'] : null;
    if (saldo is! int || saldo < 0) {
      throw const FormatException('Resposta inválida.');
    }
    return saldo;
  }
}
