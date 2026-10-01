/// Estado de participação do usuário no programa.
enum StatusParticipacao {
  nenhuma,
  explorar,
  padrinhoEmAnalise,
  padrinhoAtivo,
  padrinhoRejeitado,
  apadrinhadoAguardandoMatch,
  apadrinhadoAtivo,
}

extension StatusParticipacaoRotulo on StatusParticipacao {
  String get titulo => switch (this) {
    StatusParticipacao.nenhuma => 'Sem participação',
    StatusParticipacao.explorar => 'Explorando o campus',
    StatusParticipacao.padrinhoEmAnalise => 'Candidatura de padrinho',
    StatusParticipacao.padrinhoAtivo => 'Padrinho ativo',
    StatusParticipacao.padrinhoRejeitado => 'Candidatura não aprovada',
    StatusParticipacao.apadrinhadoAguardandoMatch => 'Cadastro enviado',
    StatusParticipacao.apadrinhadoAtivo => 'Apadrinhado ativo',
  };

  String get selo => switch (this) {
    StatusParticipacao.padrinhoEmAnalise => 'Em análise',
    StatusParticipacao.padrinhoAtivo => 'Ativo',
    StatusParticipacao.padrinhoRejeitado => 'Não aprovada',
    StatusParticipacao.apadrinhadoAguardandoMatch => 'Aguardando match',
    StatusParticipacao.apadrinhadoAtivo => 'Ativo',
    StatusParticipacao.explorar => 'Explorar',
    StatusParticipacao.nenhuma => 'Disponível',
  };
}
