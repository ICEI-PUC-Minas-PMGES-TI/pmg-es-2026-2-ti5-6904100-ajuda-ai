/// Monta URLs públicas: `<base>/campus/versions/<versão>/<caminho relativo>`.
///
/// Só conhece HTTPS e caminhos; não sabe qual serviço hospeda os arquivos.
class CampusAssetResolver {
  CampusAssetResolver._(this.versionRoot);

  /// `null` quando a base está ausente ou não é uma URL HTTPS pública simples.
  /// Query/fragment são recusados: a leitura é pública, sem SAS no app.
  static CampusAssetResolver? tryCreate(String baseUrl, String version) {
    final base = Uri.tryParse(baseUrl.trim());
    if (base == null ||
        base.scheme != 'https' ||
        base.host.isEmpty ||
        base.hasQuery ||
        base.hasFragment ||
        base.userInfo.isNotEmpty ||
        version.isEmpty ||
        version.contains('/')) {
      return null;
    }
    final segments = [
      ...base.pathSegments.where((segment) => segment.isNotEmpty),
      'campus',
      'versions',
      version,
      '',
    ];
    return CampusAssetResolver._(base.replace(pathSegments: segments));
  }

  /// Termina em `/`, para que [resolve] apenas acrescente o caminho relativo.
  final Uri versionRoot;

  Uri resolve(String relativePath) {
    if (relativePath.isEmpty ||
        relativePath.startsWith('/') ||
        relativePath.contains('\\') ||
        relativePath.split('/').any((part) => part.isEmpty || part == '..') ||
        Uri.tryParse(relativePath)?.hasScheme != false) {
      throw ArgumentError.value(relativePath, 'relativePath');
    }
    return versionRoot.resolve(relativePath);
  }
}
