import 'package:flutter/services.dart';

import 'campus_snapshot.dart';

abstract interface class CampusDataSource {
  Future<CampusSnapshot> load();
}

/// Único ponto de acesso ao bundle; não realiza requisições de rede.
class LocalCampusDataSource implements CampusDataSource {
  const LocalCampusDataSource({this.bundle});

  static const assetPath =
      'packages/campus_map/assets/data/campus_footprints.geojson';

  final AssetBundle? bundle;

  @override
  Future<CampusSnapshot> load() async =>
      CampusSnapshot.parse(await (bundle ?? rootBundle).loadString(assetPath));
}
