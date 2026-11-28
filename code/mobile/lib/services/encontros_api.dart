import 'dart:convert';

import 'package:campus_map/campus_map.dart';
import 'package:http/http.dart' as http;

import 'api_config.dart';

class ConviteEncontro {
  ConviteEncontro.fromJson(Map<String, dynamic> json)
    : usuarioId = json['usuarioId'] as int,
      nome = json['nome'] as String,
      resposta = json['resposta'] as String,
      presente = json['presenteEm'] != null;

  final int usuarioId;
  final String nome;
  final String resposta;
  final bool presente;

  String get rotulo => switch (resposta) {
    'aceito' => 'Aceito',
    'recusado' => 'Recusado',
    _ => 'Pendente',
  };
}

class Encontro {
  Encontro.fromJson(Map<String, dynamic> json)
    : id = json['id'] as String,
      organizador = json['organizador']['nome'] as String,
      organizadorPresente = json['organizador']['presenteEm'] != null,
      localId = json['local']['pucstopId'] as String,
      local = json['local']['nome'] as String,
      localAtivo = json['local']['ativo'] == true,
      inicio = DateTime.parse(json['inicio'] as String),
      fim = DateTime.parse(json['fim'] as String),
      checkinAbre = DateTime.parse(json['checkinAbre'] as String),
      checkinFecha = DateTime.parse(json['checkinFecha'] as String),
      descricao = json['descricao'] as String?,
      cancelado = json['status'] == 'cancelado',
      realizado = json['realizado'] == true,
      souOrganizador = json['souOrganizador'] == true,
      podeConfirmar = json['podeConfirmarPresenca'] == true,
      podeResponder = json['podeResponder'] == true,
      podeRemarcar = json['podeRemarcar'] == true,
      meuConvite = json['meuConvite'] is Map<String, dynamic>
          ? ConviteEncontro.fromJson(json['meuConvite'] as Map<String, dynamic>)
          : null,
      convites = (json['convites'] as List)
          .cast<Map<String, dynamic>>()
          .map(ConviteEncontro.fromJson)
          .toList(growable: false);

  final String id;
  final String organizador;
  final bool organizadorPresente;
  final String localId;
  final String local;
  final bool localAtivo;
  final DateTime inicio;
  final DateTime fim;
  final DateTime checkinAbre;
  final DateTime checkinFecha;
  final String? descricao;
  final bool cancelado;
  final bool realizado;
  final bool souOrganizador;
  final bool podeConfirmar;
  final bool podeResponder;
  final bool podeRemarcar;
  final ConviteEncontro? meuConvite;
  final List<ConviteEncontro> convites;

  bool get presente =>
      souOrganizador ? organizadorPresente : meuConvite?.presente == true;

  bool janelaAberta(DateTime agora) =>
      !agora.isBefore(checkinAbre) && !agora.isAfter(checkinFecha);
}

class EncontrosApi {
  EncontrosApi({http.Client? client, this.baseUrl = apiBaseUrl})
    : _client = client ?? http.Client();

  final http.Client _client;
  final String baseUrl;

  Future<dynamic> _pedir(
    String token,
    String metodo,
    String caminho, [
    Map<String, Object?>? dados,
  ]) async {
    final pedido = http.Request(
      metodo,
      Uri.parse('$baseUrl/me/encontros$caminho'),
    );
    pedido.headers.addAll({
      'accept': 'application/json',
      'authorization': 'Bearer $token',
      if (dados != null) 'content-type': 'application/json',
    });
    if (dados != null) pedido.body = jsonEncode(dados);
    final resposta = await executarRequisicao(
      () async => http.Response.fromStream(await _client.send(pedido)),
      erroPadrao: 'Não foi possível acessar os encontros',
    );
    return decodificarJson(resposta);
  }

  String _encontro(String id) => '/${Uri.encodeComponent(id)}';

  Future<List<Encontro>> listar(
    String token, {
    required bool anteriores,
  }) async {
    final json = await _pedir(
      token,
      'GET',
      anteriores ? '?quando=anteriores' : '?quando=futuros',
    );
    return (json as List)
        .cast<Map<String, dynamic>>()
        .map(Encontro.fromJson)
        .toList();
  }

  Future<List<({int id, String nome})>> apadrinhados(String token) async {
    final json = await _pedir(token, 'GET', '/apadrinhados');
    return [
      for (final item in json as List)
        (id: item['id'] as int, nome: item['nome'] as String),
    ];
  }

  Future<Encontro> detalhe(String token, String id) async => Encontro.fromJson(
    await _pedir(token, 'GET', _encontro(id)) as Map<String, dynamic>,
  );

  Future<Encontro> salvar(
    String token,
    Map<String, Object?> dados, {
    String? id,
  }) async => Encontro.fromJson(
    await _pedir(
      token,
      id == null ? 'POST' : 'PATCH',
      id == null ? '' : _encontro(id),
      dados,
    ) as Map<String, dynamic>,
  );

  Future<Encontro> responder(String token, String id, String resposta) async =>
      Encontro.fromJson(
        await _pedir(token, 'POST', '${_encontro(id)}/responder', {
          'resposta': resposta,
        }) as Map<String, dynamic>,
      );

  Future<Encontro> cancelar(String token, String id) async => Encontro.fromJson(
    await _pedir(token, 'POST', '${_encontro(id)}/cancelar')
        as Map<String, dynamic>,
  );

  Future<int> confirmar(
    String token,
    String id,
    CampusUserLocation? posicao,
  ) async {
    final json = await _pedir(token, 'POST', '${_encontro(id)}/presenca', {
      if (posicao != null) ...{
        'latitude': posicao.latitude,
        'longitude': posicao.longitude,
        'accuracy': posicao.accuracy,
      },
    });
    return json['xpGanho'] as int;
  }
}
