import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/formulario.dart';
import 'api_config.dart';

/// Rotas `/coordenacao/*` (Bearer do login demo).
///
/// Erros: [ApiException] com a mensagem do backend (`{message}`) ou
/// [ApiIndisponivelException] quando a API não responde.
class CoordenacaoApi {
  CoordenacaoApi({
    required this.accessToken,
    http.Client? client,
    this.baseUrl = apiBaseUrl,
  }) : _client = client ?? http.Client();

  final String accessToken;
  final http.Client _client;
  final String baseUrl;

  Map<String, String> get _headers => {
    'accept': 'application/json',
    'authorization': 'Bearer $accessToken',
  };

  Uri _uri(String caminho, [Map<String, String?> query = const {}]) {
    final filtrado = {
      for (final MapEntry(:key, :value) in query.entries)
        if (value != null && value.isNotEmpty) key: value,
    };
    return Uri.parse('$baseUrl$caminho')
        .replace(queryParameters: filtrado.isEmpty ? null : filtrado);
  }

  Future<dynamic> _enviar(
    String metodo,
    String caminho, {
    Map<String, String?> query = const {},
    Object? corpo,
    required String erro,
  }) async {
    final uri = _uri(caminho, query);
    final headers = {
      ..._headers,
      if (corpo != null) 'content-type': 'application/json',
    };
    final body = corpo == null ? null : jsonEncode(corpo);
    final resposta = await executarRequisicao(
      () => switch (metodo) {
        'POST' => _client.post(uri, headers: headers, body: body),
        'PATCH' => _client.patch(uri, headers: headers, body: body),
        'PUT' => _client.put(uri, headers: headers, body: body),
        'DELETE' => _client.delete(uri, headers: headers, body: body),
        _ => _client.get(uri, headers: headers),
      },
      erroPadrao: erro,
    );
    return decodificarJson(resposta);
  }

  static Map<String, dynamic> _mapa(dynamic corpo) =>
      corpo is Map ? Map<String, dynamic>.from(corpo) : <String, dynamic>{};

  static List<Map<String, dynamic>> _lista(dynamic corpo) => corpo is List
      ? corpo
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList()
      : const [];

  Future<Map<String, dynamic>> dashboard([String? programa]) async => _mapa(
    await _enviar(
      'GET',
      '/coordenacao/dashboard',
      query: {'programa': programa},
      erro: 'Falha ao carregar dashboard',
    ),
  );

  Future<List<Map<String, dynamic>>> candidaturas({
    String? programa,
    String? status,
  }) async => _lista(
    await _enviar(
      'GET',
      '/coordenacao/candidaturas',
      query: {'programa': programa, 'status': status},
      erro: 'Falha ao carregar candidaturas',
    ),
  );

  /// Detalhe com respostas, observações, critérios e histórico.
  Future<Map<String, dynamic>> candidatura(int id) async => _mapa(
    await _enviar(
      'GET',
      '/coordenacao/candidaturas/$id',
      erro: 'Falha ao carregar a candidatura',
    ),
  );

  Future<Map<String, dynamic>> atualizarCandidatura(
    int id, {
    String? status,
    String? observacoes,
  }) async => _mapa(
    await _enviar(
      'PATCH',
      '/coordenacao/candidaturas/$id',
      corpo: {'status': ?status, 'observacoes': ?observacoes},
      erro: 'Falha ao atualizar a candidatura',
    ),
  );

  Future<Map<String, dynamic>> aprovarCandidatura(int id) async => _mapa(
    await _enviar(
      'POST',
      '/coordenacao/candidaturas/$id/aprovar',
      erro: 'Falha ao aprovar a candidatura',
    ),
  );

  Future<Map<String, dynamic>> rejeitarCandidatura(
    int id, {
    String? justificativa,
  }) async => _mapa(
    await _enviar(
      'POST',
      '/coordenacao/candidaturas/$id/rejeitar',
      corpo: {'justificativa': justificativa},
      erro: 'Falha ao rejeitar a candidatura',
    ),
  );

  /// Solicitações de cadastro (`status` = pendente | aprovado | rejeitado;
  /// null = todos). Mesmos endpoints do web.
  Future<List<Map<String, dynamic>>> cadastros({
    String? status,
    String? programa,
  }) async => _lista(
    await _enviar(
      'GET',
      '/coordenacao/cadastros',
      query: {'status': status, 'programa': programa},
      erro: 'Falha ao carregar os cadastros',
    ),
  );

  Future<Map<String, dynamic>> cadastro(int id, {String? programa}) async =>
      _mapa(
        await _enviar(
          'GET',
          '/coordenacao/cadastros/$id',
          query: {'programa': programa},
          erro: 'Falha ao carregar o cadastro',
        ),
      );

  Future<Map<String, dynamic>> aprovarCadastro(
    int id, {
    String? programa,
  }) async => _mapa(
    await _enviar(
      'POST',
      '/coordenacao/cadastros/$id/aprovar',
      query: {'programa': programa},
      erro: 'Falha ao aprovar o cadastro',
    ),
  );

  /// `motivo` vazio = sem motivo (o aluno vê o motivo quando houver).
  Future<Map<String, dynamic>> rejeitarCadastro(
    int id, {
    String? motivo,
    String? programa,
  }) async => _mapa(
    await _enviar(
      'POST',
      '/coordenacao/cadastros/$id/rejeitar',
      query: {'programa': programa},
      corpo: {if (motivo != null && motivo.isNotEmpty) 'motivo': motivo},
      erro: 'Falha ao rejeitar o cadastro',
    ),
  );

  /// Ações em massa: `acao` = aprovar | rejeitar | em_analise.
  /// Retorna `{acao, sucesso, falhas:[{id, ok, erro}]}`.
  Future<Map<String, dynamic>> acoesEmMassa({
    required List<int> ids,
    required String acao,
    String? justificativa,
  }) async => _mapa(
    await _enviar(
      'POST',
      '/coordenacao/candidaturas/acoes',
      corpo: {'ids': ids, 'acao': acao, 'justificativa': ?justificativa},
      erro: 'Falha ao aplicar a ação',
    ),
  );

  Future<List<Map<String, dynamic>>> usuarios({
    String? programa,
    String? papel,
  }) async => _lista(
    await _enviar(
      'GET',
      '/coordenacao/usuarios',
      query: {'programa': programa, 'papel': papel},
      erro: 'Falha ao carregar usuários',
    ),
  );

  /// Define o padrinho de um apadrinhado (ids de participação).
  Future<Map<String, dynamic>> criarVinculo({
    required int apadrinhadoId,
    required int padrinhoId,
  }) async => _mapa(
    await _enviar(
      'POST',
      '/coordenacao/vinculos',
      corpo: {'apadrinhadoId': apadrinhadoId, 'padrinhoId': padrinhoId},
      erro: 'Falha ao definir o padrinho',
    ),
  );

  Future<List<Map<String, dynamic>>> programas() async => _lista(
    await _enviar(
      'GET',
      '/coordenacao/programas',
      erro: 'Falha ao carregar programas',
    ),
  );

  Future<void> excluirPrograma(String codigo, String confirmacao) async {
    await _enviar(
      'DELETE',
      '/coordenacao/programas',
      query: {'codigo': codigo},
      corpo: {'confirmacao': confirmacao},
      erro: 'Não foi possível excluir o programa',
    );
  }

  Future<Map<String, dynamic>> criarPrograma([String? codigo]) async => _mapa(
    await _enviar(
      'POST',
      '/coordenacao/programas',
      corpo: {'codigo': ?codigo},
      erro: 'Falha ao abrir ciclo',
    ),
  );

  Future<Map<String, dynamic>> atualizarPrograma(
    String codigo,
    Map<String, dynamic> campos,
  ) async => _mapa(
    await _enviar(
      'PATCH',
      '/coordenacao/programas',
      query: {'codigo': codigo},
      corpo: campos,
      erro: 'Falha ao atualizar o programa',
    ),
  );

  /// Formulário para edição (`padrinho` | `apadrinhado`), mesmo não publicado.
  Future<Formulario> formulario(String tipo, {String? programa}) async =>
      Formulario.fromJson(
        _mapa(
          await _enviar(
            'GET',
            '/coordenacao/formularios/$tipo',
            query: {'programa': programa},
            erro: 'Falha ao carregar o formulário',
          ),
        ),
      );

  Future<Formulario> salvarFormulario(
    String tipo, {
    String? programa,
    required bool publicado,
    required List<PerguntaFormulario> perguntas,
  }) async => Formulario.fromJson(
    _mapa(
      await _enviar(
        'PUT',
        '/coordenacao/formularios/$tipo',
        corpo: {
          'programa': ?programa,
          'publicado': publicado,
          'perguntas': [for (final pergunta in perguntas) pergunta.toJson()],
        },
        erro: 'Falha ao salvar o formulário',
      ),
    ),
  );

  /// `publico` = todos | padrinhos | apadrinhados.
  Future<Map<String, dynamic>> criarComunicado({
    required String titulo,
    required String descricao,
    required String publico,
  }) async => _mapa(
    await _enviar(
      'POST',
      '/coordenacao/comunicados',
      corpo: {'titulo': titulo, 'descricao': descricao, 'publico': publico},
      erro: 'Falha ao publicar o comunicado',
    ),
  );
}
