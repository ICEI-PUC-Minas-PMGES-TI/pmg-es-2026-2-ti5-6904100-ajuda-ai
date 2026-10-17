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
    this.cadastrado = false,
    List<Map<String, dynamic>>? requisitosPadrinho,
  }) : avisos = avisos ?? [],
       requisitosPadrinho = requisitosPadrinho ?? requisitosDeTeste();

  /// Requisitos do ciclo que `GET /formularios/padrinho` devolve (como o
  /// backend: configurados pela coordenação; aqui, dados de teste).
  List<Map<String, dynamic>> requisitosPadrinho;

  static List<Map<String, dynamic>> requisitosDeTeste() => [
    {'id': 'calculo-i', 'descricao': 'Cálculo I', 'obrigatorio': true},
    {'id': 'aed-i', 'descricao': 'AED I', 'obrigatorio': true},
  ];

  /// Token devolvido por `POST /cadastro` e `POST /auth/login-demo`.
  static const token = 'token-do-aluno';

  /// Se o e-mail já tem cadastro (login demo responde 201; senão 401).
  bool cadastrado;
  Map<String, dynamic>? perfilSalvo;
  String? fotoUrl;

  /// Corpo de `GET /participacoes/situacao` (null → 404, mantém estado local).
  Map<String, dynamic>? situacao;

  /// `tipo → corpo` de `GET /formularios/:tipo`.
  final Map<String, Map<String, dynamic>> formularios;
  final List<Map<String, dynamic>> avisos;

  /// Se definido, os POSTs de cadastro respondem 400 com esta mensagem
  /// (ex.: a regra de período × modalidade do backend).
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
    if (caminho == '/me' || caminho == '/cadastro/perfil') {
      final sessao = SessaoUsuario.atual;
      final p =
          perfilSalvo ??
          {
            'nome':
                sessao.dados?.nome ??
                sessao.identidade?.nome ??
                'Camila Duarte',
            'email':
                sessao.identidade?.email ??
                sessao.dados?.email ??
                'camila@pucminas.edu.br',
            'curso': sessao.dados?.curso ?? 'Engenharia de Software',
            'periodo': sessao.dados?.periodo ?? 1,
            'turno': sessao.dados?.turno ?? 'Noite',
            'interesses': sessao.dados?.interesses ?? [],
          };
      if (requisicao.method != 'GET') {
        perfilSalvo = {...p, ...corpo(requisicao)};
      }
      if (caminho == '/cadastro/perfil') {
        return _json({'accessToken': token, 'usuario': perfilSalvo});
      }
      return _json(perfilSalvo ?? p);
    }
    if (caminho == '/me/foto') {
      if (requisicao.method == 'PUT') fotoUrl = 'https://storage.test/avatar';
      return _json({'url': fotoUrl});
    }
    if (caminho == '/participacoes/programas') {
      return _json([
        {
          'codigo': '2026/2',
          'titulo': 'Programa 2026/2',
          'atual': true,
          'inscricoesDisponiveis': true,
        },
        {
          'codigo': '2026/1',
          'titulo': 'Programa 2026/1',
          'atual': false,
          'inscricoesDisponiveis': false,
        },
      ]);
    }

    if (requisicao.method == 'POST' && caminho.endsWith('/auth/login-demo')) {
      if (!cadastrado) {
        return _json({'message': 'Usuário não cadastrado no Ajuda-aí.'}, 401);
      }
      final email = (jsonDecode(requisicao.body) as Map)['email'];
      return _json({
        'accessToken': token,
        'usuario': {'email': email, 'perfil': 'apadrinhado'},
      }, 201);
    }
    if (requisicao.method == 'POST' && caminho.endsWith('/cadastro')) {
      if (erroEnvio != null) {
        return _json({
          'message': erroEnvio,
          'error': 'Bad Request',
          'statusCode': 400,
        }, 400);
      }
      final enviado = jsonDecode(requisicao.body) as Map<String, dynamic>;
      final padrinho = enviado['tipoParticipacao'] == 'padrinho';
      // Mesma regra do backend: requisito obrigatório não cumprido → 400.
      if (padrinho) {
        final respostas = (enviado['respostas'] as Map?) ?? const {};
        final cumpridos = {
          for (final r in (respostas['requisitos'] as List? ?? const []))
            if (r is Map && r['cumpre'] == true) r['id'],
        };
        final faltando = requisitosPadrinho
            .where((r) => r['obrigatorio'] == true)
            .where((r) => !cumpridos.contains(r['id']))
            .map((r) => r['descricao'])
            .toList();
        if (faltando.isNotEmpty) {
          return _json({
            'message':
                'Para se candidatar a padrinho no ciclo 2026/2 é preciso '
                'cumprir: ${faltando.join('; ')}.',
            'statusCode': 400,
          }, 400);
        }
      }
      cadastrado = true;
      situacao = {
        'situacao': padrinho ? 'candidatura_pendente' : 'apadrinhado_pendente',
        'programa': {
          'codigo': enviado['programa'] ?? '2026/2',
          'titulo': 'Programa 2026/2',
        },
        'cadastro': {
          'status': 'pendente',
          'tipoParticipacao': padrinho ? 'padrinho' : 'apadrinhado',
        },
        'registro': {
          'id': 99,
          'papel': padrinho ? 'candidato' : 'apadrinhado',
          'status': 'pendente',
          'respostas': enviado['respostas'],
        },
      };

      return _json({
        'accessToken': token,
        'tokenType': 'Bearer',
        'expiresIn': 3600,
        'usuario': {
          'email': enviado['email'],
          'perfil': enviado['tipoParticipacao'],
          'tipoParticipacao': enviado['tipoParticipacao'],
          'statusCadastro': 'pendente',
        },
        'participacao': {
          'id': 99,
          'usuarioId': enviado['email'],
          'programa': '2026/2',
          'papel': padrinho ? 'candidato' : 'apadrinhado',
          'status': 'pendente',
          'grupo': null,
          'apadrinhados': 0,
          'criadoEm': '2026-09-22T14:32:00.000Z',
          'atualizadoEm': '2026-09-22T14:32:00.000Z',
          'respostas': enviado['respostas'],
        },
      }, 201);
    }
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
      return _json(
        situacao ??
            {
              'situacao': 'nenhuma',
              'programa': {'codigo': '2026/2', 'titulo': 'Programa 2026/2'},
              'registro': null,
            },
      );
    }
    if (caminho.endsWith('/participacoes')) return _json(const []);
    if (caminho.contains('/formularios/')) {
      final tipo = caminho.split('/').last;
      return _json({
        ...(formularios[tipo] ??
            {'tipo': tipo, 'publicado': false, 'perguntas': const []}),
        if (tipo == 'padrinho') 'requisitos': requisitosPadrinho,
      });
    }
    if (caminho.endsWith('/avisos')) return _json(avisos);
    return _json({'message': 'rota não simulada'}, 404);
  });

  /// Injeta esta API na sessão.
  ApiFalsa instalar() {
    SessaoUsuario.atual.configurarApi(
      ParticipacoesApi(client: client)..accessToken = token,
    );
    SessaoUsuario.atual.inscricoesDisponiveis = true;
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
