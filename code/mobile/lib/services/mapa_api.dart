import 'package:campus_map/campus_map.dart';
import 'package:http/http.dart' as http;

import 'api_config.dart';

/// Busca de lugares pela API pública do mapa (`GET /mapa/busca`,
/// `GET /mapa/predios/:id`). Sem login: são dados abertos do campus.
///
/// Erro de rede ou de servidor é lançado: o `campus_map` então usa o
/// snapshot local (`FallbackCampusPlaceRepository`). Os ids são as chaves
/// estáveis do campus (`P01_R4751608`), as mesmas do snapshot.
class MapaApiPlaceRepository implements CampusPlaceRepository {
  MapaApiPlaceRepository({
    http.Client? client,
    this.baseUrl = apiBaseUrl,
    this.timeout = const Duration(seconds: 3),
  }) : _client = client ?? http.Client();

  final http.Client _client;
  final String baseUrl;

  /// Curto: com a API fora do ar a busca local responde logo.
  final Duration timeout;

  static const _headers = {'accept': 'application/json'};

  @override
  Future<List<CampusPlace>> search(String query) async {
    if (query.trim().isEmpty) return const [];
    final uri = Uri.parse('$baseUrl/mapa/busca').replace(
      queryParameters: {
        'q': query,
        'limit': '${LocalCampusPlaceRepository.resultLimit}',
      },
    );
    final resposta = await executarRequisicao(
      () => _client.get(uri, headers: _headers),
      erroPadrao: 'Não foi possível buscar locais',
      timeout: timeout,
    );
    final corpo = decodificarJson(resposta);
    if (corpo is! List) throw const FormatException('Resposta inválida.');
    return List.unmodifiable([for (final item in corpo) ?_lugar(item)]);
  }

  @override
  Future<CampusPlace?> findById(String id) async {
    final uri = Uri.parse('$baseUrl/mapa/predios/${Uri.encodeComponent(id)}');
    try {
      final resposta = await executarRequisicao(
        () => _client.get(uri, headers: _headers),
        erroPadrao: 'Não foi possível carregar o local',
        timeout: timeout,
      );
      return _lugar(decodificarJson(resposta));
    } on ApiException catch (erro) {
      if (erro.statusCode == 404) return null;
      rethrow;
    }
  }

  /// Item fora do contrato é ignorado (não derruba a busca inteira).
  static CampusPlace? _lugar(Object? item) {
    if (item is! Map) return null;
    final id = item['id'];
    final latitude = item['latitude'];
    final longitude = item['longitude'];
    if (id is! String || latitude is! num || longitude is! num) return null;
    try {
      return CampusPlace(
        id: id,
        name: item['nome'] as String?,
        code: item['codigo'] as String?,
        type: item['categoria'] as String?,
        center: [longitude.toDouble(), latitude.toDouble()],
      );
    } on Object {
      return null;
    }
  }
}
