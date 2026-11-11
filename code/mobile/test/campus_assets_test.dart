import 'package:campus_map/campus_map.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('app resolve snapshot embutido do package sem API', () async {
    final snapshot = await const LocalCampusDataSource().load();
    expect(snapshot.features, hasLength(82));
    expect(snapshot.features.any((feature) => feature.id == 'P26'), isTrue);
  });
}
