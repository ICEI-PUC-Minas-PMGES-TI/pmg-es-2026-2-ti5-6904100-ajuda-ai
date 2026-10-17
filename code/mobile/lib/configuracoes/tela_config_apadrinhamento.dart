import 'package:flutter/material.dart';

import '../sessao_usuario.dart';
import '../status_participacao.dart';
import '../tela_historico.dart';
import '../tela_padrinho_definido.dart';
import '../tela_status_candidatura.dart';
import '../theme/colors.dart';
import 'tela_configuracoes.dart';

/// Mostra a situação atual do aluno no programa.
class ApadrinhamentoConfigPage extends StatefulWidget {
  const ApadrinhamentoConfigPage({super.key});

  @override
  State<ApadrinhamentoConfigPage> createState() =>
      _ApadrinhamentoConfigPageState();
}

class _ApadrinhamentoConfigPageState extends State<ApadrinhamentoConfigPage> {
  SessaoUsuario get _sessao => SessaoUsuario.atual;

  @override
  void initState() {
    super.initState();
    _sessao.sincronizarSituacao().then((_) {
      if (mounted) setState(() {});
    });
  }

  void _abrir(Widget pagina) =>
      Navigator.of(context)
          .push(MaterialPageRoute(builder: (_) => pagina))
          .then((_) {
            if (mounted) setState(() {});
          });

  @override
  Widget build(BuildContext context) {
    final status = _sessao.status;
    final programa = _sessao.situacao?.programa;
    final linhas = <(String, String)>[
      ('Situação', status.titulo),
      ('Programa', programa?.titulo ?? 'Programa ${_sessao.programaAtual}'),
      if (programa?.statusRotulo != null)
        ('Etapa do programa', programa!.statusRotulo!),
      if (_sessao.grupo != null) ('Grupo', _sessao.grupo!),
      if (_sessao.padrinho != null) ('Padrinho', _sessao.padrinho!.nome),
      if (_sessao.apadrinhados.isNotEmpty)
        (
          'Apadrinhados',
          _sessao.apadrinhados.map((pessoa) => pessoa.nome).join(', '),
        ),
    ];

    return EstruturaConfig(
      titulo: 'Apadrinhamento',
      subtitulo: 'Sua situação atual no programa de apadrinhamento.',
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          decoration: BoxDecoration(
            color: AppAccents.cardBg,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppAccents.cardBorder),
          ),
          child: Column(
            children: [
              for (final (rotulo, valor) in linhas)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 9),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        flex: 4,
                        child: Text(
                          rotulo,
                          style: const TextStyle(
                            fontFamily: 'Inter',
                            color: AppColors.muted,
                            fontSize: 13,
                          ),
                        ),
                      ),
                      Expanded(
                        flex: 6,
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
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        if (status == StatusParticipacao.padrinhoEmAnalise ||
            status == StatusParticipacao.padrinhoRejeitado)
          _Acao(
            icone: Icons.fact_check_outlined,
            titulo: 'Status da candidatura',
            onTap: () => _abrir(const StatusCandidaturaPage()),
          ),
        // Só com cadastro aprovado (pendente/rejeitado não têm padrinho).
        if (status == StatusParticipacao.apadrinhadoAtivo ||
            status == StatusParticipacao.apadrinhadoAguardandoMatch)
          _Acao(
            icone: Icons.person_search_outlined,
            titulo: 'Meu padrinho',
            onTap: () => _abrir(const PadrinhoDefinidoPage()),
          ),
        _Acao(
          icone: Icons.history,
          titulo: 'Histórico de participação',
          onTap: () => _abrir(const HistoricoParticipacaoPage()),
        ),
        if (!status.participa)
          const NotaConfig(
            'Você ainda não participa do ciclo atual. Pelo seu perfil você '
            'pode se candidatar quando as inscrições estiverem abertas.',
          ),
      ],
    );
  }
}

class _Acao extends StatelessWidget {
  const _Acao({required this.icone, required this.titulo, required this.onTap});

  final IconData icone;
  final String titulo;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 4),
      leading: Icon(icone, color: AppColors.primary),
      title: Text(
        titulo,
        style: const TextStyle(
          fontFamily: 'Inter',
          color: AppColors.ink,
          fontWeight: FontWeight.w600,
        ),
      ),
      trailing: const Icon(Icons.chevron_right, color: AppColors.muted),
      onTap: onTap,
    );
  }
}
