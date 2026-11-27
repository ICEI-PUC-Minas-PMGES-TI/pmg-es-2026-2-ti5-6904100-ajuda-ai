import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_appauth/flutter_appauth.dart';
import 'package:http/http.dart' as http;

import 'coordenacao/tela_coordenacao.dart';
import 'services/auth_api.dart';
import 'services/microsoft_auth.dart';
import 'sessao_usuario.dart';
import 'tela_cadastro.dart';
import 'tela_entrada_aluno.dart';
import 'services/participacoes_api.dart';
import 'theme/colors.dart';
import 'usuarios_demo.dart';
import 'widgets/campus_photo.dart';

/// Encerra qualquer sessão (demo ou Microsoft) e deixa o login como única rota.
void encerrarSessao(
  BuildContext context, {
  http.Client? client,
  String? baseUrl,
}) {
  SessaoUsuario.atual.limpar();
  Navigator.of(context).pushAndRemoveUntil(
    MaterialPageRoute<void>(
      builder: (_) => LoginPage(client: client, baseUrl: baseUrl),
    ),
    (_) => false,
  );
}

class LoginPage extends StatefulWidget {
  const LoginPage({
    super.key,
    this.obterIdToken,
    this.client,
    this.baseUrl,
    this.modoDemo = kDebugMode || _demoHomologacao,
  });

  /// APK de homologação: `--dart-define=DEMO_LOGIN=true`. A API continua
  /// exigindo a chave de demonstração; em produção a rota está desligada.
  static const _demoHomologacao = bool.fromEnvironment('DEMO_LOGIN');

  /// Testes injetam o ID token. Em produção, vem do Entra ID via PKCE.
  final Future<String> Function()? obterIdToken;
  final http.Client? client;
  final String? baseUrl;

  /// Seletor de usuários de teste. Em release fica desligado.
  final bool modoDemo;

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  bool _entrando = false;
  // Chave de demonstração digitada (homologação). Só em memória; nunca embutida no app.
  final _chaveDemo = TextEditingController();

  @override
  void dispose() {
    _chaveDemo.dispose();
    super.dispose();
  }

  Future<void> _entrarMicrosoft() async {
    if (_entrando) return;
    setState(() => _entrando = true);
    try {
      final obter = widget.obterIdToken ?? obterIdTokenMicrosoft;
      final idToken = await obter();
      final api = AuthApi(client: widget.client, baseUrl: widget.baseUrl);
      final resultado = await api.loginMicrosoft(idToken);
      {
        SessaoUsuario.atual.configurarApi(
          ParticipacoesApi(client: widget.client, baseUrl: api.baseUrl),
        );
      }
      if (!mounted) return;

      if (resultado.ehOnboarding) {
        SessaoUsuario.atual.iniciarOnboarding(
          nome: resultado.nome!,
          email: resultado.email!,
          token: resultado.onboardingToken!,
        );
        Navigator.of(context).pushReplacement(
          MaterialPageRoute<void>(builder: (_) => const CadastroPage()),
        );
        return;
      }

      final sessao = resultado.sessao!;
      var perfil = sessao.usuario;
      try {
        perfil = await api.meuPerfil(sessao.accessToken);
      } catch (_) {
        perfil = sessao.usuario;
      }
      if (!mounted) return;
      SessaoUsuario.atual.assumirSessao(
        accessToken: sessao.accessToken,
        nome: perfil['nome'] as String? ?? sessao.nome,
        email: perfil['email'] as String? ?? sessao.email,
        curso: perfil['curso'] as String?,
        periodo: (perfil['periodo'] as num?)?.toInt(),
        turno: perfil['turno'] as String?,
        interesses: (perfil['interesses'] as List?)
            ?.whereType<String>()
            .toList(),
      );
      final coordenador =
          perfil['perfil'] == 'coordenador' || sessao.ehCoordenador;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute<void>(
          builder: (_) => coordenador
              ? TelaCoordenacao(
                  sessaoAutenticada: sessao,
                  client: widget.client,
                  baseUrl: api.baseUrl,
                )
              : const EntradaAlunoPage(),
        ),
        (_) => false,
      );
    } on MicrosoftNaoConfigurado {
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Login Microsoft indisponível'),
          content: const Text(
            'Falta configurar o app público no Entra ID '
            '(MICROSOFT_CLIENT_ID, MICROSOFT_TENANT_ID e o redirect '
            'br.pucminas.ajudaai://auth). Nenhuma conta é aberta. '
            'Em desenvolvimento, “Entrar como usuário de teste” abre '
            'somente as contas demo já definidas.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Entendi'),
            ),
          ],
        ),
      );
    } on FlutterAppAuthUserCancelledException {
      // A pessoa fechou a tela da Microsoft.
    } catch (erro) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(erro.toString().replaceFirst('Exception: ', '')),
        ),
      );
    } finally {
      if (mounted) setState(() => _entrando = false);
    }
  }

  Future<void> _abrirSeletorDemo() async {
    final escolhido = await showModalBottomSheet<UsuarioDemo>(
      context: context,
      backgroundColor: AppColors.background,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) {
        final altura = MediaQuery.sizeOf(sheetContext).height * 0.85;
        final grupos = <String, List<UsuarioDemo>>{};
        for (final usuario in usuariosDemo) {
          grupos.putIfAbsent(usuario.grupo, () => []).add(usuario);
        }
        return SafeArea(
          child: ConstrainedBox(
            constraints: BoxConstraints(maxHeight: altura),
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              children: [
                if (AuthApi.exigeChaveDemo)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(4, 0, 4, 16),
                    child: TextField(
                      key: const Key('campo-chave-demo'),
                      controller: _chaveDemo,
                      obscureText: true,
                      autocorrect: false,
                      enableSuggestions: false,
                      decoration: const InputDecoration(
                        labelText: 'Chave de demonstração',
                        helperText:
                            'Digite a chave antes de escolher o usuário.',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                const Padding(
                  padding: EdgeInsets.fromLTRB(4, 0, 4, 12),
                  child: Text(
                    'Usuário de teste',
                    style: TextStyle(
                      fontFamily: 'Inter',
                      color: AppColors.ink,
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                for (final grupo in grupos.entries) ...[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(4, 8, 4, 6),
                    child: Text(
                      grupo.key.toUpperCase(),
                      style: const TextStyle(
                        fontFamily: 'Inter',
                        color: AppColors.primary,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.6,
                      ),
                    ),
                  ),
                  for (final usuario in grupo.value)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Material(
                        color: AppColors.lavender,
                        borderRadius: BorderRadius.circular(14),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(14),
                          onTap: () => Navigator.of(sheetContext).pop(usuario),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 12,
                            ),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        usuario.nome,
                                        style: const TextStyle(
                                          fontFamily: 'Inter',
                                          color: AppColors.ink,
                                          fontSize: 16,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        usuario.papel,
                                        style: const TextStyle(
                                          fontFamily: 'Inter',
                                          color: AppColors.muted,
                                          fontSize: 13,
                                        ),
                                      ),
                                      if (usuario.cenario != null)
                                        Text(
                                          usuario.cenario!,
                                          style: const TextStyle(
                                            fontFamily: 'Inter',
                                            color: AppColors.primary,
                                            fontSize: 12,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                                const Icon(
                                  Icons.chevron_right,
                                  color: AppColors.primary,
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ],
            ),
          ),
        );
      },
    );
    if (escolhido == null || !mounted) return;
    await _entrarDemo(escolhido);
  }

  Future<void> _entrarDemo(UsuarioDemo usuario) async {
    if (_entrando) return;
    if (AuthApi.exigeChaveDemo && _chaveDemo.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Digite a chave de demonstração e escolha o usuário de novo.',
          ),
        ),
      );
      return;
    }
    setState(() => _entrando = true);
    // Primeiro acesso depois de ocioso: o servidor hospedado precisa subir (~45 s). Avisa em vez de parecer travado.
    var avisoMostrado = false;
    final avisoServidor = Timer(const Duration(seconds: 6), () {
      if (!mounted || !_entrando) return;
      avisoMostrado = true;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(
            duration: Duration(seconds: 90),
            content: Text(
              'Acordando o servidor. O primeiro acesso do dia pode levar até 1 minuto.',
            ),
          ),
        );
    });
    try {
      final api = AuthApi(client: widget.client, baseUrl: widget.baseUrl);
      final sessao = await api.loginDemo(
        usuario.email,
        chave: _chaveDemo.text.trim(),
      );
      _chaveDemo.clear();
      if (avisoMostrado && mounted) {
        ScaffoldMessenger.of(context).hideCurrentSnackBar();
      }
      SessaoUsuario.atual.limpar();
      {
        SessaoUsuario.atual.configurarApi(
          ParticipacoesApi(client: widget.client, baseUrl: api.baseUrl),
        );
      }
      if (!mounted) return;
      if (sessao.ehCoordenador) {
        Navigator.of(context).pushAndRemoveUntil(
          MaterialPageRoute<void>(
            builder: (_) => TelaCoordenacao(
              emailDemo: usuario.email,
              sessaoAutenticada: sessao,
              client: widget.client,
              baseUrl: api.baseUrl,
            ),
          ),
          (_) => false,
        );
        return;
      }
      SessaoUsuario.atual.assumirSessao(
        accessToken: sessao.accessToken,
        nome: sessao.nome,
        email: sessao.email,
        curso: sessao.usuario['curso'] as String?,
        periodo: (sessao.usuario['periodo'] as num?)?.toInt(),
        turno: sessao.usuario['turno'] as String?,
        interesses: (sessao.usuario['interesses'] as List?)
            ?.whereType<String>()
            .toList(),
      );
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute<void>(builder: (_) => const EntradaAlunoPage()),
        (_) => false,
      );
    } catch (erro) {
      if (!mounted) return;
      if (avisoMostrado) {
        ScaffoldMessenger.of(context).hideCurrentSnackBar();
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(erro.toString().replaceFirst('Exception: ', '')),
        ),
      );
    } finally {
      avisoServidor.cancel();
      if (mounted) setState(() => _entrando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: Stack(
        children: [
          const _BackgroundShapes(),
          SafeArea(
            bottom: false,
            child: LayoutBuilder(
              builder: (context, constraints) {
                final natural = CampusPhoto.heightFor(context);
                final foto = (constraints.maxHeight - 500).clamp(96.0, natural);
                return Column(
                  children: [
                    Expanded(
                      child: _LoginContent(
                        modoDemo: widget.modoDemo,
                        onMicrosoftPressed: _entrarMicrosoft,
                        onDemoPressed: _abrirSeletorDemo,
                      ),
                    ),
                    CampusPhoto(height: foto),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _BackgroundShapes extends StatelessWidget {
  const _BackgroundShapes();

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Stack(
        children: [
          Positioned(top: -118, left: -95, child: _blob(250)),
          Positioned(top: -95, right: -130, child: _blob(240)),
          Positioned(bottom: -170, left: -90, child: _blob(340)),
        ],
      ),
    );
  }

  Widget _blob(double size) => Container(
    width: size,
    height: size,
    decoration: const BoxDecoration(
      color: AppColors.lavender,
      shape: BoxShape.circle,
    ),
  );
}

class _LoginContent extends StatelessWidget {
  const _LoginContent({
    required this.onMicrosoftPressed,
    required this.onDemoPressed,
    required this.modoDemo,
  });

  final VoidCallback onMicrosoftPressed;
  final VoidCallback onDemoPressed;
  final bool modoDemo;

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;

    return LayoutBuilder(
      builder: (context, constraints) {
        final height = constraints.maxHeight;
        final topGap = (height * 0.060).clamp(20.0, 46.0);
        final afterLockup = (height * 0.069).clamp(28.0, 56.0);
        final aroundHero = (height * 0.015).clamp(8.0, 16.0);
        final afterButton = (height * 0.027).clamp(12.0, 24.0);

        return Padding(
          padding: EdgeInsets.symmetric(
            horizontal: (width * 0.063).clamp(20.0, 28.0),
          ),
          child: Column(
            children: [
              SizedBox(height: topGap),
              const _BrandLockup(),
              SizedBox(height: afterLockup),
              const _Welcome(),
              SizedBox(height: aroundHero),
              const Expanded(child: _HeroImage()),
              SizedBox(height: aroundHero),
              _MicrosoftButton(onPressed: onMicrosoftPressed),
              if (modoDemo) ...[
                SizedBox(height: afterButton),
                _EntradaDemo(onPressed: onDemoPressed),
              ],
              SizedBox(height: afterButton),
            ],
          ),
        );
      },
    );
  }
}

class _BrandLockup extends StatelessWidget {
  const _BrandLockup();

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Image.asset('assets/images/logo.png', height: 44),
        Container(
          width: 1,
          height: 36,
          margin: const EdgeInsets.symmetric(horizontal: 16),
          color: AppColors.muted.withValues(alpha: 0.35),
        ),
        Image.asset('assets/images/puclogo.png', height: 50),
      ],
    );
  }
}

class _Welcome extends StatelessWidget {
  const _Welcome();

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;

    return Column(
      children: [
        Text(
          'Bem-vindo!',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: AppColors.ink,
            fontSize: (width * 0.095).clamp(28.0, 44.0),
            fontWeight: FontWeight.w800,
            letterSpacing: -0.5,
            height: 1.1,
          ),
        ),
        const SizedBox(height: 12),
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 340),
          child: const Text(
            'Entre com sua conta institucional.\n'
            'No primeiro acesso, você poderá completar seu cadastro no Ajuda-aí.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontFamily: 'Inter',
              color: AppColors.muted,
              fontSize: 14,
              fontWeight: FontWeight.w400,
              height: 1.35,
            ),
          ),
        ),
      ],
    );
  }
}

class _HeroImage extends StatelessWidget {
  const _HeroImage();

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final side = constraints.biggest.shortestSide.clamp(0.0, 210.0);

        return Center(
          child: Stack(
            alignment: Alignment.center,
            children: [
              Container(
                width: side,
                height: side,
                decoration: BoxDecoration(
                  color: AppColors.lavender.withValues(alpha: 0.75),
                  borderRadius: BorderRadius.circular(side),
                ),
              ),
              Image.asset(
                'assets/images/imghero.png',
                height: side * 0.98,
                fit: BoxFit.contain,
              ),
            ],
          ),
        );
      },
    );
  }
}

class _EntradaDemo extends StatelessWidget {
  const _EntradaDemo({required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const Divider(height: 1, thickness: 1, color: Color(0xFFE4DFF0)),
        const SizedBox(height: 12),
        const Text(
          'Modo de desenvolvimento',
          style: TextStyle(
            fontFamily: 'Inter',
            color: AppColors.ink,
            fontSize: 13,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 10),
        SizedBox(
          width: double.infinity,
          height: 48,
          child: OutlinedButton(
            onPressed: onPressed,
            style: OutlinedButton.styleFrom(
              backgroundColor: AppColors.lavender,
              foregroundColor: AppColors.primary,
              side: const BorderSide(color: AppColors.primary, width: 1.4),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            child: const Text(
              'Entrar como usuário de teste',
              style: TextStyle(
                fontFamily: 'Inter',
                fontSize: 15,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _MicrosoftButton extends StatelessWidget {
  const _MicrosoftButton({required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final height = (width * 0.14).clamp(50.0, 62.0);
    final radius = (width * 0.04).clamp(14.0, 18.0);

    return SizedBox(
      width: double.infinity,
      height: height,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(radius),
          boxShadow: [
            BoxShadow(
              color: AppColors.primary.withValues(alpha: 0.32),
              blurRadius: 22,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        child: FilledButton(
          onPressed: onPressed,
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
            padding: EdgeInsets.symmetric(
              horizontal: (width * 0.05).clamp(18.0, 22.0),
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(radius),
            ),
          ),
          child: Row(
            children: [
              Image.asset(
                'assets/images/microsoft.png',
                height: (width * 0.067).clamp(24.0, 29.0),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Entrar com a Microsoft',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontFamily: 'Inter',
                    fontSize: (width * 0.04).clamp(14.0, 18.0),
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              Icon(
                Icons.arrow_forward,
                size: (width * 0.055).clamp(19.0, 24.0),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
