import 'package:flutter/material.dart';

import 'tela_configuracoes.dart';

class PrivacidadeConfigPage extends StatelessWidget {
  const PrivacidadeConfigPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const EstruturaConfig(
      titulo: 'Privacidade e Visibilidade',
      subtitulo: 'Defina o que outros participantes podem ver sobre você.',
      children: [
        LinhaPreferencia(
          chave: 'perfilVisivel',
          titulo: 'Perfil visível no programa',
          descricao: 'Seu nome e foto aparecem para o seu grupo.',
        ),
        LinhaPreferencia(
          chave: 'mostrarCursoPeriodo',
          titulo: 'Mostrar curso e período',
          descricao: 'Exibe suas informações acadêmicas no perfil.',
        ),
        LinhaPreferencia(
          chave: 'mostrarInteresses',
          titulo: 'Mostrar interesses',
          descricao: 'Ajuda a encontrar pessoas com afinidades parecidas.',
        ),
        NotaConfig(
          'A coordenação do programa sempre tem acesso aos dados do seu '
          'cadastro para formar os grupos.',
        ),
      ],
    );
  }
}
