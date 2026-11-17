import 'dart:async';
import 'dart:convert';

import 'package:ajuda_ai/services/participacoes_api.dart';
import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/status_participacao.dart';
import 'package:ajuda_ai/widgets/app_bottom_navigation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'helpers/api_falsa.dart';

/// Respostas de `GET /participacoes/situacao` que o teste libera à mão, para
/// reproduzir resposta lenta, falha e resposta fora de ordem.
class _Servidor {
  final pendentes = <Completer<http.Response>>[];
  int chamadas = 0;
  late final cliente = MockClient((request) {
    chamadas++;
    final c = Completer<http.Response>();
    pendentes.add(c);
    return c.future;
  });

  static const _json = {'content-type': 'application/json; charset=utf-8'};
  http.Response ativo() => http.Response(
    jsonEncode(situacaoApadrinhadoAtivo()),
    200,
    headers: _json,
  );
  http.Response nenhuma() =>
      http.Response(jsonEncode({'situacao': 'nenhuma'}), 200, headers: _json);
  http.Response erro() => http.Response('{"message":"x"}', 500, headers: _json);

  void responder(int i, http.Response r) => pendentes[i].complete(r);
}

void main() {
  late _Servidor servidor;
  final sessao = SessaoUsuario.atual;
  const todas = AppDestination.values;
  const reduzidas = [AppDestination.mapa, AppDestination.perfil];

  setUp(() {
    servidor = _Servidor();
    sessao.limpar();
    sessao.configurarApi(
      ParticipacoesApi(client: servidor.cliente)..accessToken = 'tk',
    );
    sessao.definirIdentidade(nome: 'Camila', email: 'camila@pucminas.edu.br');
  });

  /// Confirma a participação ativa (primeira consulta bem-sucedida).
  Future<void> confirmarAtivo() async {
    final f = sessao.sincronizarSituacao();
    await pumpEventQueue();
    servidor.responder(servidor.pendentes.length - 1, servidor.ativo());
    expect(await f, isTrue);
  }

  test(
    'estado inicial é desconhecido, depois carregando, depois confirmada',
    () async {
      expect(sessao.estadoSituacao, EstadoSituacao.desconhecido);
      final f = sessao.sincronizarSituacao();
      expect(sessao.estadoSituacao, EstadoSituacao.carregando);
      await pumpEventQueue();
      servidor.responder(0, servidor.ativo());
      await f;
      expect(sessao.estadoSituacao, EstadoSituacao.confirmada);
      expect(sessao.destinos, todas);
    },
  );

  test('revalidação lenta não tira as abas do apadrinhado ativo', () async {
    await confirmarAtivo();
    final f = sessao.sincronizarSituacao();
    await pumpEventQueue();
    // Consulta em andamento: valor anterior segue valendo.
    expect(sessao.estadoSituacao, EstadoSituacao.atualizando);
    expect(sessao.status, StatusParticipacao.apadrinhadoAtivo);
    expect(sessao.destinos, todas);
    servidor.responder(1, servidor.ativo());
    await f;
    expect(sessao.estadoSituacao, EstadoSituacao.confirmada);
  });

  test('falha de rede mantém o último valor confirmado', () async {
    await confirmarAtivo();
    final f = sessao.sincronizarSituacao();
    await pumpEventQueue();
    servidor.responder(1, servidor.erro());
    expect(await f, isFalse);
    expect(sessao.estadoSituacao, EstadoSituacao.erro);
    expect(sessao.status, StatusParticipacao.apadrinhadoAtivo);
    expect(sessao.destinos, todas);
    expect(sessao.situacao?.padrinho?.nome, 'Thiago Moreira');
  });

  test('mudança real confirmada pelo servidor é respeitada', () async {
    await confirmarAtivo();
    final f = sessao.sincronizarSituacao();
    await pumpEventQueue();
    servidor.responder(1, servidor.nenhuma());
    await f;
    expect(sessao.status, StatusParticipacao.nenhuma);
    expect(sessao.destinos, reduzidas);
  });

  test('sem nenhum valor confirmado, falha não inventa participação', () async {
    final f = sessao.sincronizarSituacao();
    await pumpEventQueue();
    servidor.responder(0, servidor.erro());
    await f;
    expect(sessao.estadoSituacao, EstadoSituacao.erro);
    expect(sessao.situacao, isNull);
    expect(sessao.destinos, reduzidas);
  });

  test(
    'resposta antiga não sobrescreve uma mais nova (fora de ordem)',
    () async {
      // Consulta 1 (lenta) e consulta 2 (forçada, mais nova).
      final lenta = sessao.sincronizarSituacao();
      await pumpEventQueue();
      final nova = sessao.sincronizarSituacao(forcar: true);
      await pumpEventQueue();
      expect(servidor.chamadas, 2);
      servidor.responder(1, servidor.ativo());
      await nova;
      expect(sessao.status, StatusParticipacao.apadrinhadoAtivo);
      // A antiga chega depois dizendo "nenhuma": não pode valer.
      servidor.responder(0, servidor.nenhuma());
      await lenta;
      expect(sessao.status, StatusParticipacao.apadrinhadoAtivo);
      expect(sessao.destinos, todas);
    },
  );

  test('falha de uma consulta antiga não estraga a mais nova', () async {
    final lenta = sessao.sincronizarSituacao();
    await pumpEventQueue();
    final nova = sessao.sincronizarSituacao(forcar: true);
    await pumpEventQueue();
    servidor.responder(1, servidor.ativo());
    await nova;
    servidor.responder(0, servidor.erro());
    await lenta;
    expect(sessao.estadoSituacao, EstadoSituacao.confirmada);
    expect(sessao.status, StatusParticipacao.apadrinhadoAtivo);
  });

  test(
    'trocas de aba durante a consulta compartilham UMA requisição',
    () async {
      final consultas = [
        for (var i = 0; i < 30; i++) sessao.sincronizarSituacao(),
      ];
      await pumpEventQueue();
      expect(servidor.chamadas, 1);
      servidor.responder(0, servidor.ativo());
      expect(await Future.wait(consultas), everyElement(isTrue));
      expect(sessao.destinos, todas);
    },
  );

  test(
    '30 revalidações com falhas intercaladas nunca reduzem as abas',
    () async {
      await confirmarAtivo();
      for (var i = 0; i < 30; i++) {
        final f = sessao.sincronizarSituacao();
        await pumpEventQueue();
        // Durante a consulta e depois da falha/sucesso: sempre as cinco abas.
        expect(sessao.destinos, todas, reason: 'em andamento #$i');
        servidor.responder(
          servidor.pendentes.length - 1,
          i.isEven ? servidor.erro() : servidor.ativo(),
        );
        await f;
        expect(sessao.destinos, todas, reason: 'após resposta #$i');
      }
    },
  );

  test('resposta de outra conta é descartada ao trocar de usuário', () async {
    final f = sessao.sincronizarSituacao();
    await pumpEventQueue();
    // Logout e login de outra conta enquanto a consulta estava no ar.
    sessao.limpar();
    sessao.configurarApi(
      ParticipacoesApi(client: servidor.cliente)..accessToken = 'outro',
    );
    sessao.definirIdentidade(nome: 'Outro', email: 'outro@pucminas.edu.br');
    servidor.responder(0, servidor.ativo());
    expect(await f, isFalse);
    expect(sessao.situacao, isNull);
    expect(sessao.status, StatusParticipacao.nenhuma);
    expect(sessao.destinos, reduzidas);
  });

  test('trocar o programa descarta a participação do anterior', () async {
    await confirmarAtivo();
    final f = sessao.selecionarPrograma('2027/1');
    await pumpEventQueue();
    expect(sessao.status, StatusParticipacao.nenhuma);
    expect(sessao.estadoSituacao, EstadoSituacao.carregando);
    servidor.responder(servidor.pendentes.length - 1, servidor.nenhuma());
    await f;
    expect(sessao.status, StatusParticipacao.nenhuma);
    expect(sessao.destinos, reduzidas);
  });

  test('a navegação é avisada de mudanças reais da participação', () async {
    var avisos = 0;
    void ouvir() => avisos++;
    sessao.mudancas.addListener(ouvir);
    addTearDown(() => sessao.mudancas.removeListener(ouvir));
    await confirmarAtivo();
    expect(avisos, greaterThanOrEqualTo(2));
    final antes = avisos;
    sessao.limpar();
    expect(avisos, greaterThan(antes));
  });

  test('contexto fresco evita reconsultar ao voltar para uma aba', () async {
    expect(sessao.contextoFresco, isFalse);
    await confirmarAtivo();
    expect(sessao.contextoFresco, isTrue);
    sessao.limpar();
    expect(sessao.contextoFresco, isFalse);
  });
}
