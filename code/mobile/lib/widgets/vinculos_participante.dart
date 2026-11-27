import 'package:flutter/material.dart';

import '../models/situacao_participacao.dart';
import '../theme/colors.dart';

class VinculosParticipante extends StatelessWidget {
  const VinculosParticipante({
    super.key,
    required this.dados,
    required this.onPrivado,
    required this.onGrupo,
    required this.onAtualizar,
    this.onHistorico,
    this.carregando = false,
    this.erro,
  });
  final SituacaoParticipacao? dados;
  final void Function(PessoaVinculo) onPrivado, onGrupo;
  final VoidCallback onAtualizar;
  final VoidCallback? onHistorico;
  final bool carregando;
  final String? erro;
  @override
  Widget build(BuildContext context) {
    final padrinho = dados?.situacao == 'padrinho_ativo';
    final ativo = padrinho || dados?.situacao == 'apadrinhado_ativo';
    final pessoas = ativo
        ? (padrinho ? dados!.apadrinhados : dados!.padrinhosAtuais)
        : <PessoaVinculo>[];
    final titulo = padrinho
        ? 'Meus apadrinhados'
        : pessoas.length > 1
        ? 'Meus padrinhos'
        : 'Meu padrinho';
    final estado = switch (dados?.situacao) {
      'concluido' => 'Participação encerrada neste ciclo. Seu histórico de conversas continua disponível.',
      'candidatura_rejeitada' ||
      'apadrinhado_rejeitado' => 'A participação não foi aprovada neste ciclo.',
      'candidatura_pendente' ||
      'candidatura_em_analise' ||
      'apadrinhado_pendente' => 'Aguardando análise da coordenação.',
      'candidatura_aprovada_aguardando_matching' || 'apadrinhado_aguardando' =>
        'Participação aprovada. Aguardando a definição dos vínculos.',
      'nenhuma' => 'Você não tem participação neste ciclo.',
      _ => 'Os vínculos ainda não estão disponíveis. Atualize a consulta.',
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                titulo,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  color: AppColors.primary,
                ),
              ),
            ),
            IconButton(
              onPressed: carregando ? null : onAtualizar,
              tooltip: 'Atualizar vínculos',
              icon: const Icon(Icons.refresh),
            ),
          ],
        ),
        if (carregando && dados == null)
          const Center(child: CircularProgressIndicator()),
        if (erro != null)
          Text(erro!, style: const TextStyle(color: Colors.red)),
        if (pessoas.isEmpty && !carregando) Text(estado),
        if (pessoas.isNotEmpty && dados?.conversasLiberadas != true)
          const Text(
            'As conversas estão disponíveis somente para consulta neste momento.',
          ),
        for (final p in pessoas)
          Card(
            key: ValueKey('vinculo-${p.vinculoId ?? p.email}'),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    p.nome,
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  if (p.curso.isNotEmpty)
                    Text(
                      '${p.curso}${p.periodo == null ? '' : ' · ${p.periodo}º período'}',
                    ),
                  if (p.grupo != null) Text(p.grupo!),
                  if (p.interesses.isNotEmpty)
                    Text('Interesses: ${p.interesses.join(', ')}'),
                  Wrap(
                    spacing: 8,
                    children: [
                      OutlinedButton.icon(
                        onPressed: dados?.conversasLiberadas == true
                            ? () => onPrivado(p)
                            : null,
                        icon: const Icon(Icons.chat_bubble_outline),
                        label: const Text('Conversar'),
                      ),
                      if (p.grupoId != null)
                        TextButton.icon(
                          onPressed: dados?.conversasLiberadas == true
                              ? () => onGrupo(p)
                              : null,
                          icon: const Icon(Icons.groups_outlined),
                          label: const Text('Conversa do grupo'),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        if (onHistorico != null)
          TextButton(
            onPressed: onHistorico,
            child: const Text('Ver conversas e histórico'),
          ),
      ],
    );
  }
}
