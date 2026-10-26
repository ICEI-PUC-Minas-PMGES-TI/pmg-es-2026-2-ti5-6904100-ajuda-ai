import 'campus_content.dart';

const _weekdays = ['seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.', 'dom.'];

String _two(int v) => v.toString().padLeft(2, '0');
String _time(DateTime t) => '${_two(t.hour)}:${_two(t.minute)}';

/// "Hoje", "Amanhã" ou "sáb., 18/10" (horário local do aparelho).
String _day(DateTime local, DateTime now) {
  final day = DateTime(local.year, local.month, local.day);
  final today = DateTime(now.year, now.month, now.day);
  // Arredonda: um dia com horário de verão tem 23 ou 25 horas.
  final diff = (day.difference(today).inHours / 24).round();
  if (diff == 0) return 'Hoje';
  if (diff == 1) return 'Amanhã';
  return '${_weekdays[local.weekday - 1]}, ${_two(local.day)}/${_two(local.month)}';
}

/// Período do evento em pt-BR no horário local: "Hoje · 14:00–16:00",
/// "sáb., 18/10 · 14:00–16:00" ou, em dias diferentes,
/// "sáb., 18/10 14:00 – dom., 19/10 18:00".
String campusEventSchedule(CampusEvent event, {DateTime? now}) {
  final current = (now ?? DateTime.now()).toLocal();
  final start = event.start.toLocal();
  final end = event.end.toLocal();
  final sameDay =
      start.year == end.year &&
      start.month == end.month &&
      start.day == end.day;
  if (sameDay) {
    return '${_day(start, current)} · ${_time(start)}–${_time(end)}';
  }
  return '${_day(start, current)} ${_time(start)} – '
      '${_day(end, current)} ${_time(end)}';
}

/// "Acontecendo agora" / "Em breve" / "Encerrado".
String campusEventStatusLabel(CampusEventStatus status) => switch (status) {
  CampusEventStatus.ongoing => 'Acontecendo agora',
  CampusEventStatus.upcoming => 'Em breve',
  CampusEventStatus.ended => 'Encerrado',
};

/// Faixas de hoje: "Hoje: 11:00–14:00, 18:00–21:00" ou "Fechado hoje".
/// Dia da semana pelo relógio do aparelho (0 = domingo, como o backend).
/// Sem nenhum horário cadastrado não dá para dizer que está fechado.
String campusRestaurantHoursToday(
  CampusRestaurant restaurant, {
  DateTime? now,
}) {
  if (restaurant.hours.isEmpty) return 'Horário não informado';
  final current = (now ?? DateTime.now()).toLocal();
  final faixas = restaurant.hoursOn(current.weekday % 7);
  if (faixas.isEmpty) return 'Fechado hoje';
  return 'Hoje: ${faixas.map((h) => '${h.opens}–${h.closes}').join(', ')}';
}
