import 'package:flutter/material.dart';

import 'sessao_usuario.dart';
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
      if (mounted) setState(() => _erro = erro.toString());
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Center(
      child: _erro == null
          ? const CircularProgressIndicator()
          : Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(_erro!),
                TextButton(
                  onPressed: _carregar,
                  child: const Text('Tentar novamente'),
                ),
                TextButton(
                  onPressed: () => encerrarSessao(context),
                  child: const Text('Sair'),
                ),
              ],
            ),
    ),
  );
}
