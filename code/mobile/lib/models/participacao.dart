import 'package:flutter/material.dart';

enum Participacao {
  padrinho(
    icone: Icons.groups_outlined,
    titulo: 'Quero ser padrinho',
    descricao: 'Quero apoiar novos alunos e compartilhar minha experiência.',
    beneficios: [
      'Conecte-se com novos alunos',
      'Compartilhe sua experiência',
      'Contribua para uma PUC mais acolhedora',
    ],
  ),
  apadrinhado(
    icone: Icons.person_outline,
    titulo: 'Quero ser apadrinhado',
    descricao: 'Quero receber orientação de um aluno mais experiente.',
    beneficios: [
      'Tenha alguém para tirar suas dúvidas',
      'Conheça a rotina da PUC com mais facilidade',
      'Faça parte de um grupo desde o início',
    ],
  ),
  explorar(
    icone: Icons.explore_outlined,
    titulo: 'Quero apenas explorar o campus',
    descricao: 'Quero conhecer o sistema e os recursos disponíveis.',
    beneficios: [
      'Use o mapa do campus',
      'Descubra os PUC Stops',
      'Participe do programa quando quiser',
    ],
  );

  const Participacao({
    required this.icone,
    required this.titulo,
    required this.descricao,
    required this.beneficios,
  });

  final IconData icone;
  final String titulo;
  final String descricao;
  final List<String> beneficios;

  Bloqueio? bloqueio(int periodo) => switch (this) {
    padrinho when periodo == 1 => const Bloqueio(
      resumo: 'Essa opção fica disponível mais para frente.',
      motivos: [
        'Padrinhos são alunos que já conhecem a rotina da PUC',
        'Agora é a sua vez de ser recebido no programa',
        'Nos próximos semestres, você poderá se candidatar',
      ],
    ),
    apadrinhado when periodo > 1 => const Bloqueio(
      resumo: 'Essa opção é para quem está chegando na PUC.',
      motivos: [
        'O apadrinhamento é pensado para os calouros',
        'Sua experiência pode fazer diferença para eles',
        'Que tal se candidatar para ser padrinho?',
      ],
    ),
    _ => null,
  };
}

class Bloqueio {
  const Bloqueio({required this.resumo, required this.motivos});

  final String resumo;
  final List<String> motivos;
}
