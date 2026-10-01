import 'dart:convert';

import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/services/participacoes_api.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// API do aluno em memória para os testes de widget.
///
/// Guarda cada requisição em [requisicoes] para verificar o corpo enviado.
class ApiFalsa {
  ApiFalsa({
    this.situacao,
    this.formularios = const {},
    List<Map<String, dynamic>>? avisos,
    this.erroEnvio,
  }) : avisos = avisos ?? [];

  /// Corpo de `GET /participacoes/situacao` (null → 404, mantém estado local).
  Map<String, dynamic>? situacao;

  /// `tipo → corpo` de `GET /formularios/:tipo`.
  final Map<String, Map<String, dynamic>> formularios;
  final List<Map<String, dynamic>> avisos;

  /// Se definido, os POSTs de cadastro respondem 400 com esta mensagem.
  String? erroEnvio;

  final List<http.Request> requisicoes = [];

  List<http.Request> posts(String rota) => requisicoes
      .where((r) => r.method == 'POST' && r.url.path.endsWith(rota))
      .toList();

  Map<String, dynamic> corpo(http.Request requisicao) =>
      jsonDecode(requisicao.body) as Map<String, dynamic>;

  http.Response _json(Object corpo, [int status = 200]) => http.Response(
    jsonEncode(corpo),
    status,
    headers: {'content-type': 'application/json; charset=utf-8'},
  );

  late final MockClient client = MockClient((requisicao) async {
    requisicoes.add(requisicao);
    final caminho = requisicao.url.path;
    if (requisicao.method == 'POST' &&
        (caminho.endsWith('/candidatura-padrinho') ||
            caminho.endsWith('/cadastro-apadrinhado'))) {
      if (erroEnvio != null) {
        return _json({
          'message': erroEnvio,
          'error': 'Bad Request',
          'statusCode': 400,
        }, 400);
      }
      final enviado = jsonDecode(requisicao.body) as Map<String, dynamic>;
      final padrinho = caminho.endsWith('/candidatura-padrinho');
      return _json({
        'id': 99,
        'usuarioId': enviado['usuarioId'],
        'programa': '2026/2',
        'papel': padrinho ? 'candidato' : 'apadrinhado',
        'status': padrinho ? 'pendente' : 'em_andamento',
        'grupo': null,
        'apadrinhados': 0,
        'criadoEm': '2026-09-22T14:32:00.000Z',
        'atualizadoEm': '2026-09-22T14:32:00.000Z',
        'respostas': enviado['respostas'],
      }, 201);
    }
    if (caminho.endsWith('/participacoes/situacao')) {
      return situacao == null
          ? _json({'message': 'não encontrado'}, 404)
          : _json(situacao!);
    }
    if (caminho.endsWith('/participacoes')) return _json(const []);
    if (caminho.contains('/formularios/')) {
      final tipo = caminho.split('/').last;
      return _json(
        formularios[tipo] ??
            {'tipo': tipo, 'publicado': false, 'perguntas': const []},
      );
    }
    if (caminho.endsWith('/avisos')) return _json(avisos);
    return _json({'message': 'rota não simulada'}, 404);
  });

  /// Injeta esta API na sessão.
  ApiFalsa instalar() {
    SessaoUsuario.atual.configurarApi(ParticipacoesApi(client: client));
    return this;
  }
}

/// Situação de apadrinhado ativo (espelha a semente do backend).
Map<String, dynamic> situacaoApadrinhadoAtivo() => {
  'usuarioId': 'camila@pucminas.edu.br',
  'programa': {
    'codigo': '2026/2',
    'titulo': 'Programa 2026/2',
    'etapaAtual': 'andamento',
    'statusRotulo': 'Em andamento',
    'inscricoesAbertas': false,
    'etapas': const [],
  },
  'situacao': 'apadrinhado_ativo',
  'registro': {
    'id': 5,
    'programa': '2026/2',
    'papel': 'apadrinhado',
    'status': 'em_andamento',
    'grupo': 'Grupo 08',
    'criadoEm': '2026-09-23T19:04:51.398Z',
  },
  'grupo': 'Grupo 08',
  'padrinho': {
    'nome': 'Thiago Moreira',
    'email': 'thiago@pucminas.edu.br',
    'curso': 'Engenharia de Software',
    'periodo': 8,
    'interesses': ['Tecnologia', 'Inovação', 'Projetos'],
    'fotoUrl': null,
    'iniciais': 'TM',
    'grupo': 'Grupo 08',
  },
  'apadrinhados': const [],
};
