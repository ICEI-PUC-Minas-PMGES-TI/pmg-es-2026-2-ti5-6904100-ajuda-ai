import 'package:flutter/material.dart';

import 'services/api_config.dart';
import 'sessao_usuario.dart';
import 'theme/colors.dart';
import 'status_participacao.dart';
import 'tela_cadastro.dart';
import 'widgets/app_bottom_navigation.dart';
import 'widgets/navegacao_app.dart';
import 'tela_status_candidatura.dart';
import 'tela_login.dart';

/// Aguarda o servidor antes de resolver destino e permissões.
class EntradaAlunoPage extends StatefulWidget {
  const EntradaAlunoPage({super.key});
  @override
  State<EntradaAlunoPage> createState() => _EntradaAlunoPageState();
}

class _EntradaAlunoPageState extends State<EntradaAlunoPage> {
  String? _erro;
  @override
  void initState() {
    super.initState();
    _carregar();
  }

  Future<void> _carregar() async {
    setState(() => _erro = null);
    try {
      final sessao = SessaoUsuario.atual;
      await sessao.carregarContexto();
      if (!mounted) return;
      final Widget destino = !sessao.perfilCompleto
          ? const CadastroPage()
          : sessao.status.candidatura
          ? const StatusCandidaturaPage()
          : AppShell(
              inicial: sessao.status.ativo
                  ? AppDestination.inicio
                  : AppDestination.perfil,
            );
      Navigator.of(context)
          .pushReplacement(MaterialPageRoute<void>(builder: (_) => destino));
    } catch (erro) {
      if (mounted) setState(() => _erro = _mensagemAmigavel(erro));
    }
  }

  /// Texto para quem usa o app: nada de nome de exceção ou detalhe técnico.
  static String _mensagemAmigavel(Object erro) => switch (erro) {
    ApiException(:final mensagem) when mensagem.trim().isNotEmpty => mensagem,
    ApiIndisponivelException() => erro.toString(),
    _ => 'Não foi possível abrir sua conta agora. Tente novamente em instantes.',
  };

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: _erro == null
            ? const CircularProgressIndicator()
            : SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 420),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.cloud_off_rounded,
                        size: 40,
                        color: AppColors.muted,
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'Não conseguimos carregar sua conta',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontFamily: 'Poppins',
                          fontWeight: FontWeight.w800,
                          fontSize: 20,
                          color: AppColors.ink,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _erro!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontFamily: 'Inter',
                          fontSize: 15,
                          height: 1.4,
                          color: AppColors.muted,
                        ),
                      ),
                      const SizedBox(height: 24),
                      SizedBox(
                        width: double.infinity,
                        height: 48,
                        child: FilledButton(
                          onPressed: _carregar,
                          style: FilledButton.styleFrom(
                            backgroundColor: AppColors.primary,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: const Text('Tentar novamente'),
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: () => encerrarSessao(context),
                        child: const Text('Sair da conta'),
                      ),
                    ],
                  ),
                ),
              ),
      ),
    ),
  );
}
