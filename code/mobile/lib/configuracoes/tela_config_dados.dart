import 'package:flutter/material.dart';

import '../sessao_usuario.dart';
import '../tela_login.dart';
import '../theme/colors.dart';
import 'tela_configuracoes.dart';

class DadosConfigPage extends StatelessWidget {
  const DadosConfigPage({super.key});

  void _voltarAoLogin(BuildContext context) => encerrarSessao(context);

  Future<void> _limpar(BuildContext context) async {
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Limpar dados locais?'),
        content: const Text(
          'Os dados guardados neste aparelho (cadastro em memória, '
          'preferências e histórico carregado) serão apagados e você voltará '
          'para a tela de entrada. Os dados já enviados ao programa não são '
          'afetados.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.primary),
            child: const Text('Limpar'),
          ),
        ],
      ),
    );
    if (confirmar == true && context.mounted) _voltarAoLogin(context);
  }

  @override
  Widget build(BuildContext context) {
    final sessao = SessaoUsuario.atual;
    return EstruturaConfig(
      titulo: 'Dados e Armazenamento',
      subtitulo: 'O Ajuda-aí guarda sua sessão apenas na memória do aparelho.',
      children: [
        _Info(
          'E-mail da sessão',
          sessao.dados?.email ?? 'Nenhum cadastro nesta sessão',
        ),
        _Info(
          'Participações carregadas',
          '${sessao.historicoParticipacoes.length}',
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: () => _limpar(context),
          icon: const Icon(Icons.delete_outline),
          label: const Text('Limpar dados locais'),
          style: OutlinedButton.styleFrom(
            foregroundColor: const Color(0xFFB91C1C),
            minimumSize: const Size.fromHeight(48),
            side: const BorderSide(color: Color(0xFFFCA5A5)),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
        const SizedBox(height: 8),
        TextButton(
          onPressed: () => _voltarAoLogin(context),
          style: TextButton.styleFrom(
            foregroundColor: AppColors.primary,
            minimumSize: const Size.fromHeight(44),
          ),
          child: const Text('Sair da conta'),
        ),
      ],
    );
  }
}

class _Info extends StatelessWidget {
  const _Info(this.rotulo, this.valor);

  final String rotulo;
  final String valor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(
              rotulo,
              style: const TextStyle(
                fontFamily: 'Inter',
                color: AppColors.muted,
                fontSize: 13,
              ),
            ),
          ),
          Flexible(
            child: Text(
              valor,
              textAlign: TextAlign.end,
              style: const TextStyle(
                fontFamily: 'Inter',
                color: AppColors.ink,
                fontSize: 13,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
