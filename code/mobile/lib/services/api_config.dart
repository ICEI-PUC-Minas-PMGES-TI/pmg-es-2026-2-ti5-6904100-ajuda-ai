import 'package:flutter/foundation.dart';

/// Base URL da API.
/// Emulador Android: use `adb reverse tcp:3000 tcp:3000` e acesse 127.0.0.1
/// (10.0.2.2 falha com "Network is unreachable" em alguns emuladores).
const String apiBaseUrl = kIsWeb
    ? 'http://localhost:3000'
    : 'http://127.0.0.1:3000';
