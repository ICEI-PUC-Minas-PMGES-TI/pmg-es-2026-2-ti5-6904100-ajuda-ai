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

  Future<Map<String, dynamic>> registrarVerificacao(
    int id, {
    required List<Map<String, dynamic>> itens,
    required String observacoes,
  }) async => _mapa(
    await _enviar(
      'PUT',
      '/coordenacao/candidaturas/$id/verificacao',
      corpo: {'itens': itens, 'observacoes': observacoes},
      erro: 'Não foi possível registrar a conferência acadêmica.',
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

  Future<Map<String, dynamic>> desvincularCandidatura(int id) async => _mapa(
    await _enviar(
      'POST',
      '/coordenacao/candidaturas/$id/desvincular',
      erro: 'Falha ao desfazer o vínculo',
    ),
  );

  Future<Map<String, dynamic>> revogarAprovacao(
    int id, {
    required String justificativa,
  }) async => _mapa(
    await _enviar(
      'POST',
      '/coordenacao/candidaturas/$id/revogar',
      corpo: {'justificativa': justificativa},
      erro: 'Falha ao revogar a aprovação',
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

  Future<Map<String, dynamic>> rejeitarCadastro(
    int id, {
    required String motivo,
    String? programa,
  }) async => _mapa(
    await _enviar(
      'POST',
      '/coordenacao/cadastros/$id/rejeitar',
      query: {'programa': programa},
      corpo: {'motivo': motivo},
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

  Future<Map<String, dynamic>> gruposMatching(String programa) async => _mapa(
    await _enviar(
      'GET',
      '/coordenacao/matching/grupos',
      query: {'programa': programa},
      erro: 'Falha ao carregar grupos',
    ),
  );

  Future<Map<String, dynamic>> destinosMatching(
    int apadrinhadoId, {
    int? vinculoOrigemId,
  }) async => _mapa(
    await _enviar(
      'GET',
      '/coordenacao/matching/destinos',
      query: {
        'apadrinhadoId': '$apadrinhadoId',
        'vinculoOrigemId': vinculoOrigemId?.toString(),
      },
      erro: 'Falha ao consultar destinos',
    ),
  );

  Future<Map<String, dynamic>> transferirVinculoMatching(
    int id, {
    required int padrinhoDestinoId,
    required String motivo,
    required String operacaoId,
  }) async => _mapa(
    await _enviar(
      'POST',
      '/coordenacao/matching/vinculos/$id/transferir',
      corpo: {
        'padrinhoDestinoId': padrinhoDestinoId,
        'motivo': motivo,
        'operacaoId': operacaoId,
      },
      erro: 'Falha ao transferir apadrinhado',
    ),
  );

  Future<Map<String, dynamic>> matchingVisao(String programa) async => _mapa(
    await _enviar(
      'GET',
      '/coordenacao/matching',
      query: {'programa': programa},
      erro: 'Falha ao carregar o matching',
    ),
  );

  Future<Map<String, dynamic>> matchingConfiguracao(String programa) async =>
      _mapa(
        await _enviar(
          'GET',
          '/coordenacao/matching/config',
          query: {'programa': programa},
          erro: 'Falha ao carregar a configuração de matching',
        ),
      );

  Future<List<Map<String, dynamic>>> criteriosMatching({String? busca}) async =>
      _lista(
        await _enviar(
          'GET',
          '/coordenacao/matching/criterios',
          query: {'busca': busca},
          erro: 'Falha ao carregar o catálogo de critérios',
        ),
      );

  Future<List<Map<String, dynamic>>> criteriosMatchingAtivos() async => _lista(
    await _enviar(
      'GET',
      '/coordenacao/matching/criterios/ativos',
      erro: 'Falha ao carregar os critérios ativos',
    ),
  );

  Future<List<Map<String, dynamic>>> criteriosMatchingSemelhantes(
    String nome, {
    int? excetoId,
  }) async => _lista(
    await _enviar(
      'GET',
      '/coordenacao/matching/criterios/semelhantes',
      query: {'nome': nome, if (excetoId != null) 'excetoId': '$excetoId'},
      erro: 'Falha ao buscar critérios semelhantes',
    ),
  );

  Future<Map<String, dynamic>> criterioMatching(int id) async => _mapa(
    await _enviar(
      'GET',
      '/coordenacao/matching/criterios/$id',
      erro: 'Falha ao carregar o critério',
    ),
  );

  Future<Map<String, dynamic>> criarCriterioMatching(
    Map<String, dynamic> dados,
  ) async => _mapa(
    await _enviar(
      'POST',
      '/coordenacao/matching/criterios',
      corpo: dados,
      erro: 'Falha ao criar o critério',
    ),
  );

  Future<Map<String, dynamic>> atualizarCriterioMatching(
    int id,
    Map<String, dynamic> dados,
  ) async => _mapa(
    await _enviar(
      'PUT',
      '/coordenacao/matching/criterios/$id',
      corpo: dados,
      erro: 'Falha ao atualizar o critério',
    ),
  );

  Future<Map<String, dynamic>> ativarCriterioMatching(
    int id,
    bool ativo,
  ) async => _mapa(
    await _enviar(
      'PATCH',
      '/coordenacao/matching/criterios/$id/ativo',
      corpo: {'ativo': ativo},
      erro: 'Falha ao alterar o status do critério',
    ),
  );

  Future<void> excluirCriterioMatching(int id) async {
    await _enviar(
      'DELETE',
      '/coordenacao/matching/criterios/$id',
      erro: 'Falha ao excluir o critério',
    );
  }

  Future<Map<String, dynamic>> salvarMatchingConfiguracao({
    required String programa,
    int? versaoBase,
    required bool liberado,
    required int capacidadePorPadrinho,
    required int capacidadePorApadrinhado,
    required List<Map<String, dynamic>> criterios,
  }) async => _mapa(
    await _enviar(
      'PUT',
      '/coordenacao/matching/config',
      corpo: {
        'programa': programa,
        'versaoBase': ?versaoBase,
        'liberado': liberado,
        'capacidadePorPadrinho': capacidadePorPadrinho,
        'capacidadePorApadrinhado': capacidadePorApadrinhado,
        'criterios': criterios,
      },
      erro: 'Falha ao salvar a configuração de matching',
    ),
  );

  Future<Map<String, dynamic>> executarMatching(String programa) async => _mapa(
    await _enviar(
      'POST',
      '/coordenacao/matching/executar',
      corpo: {'programa': programa},
      erro: 'Falha ao executar o matching',
    ),
  );

  Future<List<Map<String, dynamic>>> execucoesMatching(String programa) async =>
      _lista(
        await _enviar(
          'GET',
          '/coordenacao/matching/execucoes',
          query: {'programa': programa},
          erro: 'Falha ao carregar as execuções de matching',
        ),
      );

  Future<List<Map<String, dynamic>>> sugestoesMatching(
    String programa, {
    String? status,
  }) async => _lista(
    await _enviar(
      'GET',
      '/coordenacao/matching/sugestoes',
      query: {'programa': programa, 'status': status},
      erro: 'Falha ao carregar as sugestões de matching',
    ),
  );

  Future<Map<String, dynamic>> sugestaoMatching(int id) async => _mapa(
    await _enviar(
      'GET',
      '/coordenacao/matching/sugestao/$id',
      erro: 'Falha ao carregar a comparação',
    ),
  );

  Future<Map<String, dynamic>> aprovarSugestaoMatching(int id) async => _mapa(
    await _enviar(
      'POST',
      '/coordenacao/matching/sugestao/$id/aprovar',
      erro: 'Falha ao aprovar a sugestão',
    ),
  );

  Future<Map<String, dynamic>> recusarSugestaoMatching(
    int id, {
    String? motivo,
  }) async => _mapa(
    await _enviar(
      'POST',
      '/coordenacao/matching/sugestao/$id/recusar',
      corpo: {'motivo': motivo},
      erro: 'Falha ao recusar a sugestão',
    ),
  );

  Future<List<Map<String, dynamic>>> paresRecusadosMatching(
    String programa,
  ) async => _lista(
    await _enviar(
      'GET',
      '/coordenacao/matching/pares/recusados',
      query: {'programa': programa},
      erro: 'Falha ao consultar os pares recusados',
    ),
  );

  Future<Map<String, dynamic>> reconsiderarParMatching(
    int id,
    String justificativa,
  ) async => _mapa(
    await _enviar(
      'POST',
      '/coordenacao/matching/pares/$id/reconsiderar',
      corpo: {'justificativa': justificativa},
      erro: 'Falha ao reconsiderar o par',
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

  Future<Map<String, dynamic>> criarPrograma(
    String? codigo, [
    Map<String, dynamic>? configuracao,
  ]) async => _mapa(
    await _enviar(
      'POST',
      '/coordenacao/programas',
      corpo: {'codigo': ?codigo, ...?configuracao},
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

  Future<Map<String, dynamic>> encerrarInscricoes(String codigo) async => _mapa(
    await _enviar(
      'POST',
      '/coordenacao/programas/encerrar-inscricoes',
      query: {'codigo': codigo},
      erro: 'Falha ao encerrar as inscrições',
    ),
  );

  Future<Map<String, dynamic>> liberarMatching(String codigo) async => _mapa(
    await _enviar(
      'POST',
      '/coordenacao/programas/liberar-matching',
      query: {'codigo': codigo},
      erro: 'Falha ao liberar o matching',
    ),
  );

  Future<Map<String, dynamic>> matching({required String programa}) async =>
      _mapa(
        await _enviar(
          'GET',
          '/coordenacao/matching/pool',
          query: {'programa': programa},
          erro: 'Falha ao carregar o matching',
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

  Future<List<Formulario>> formularios({String? programa}) async {
    final corpo = await _enviar(
      'GET',
      '/coordenacao/formularios',
      query: {'programa': programa},
      erro: 'Falha ao listar formulários',
    );
    return [for (final item in _lista(corpo)) Formulario.fromJson(item)];
  }

  Future<Formulario> excluirFormulario(String tipo, {String? programa}) async =>
      Formulario.fromJson(
        _mapa(
          await _enviar(
            'DELETE',
            '/coordenacao/formularios/$tipo',
            query: {'programa': programa},
            erro: 'Falha ao excluir o rascunho',
          ),
        ),
      );

  Future<Formulario> encerrarFormulario(
    String tipo, {
    String? programa,
  }) async => Formulario.fromJson(
    _mapa(
      await _enviar(
        'POST',
        '/coordenacao/formularios/$tipo/encerrar',
        corpo: {'programa': ?programa},
        erro: 'Falha ao encerrar o formulário',
      ),
    ),
  );

  Future<Formulario> duplicarFormulario(
    String tipo, {
    required String programaOrigem,
    required String programaDestino,
  }) async => Formulario.fromJson(
    _mapa(
      await _enviar(
        'POST',
        '/coordenacao/formularios/$tipo/duplicar',
        corpo: {
          'programaOrigem': programaOrigem,
          'programaDestino': programaDestino,
        },
        erro: 'Falha ao duplicar o formulário',
      ),
    ),
  );

  Future<Map<String, dynamic>> respostasFormulario(
    String tipo, {
    String? programa,
  }) async => _mapa(
    await _enviar(
      'GET',
      '/coordenacao/formularios/$tipo/respostas',
      query: {'programa': programa},
      erro: 'Falha ao carregar respostas',
    ),
  );

  Future<Map<String, dynamic>> respostasPorPergunta(
    String tipo, {
    String? programa,
  }) async => _mapa(
    await _enviar(
      'GET',
      '/coordenacao/formularios/$tipo/respostas/por-pergunta',
      query: {'programa': programa},
      erro: 'Falha ao carregar respostas por pergunta',
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

  /// Totens do mapa (ativos e inativos). Rotas globais, sem programa/ciclo.
  Future<List<Map<String, dynamic>>> pucstops() async => _lista(
    await _enviar(
      'GET',
      '/coordenacao/pucstops',
      erro: 'Falha ao carregar os totens',
    ),
  );

  /// Limite da versão ativa do campus usado pelo seletor de posição.
  /// Economia dos totens: ativos, XP potencial e o teto por aluno e ciclo.
  Future<Map<String, dynamic>> orcamentoPucStops() async => _mapa(
    await _enviar(
      'GET',
      '/coordenacao/pucstops/orcamento',
      erro: 'Falha ao carregar o orçamento dos totens',
    ),
  );

  Future<Map<String, dynamic>> campusPucStops() async => _mapa(
    await _enviar(
      'GET',
      '/coordenacao/pucstops/campus',
      erro: 'Falha ao carregar a área do campus',
    ),
  );

  Future<Map<String, dynamic>> criarPucStop(Map<String, dynamic> dados) async =>
      _mapa(
        await _enviar(
          'POST',
          '/coordenacao/pucstops',
          corpo: dados,
          erro: 'Falha ao criar o totem',
        ),
      );

  Future<Map<String, dynamic>> atualizarPucStop(
    String id,
    Map<String, dynamic> campos,
  ) async => _mapa(
    await _enviar(
      'PATCH',
      '/coordenacao/pucstops/$id',
      corpo: campos,
      erro: 'Falha ao atualizar o totem',
    ),
  );

  Future<Map<String, dynamic>> desativarPucStop(String id) async => _mapa(
    await _enviar(
      'POST',
      '/coordenacao/pucstops/$id/desativar',
      erro: 'Falha ao desativar o totem',
    ),
  );

  Future<Map<String, dynamic>> ativarPucStop(String id) async => _mapa(
    await _enviar(
      'POST',
      '/coordenacao/pucstops/$id/ativar',
      erro: 'Falha ao reativar o totem',
    ),
  );
}
