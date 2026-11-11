import 'package:flutter/material.dart';

import '../theme/colors.dart';
import 'componentes_coord.dart';

/// Aba "Mais" da coordenação: atalhos para as demais seções do painel.
class TelaMaisCoord extends StatelessWidget {
  const TelaMaisCoord({
    super.key,
    required this.nomeCoordenador,
    required this.onAbrir,
    required this.onSair,
  });

  final String nomeCoordenador;

  /// Destino: feed | formularios | usuarios | matching | programas |
  /// configuracoes | sem_vinculo | totens.
  final ValueChanged<String> onAbrir;
  final VoidCallback onSair;

  static const _itens = <(IconData, String, String, String)>[
    (
      Icons.dynamic_feed_outlined,
      'Feed do programa',
      'Publicar notícias, imagens e acompanhar comentários',
      'feed',
    ),
    (
      Icons.dynamic_form_outlined,
      'Formulários',
      'Perguntas adicionais das candidaturas',
      'formularios',
    ),
    (
      Icons.people_alt_outlined,
      'Usuários',
      'Participantes, situação e vínculos',
      'usuarios',
    ),
    (
      Icons.auto_awesome,
      'Matching automático',
      'Gere e revise sugestões com os critérios do ciclo',
      'matching',
    ),
    (
      Icons.link,
      'Vínculos manuais',
      'Gerencie vínculos individuais separadamente das sugestões',
      'matching_manual',
    ),
    (
      Icons.link,
      'Apadrinhados sem vínculo',
      'Defina o padrinho de quem ainda não tem grupo',
      'sem_vinculo',
    ),
    (
      Icons.event_note_outlined,
      'Programas',
      'Etapas, inscrições e novo ciclo',
      'programas',
    ),
    (
      Icons.location_on_outlined,
      'Gerenciar totens',
      'Posição no mapa, recompensa em XP e disponibilidade',
      'totens',
    ),
    (
      Icons.map_outlined,
      'Mapa do campus',
      'Consultar locais e editar descrições e imagens',
      'mapa',
    ),
    (
      Icons.settings_outlined,
      'Configurações',
      'Conta da coordenação e sessão',
      'configuracoes',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.only(bottom: 24),
        children: [
          CabecalhoCoord(
            titulo: 'Mais opções',
            subtitulo: 'Coordenação · $nomeCoordenador',
          ),
          for (final (icone, titulo, descricao, destino) in _itens)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Material(
                color: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                  side: const BorderSide(color: AppAccents.cardBorder),
                ),
                child: ListTile(
                  onTap: () => onAbrir(destino),
                  leading: CircleAvatar(
                    backgroundColor: const Color(0xFFEBE4FF),
                    child: Icon(icone, color: AppColors.primary),
                  ),
                  title: Text(
                    titulo,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  subtitle: Text(descricao),
                  trailing: const Icon(Icons.chevron_right),
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: TextButton.icon(
              onPressed: onSair,
              icon: const Icon(Icons.logout),
              label: const Text('Sair da área da coordenação'),
              style: TextButton.styleFrom(foregroundColor: corErroCoord),
            ),
          ),
        ],
      ),
    );
  }
}
