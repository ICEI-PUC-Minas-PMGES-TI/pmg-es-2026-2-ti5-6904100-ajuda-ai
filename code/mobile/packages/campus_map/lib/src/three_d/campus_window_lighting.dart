/// Material já separado nos GLBs LOD0/LOD1 do PUCMaps. Não há luzes reais,
/// texturas extras ou emissão fixa: o runtime controla apenas esta parte.
abstract final class CampusWindowLighting {
  static const material = 'PUC_Window_Emissive';
  static const litColor = '#ffe1ac';

  static double glowFor(String preset) => switch (preset) {
    'day' => 0,
    'dawn' || 'dusk' => .35,
    'night' => 1,
    _ => 0,
  };

  static List<Object> only(Object value, Object other) => [
    'match',
    ['get', 'part'],
    material,
    value,
    other,
  ];
  static List<Object> get color => only(litColor, '#ffffff');
  static List<Object> strength(double glow) => only(glow, 0.0);
}
