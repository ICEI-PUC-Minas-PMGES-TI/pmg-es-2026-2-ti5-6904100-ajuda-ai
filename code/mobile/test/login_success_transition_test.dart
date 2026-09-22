import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ajuda_ai/theme/colors.dart';
import 'package:ajuda_ai/widgets/login_success_transition.dart';

void main() {
  double opacity(WidgetTester tester, String key) =>
      tester.widget<Opacity>(find.byKey(ValueKey(key))).opacity;
  Matrix4 matrix(WidgetTester tester, String key) =>
      tester.widget<Transform>(find.byKey(ValueKey(key))).transform;

  testWidgets('giro legivel, crossfade continuo e Home montada uma vez', (
    tester,
  ) async {
    var completed = 0;
    var builds = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: LoginSuccessTransition(
          background: const ColoredBox(color: Colors.white),
          destination: Builder(
            builder: (context) {
              builds++;
              return const Scaffold(body: Text('Home pronta'));
            },
          ),
          onComplete: () => completed++,
        ),
      ),
    );
    await tester.pump();
    final initialBuilds = builds;
    expect(find.text('Home pronta'), findsOneWidget);
    expect(opacity(tester, 'home-fade'), 0);
    final svg = tester.widget<SvgPicture>(find.byType(SvgPicture));
    await tester.pump(const Duration(milliseconds: 100));
    var sawBack = false;
    for (var frame = 0; frame < 24; frame++) {
      await tester.pump(const Duration(milliseconds: 50));
      final outer = matrix(tester, 'crest-turn');
      final inner = matrix(tester, 'crest-back');
      if (outer.entry(0, 0) < 0) {
        sawBack = true;
        expect(inner.entry(0, 0), closeTo(-1, 0.0001));
      }
      expect((outer * inner).entry(0, 0), greaterThanOrEqualTo(-0.0001));
      expect(matrix(tester, 'crest-zoom').entry(0, 0), 1);
      expect(
        identical(tester.widget<SvgPicture>(find.byType(SvgPicture)), svg),
        isTrue,
      );
    }
    expect(sawBack, isTrue);
    await tester.pump(
      const Duration(milliseconds: 450),
    ); // 1750 ms: purple covers the screen.
    expect(opacity(tester, 'purple-fade'), closeTo(1, 0.01));
    expect(opacity(tester, 'home-fade'), closeTo(0, 0.01));
    expect(matrix(tester, 'crest-zoom').entry(0, 0), greaterThan(1));
    var previousHomeOpacity = 0.0;
    for (var frame = 0; frame < 8; frame++) {
      await tester.pump(const Duration(milliseconds: 50));
      final homeOpacity = opacity(tester, 'home-fade');
      expect(homeOpacity, greaterThan(previousHomeOpacity));
      expect(opacity(tester, 'crest-fade'), closeTo(1 - homeOpacity, 0.0001));
      expect(opacity(tester, 'purple-fade'), closeTo(1 - homeOpacity, 0.0001));
      // An opaque brand-colored layer covers the full viewport throughout.
      final base = find
          .byWidgetPredicate(
            (widget) =>
                widget is ColoredBox && widget.color == AppAccents.headerBottom,
          )
          .first;
      expect(
        tester.getSize(base),
        tester.view.physicalSize / tester.view.devicePixelRatio,
      );
      expect(builds, initialBuilds);
      expect(completed, 0);
      previousHomeOpacity = homeOpacity;
    }
    await tester.pump(const Duration(milliseconds: 66));
    expect(completed, 1);
    expect(opacity(tester, 'home-fade'), 1);
    expect(find.byType(SvgPicture), findsNothing);
    expect(builds, initialBuilds);
    expect(tester.takeException(), isNull);
  });

  testWidgets('movimento reduzido usa apenas fade e cancela ao desmontar', (
    tester,
  ) async {
    var completed = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: MediaQuery(
          data: const MediaQueryData(
            size: Size(400, 800),
            disableAnimations: true,
          ),
          child: LoginSuccessTransition(
            background: const ColoredBox(color: Colors.white),
            destination: const Scaffold(body: Text('Home')),
            onComplete: () => completed++,
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(matrix(tester, 'crest-turn').entry(0, 0), closeTo(1, 0.0001));
    expect(matrix(tester, 'crest-zoom').entry(0, 0), 1);
    expect(opacity(tester, 'purple-fade'), 0);
    await tester.pump(const Duration(milliseconds: 116));
    expect(completed, 1);
    expect(opacity(tester, 'home-fade'), 1);
    await tester.pumpWidget(const SizedBox());
    expect(tester.takeException(), isNull);
  });
}
