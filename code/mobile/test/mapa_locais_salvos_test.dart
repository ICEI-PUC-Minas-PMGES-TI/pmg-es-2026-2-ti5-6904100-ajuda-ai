import 'dart:io';

import 'package:ajuda_ai/services/mapa_locais_salvos.dart';
import 'package:campus_map/campus_map.dart';
import 'package:flutter_test/flutter_test.dart';

final _biblioteca = CampusPlace(
  id: 'P26',
  name: 'Biblioteca',
  code: '26',
  type: 'LIBRARY',
  kind: CampusPlaceKind.building,
  center: [-43.9931464, -19.92077335],
);

void main() {
  late Directory pasta;
  setUp(() async {
    pasta = await Directory.systemTemp.createTemp('locais_salvos_');
  });
  tearDown(() async {
    if (await pasta.exists()) await pasta.delete(recursive: true);
  });

  ArquivoLocaisSalvos store(String? conta) =>
      ArquivoLocaisSalvos(conta: () => conta, pasta: () async => pasta);

  test('grava e lê no aparelho; sem arquivo a lista é vazia', () async {
    final salvos = store('aluno@pucminas.br');
    expect(await salvos.load(), isEmpty);
    await salvos.save([_biblioteca]);
    final lidos = await store('aluno@pucminas.br').load();
    expect(lidos.single.id, 'P26');
    expect(lidos.single.center, _biblioteca.center);
    expect(lidos.single.kind, CampusPlaceKind.building);
  });

  test('um arquivo por conta, sem o e-mail no nome', () async {
    await store('a@pucminas.br').save([_biblioteca]);
    expect(await store('b@pucminas.br').load(), isEmpty);
    expect(await store(' A@PUCMINAS.BR ').load(), hasLength(1));
    final nomes = pasta.listSync().map((f) => f.uri.pathSegments.last);
    expect(nomes.single, isNot(contains('pucminas')));
    expect(
      ArquivoLocaisSalvos.nomeArquivo(null),
      'mapa_locais_salvos_anonimo.json',
    );
  });

  test('arquivo corrompido recomeça vazio', () async {
    final nome = ArquivoLocaisSalvos.nomeArquivo('a@pucminas.br');
    await File('${pasta.path}/$nome').writeAsString('{não é json');
    expect(await store('a@pucminas.br').load(), isEmpty);
  });

  test('controller usa o arquivo: salvar e remover persistem', () async {
    final arquivo = store('a@pucminas.br');
    final controller = CampusMapController(savedPlacesStore: arquivo);
    addTearDown(controller.dispose);
    expect(await controller.toggleSaved(_biblioteca), isTrue);
    expect((await arquivo.load()).single.id, 'P26');
    expect(await controller.toggleSaved(_biblioteca), isFalse);
    expect(await arquivo.load(), isEmpty);
  });
}
