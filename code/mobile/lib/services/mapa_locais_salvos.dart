import 'dart:convert';
import 'dart:io';

import 'package:campus_map/campus_map.dart';
import 'package:path_provider/path_provider.dart';

/// "Salvar local" do mapa: lista gravada só no aparelho (como no PUCMaps),
/// em JSON na pasta de suporte do app. Um arquivo por conta, para duas
/// pessoas no mesmo aparelho não verem os salvos uma da outra. Nada vai para
/// a API.
class ArquivoLocaisSalvos implements CampusSavedPlacesStore {
  ArquivoLocaisSalvos({
    required this.conta,
    Future<Directory> Function()? pasta,
  }) : _pasta = pasta ?? getApplicationSupportDirectory;

  /// E-mail da sessão (ou `null` sem login: arquivo "anonimo").
  final String? Function() conta;
  final Future<Directory> Function() _pasta;

  Future<File> _arquivo() async {
    final dir = await _pasta();
    return File('${dir.path}${Platform.pathSeparator}${nomeArquivo(conta())}');
  }

  /// Nome estável por conta sem expor o e-mail no sistema de arquivos
  /// (FNV-1a de 32 bits; colisão só mistura salvos, nunca dados sensíveis).
  static String nomeArquivo(String? conta) {
    final chave = conta?.trim().toLowerCase() ?? '';
    if (chave.isEmpty) return 'mapa_locais_salvos_anonimo.json';
    var hash = 0x811c9dc5;
    for (final unidade in utf8.encode(chave)) {
      hash ^= unidade;
      hash = (hash * 0x01000193) & 0xffffffff;
    }
    return 'mapa_locais_salvos_${hash.toRadixString(16).padLeft(8, '0')}.json';
  }

  @override
  Future<List<CampusPlace>> load() async {
    final arquivo = await _arquivo();
    if (!await arquivo.exists()) return const [];
    try {
      return CampusSavedPlaceCodec.decode(
        jsonDecode(await arquivo.readAsString()),
      );
    } on FormatException {
      // Arquivo corrompido: recomeça vazio em vez de travar o mapa.
      return const [];
    }
  }

  @override
  Future<void> save(List<CampusPlace> places) async {
    final arquivo = await _arquivo();
    await arquivo.parent.create(recursive: true);
    // Grava num temporário e renomeia: uma falha no meio não corrompe a lista.
    final temporario = File('${arquivo.path}.tmp');
    await temporario.writeAsString(
      jsonEncode(CampusSavedPlaceCodec.encode(places)),
      flush: true,
    );
    await temporario.rename(arquivo.path);
  }
}
