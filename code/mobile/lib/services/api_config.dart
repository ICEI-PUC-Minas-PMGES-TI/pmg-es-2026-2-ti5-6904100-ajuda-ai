import 'package:flutter/foundation.dart';

/// Base URL compartilhada entre Feed e Participações.
const String apiBaseUrl = kIsWeb
    ? 'http://localhost:3000'
    : 'http://10.0.2.2:3000';
