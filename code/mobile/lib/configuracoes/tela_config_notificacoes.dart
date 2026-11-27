import 'package:flutter/material.dart';

import 'tela_configuracoes.dart';

class NotificacoesConfigPage extends StatelessWidget {
  const NotificacoesConfigPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const EstruturaConfig(
      titulo: 'Notificação e Preferências',
      subtitulo: 'Escolha quais avisos você quer receber no Ajuda-aí.',
      children: [
        LinhaPreferencia(
          chave: 'notificacoesAvisos',
          titulo: 'Avisos do programa',
          descricao: 'Comunicados da coordenação, mudanças de etapa, missões novas e subida de nível.',
        ),
        LinhaPreferencia(
          chave: 'notificacoesMensagens',
          titulo: 'Novas mensagens',
          descricao: 'Quando seu padrinho ou apadrinhado enviar mensagem.',
        ),
        LinhaPreferencia(
          chave: 'notificacoesEncontros',
          titulo: 'Lembretes de encontros',
          descricao: 'Avisos antes dos encontros do seu grupo.',
        ),
        LinhaPreferencia(
          chave: 'notificacoesFeed',
          titulo: 'Novidades do feed',
          descricao: 'Publicações e eventos do campus.',
        ),
        NotaConfig('As preferências valem para esta sessão do aplicativo.'),
      ],
    );
  }
}
