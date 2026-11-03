/// Estado de participação do usuário no programa.
enum StatusParticipacao {
  nenhuma,
  explorar,
  padrinhoPendente,
  padrinhoAguardandoMatching,
  padrinhoEmAnalise,
  padrinhoAtivo,
  padrinhoRejeitado,
  apadrinhadoPendente,
  apadrinhadoRejeitado,
  apadrinhadoAguardandoMatch,
  apadrinhadoAtivo,
  concluido,
}

extension StatusParticipacaoRotulo on StatusParticipacao {
  String get titulo => switch (this) {
    StatusParticipacao.nenhuma => 'Sem participação',
    StatusParticipacao.explorar => 'Explorando o campus',
    StatusParticipacao.padrinhoPendente => 'Candidatura recebida',
    StatusParticipacao.padrinhoAguardandoMatching => 'Candidatura aprovada',
    StatusParticipacao.padrinhoEmAnalise => 'Candidatura em análise',
    StatusParticipacao.padrinhoAtivo => 'Padrinho ativo',
    StatusParticipacao.padrinhoRejeitado => 'Candidatura não aprovada',
    StatusParticipacao.apadrinhadoPendente => 'Cadastro em análise',
    StatusParticipacao.apadrinhadoRejeitado => 'Cadastro não aprovado',
    StatusParticipacao.apadrinhadoAguardandoMatch =>
      'Aprovado — aguardando matching',
    StatusParticipacao.apadrinhadoAtivo => 'Apadrinhado ativo',
    StatusParticipacao.concluido => 'Participação concluída',
  };

  String get selo => switch (this) {
    StatusParticipacao.padrinhoPendente => 'Recebida',
    StatusParticipacao.padrinhoAguardandoMatching =>
      'Aguardando definição do seu grupo',
    StatusParticipacao.padrinhoEmAnalise => 'Em análise',
    StatusParticipacao.padrinhoAtivo => 'Ativo',
    StatusParticipacao.padrinhoRejeitado => 'Não aprovada',
    StatusParticipacao.apadrinhadoPendente => 'Aguardando aprovação',
    StatusParticipacao.apadrinhadoRejeitado => 'Não aprovado',
    StatusParticipacao.apadrinhadoAguardandoMatch => 'Aguardando match',
    StatusParticipacao.apadrinhadoAtivo => 'Ativo',
    StatusParticipacao.explorar => 'Explorar',
    StatusParticipacao.nenhuma => 'Disponível',
    StatusParticipacao.concluido => 'Concluída',
  };

  /// Participa (ou tentou participar) do ciclo atual.
  bool get participa =>
      this != StatusParticipacao.nenhuma && this != StatusParticipacao.explorar;
}

/// A situação da API é a única autoridade para participação.
StatusParticipacao statusDaSituacao(String situacao) => switch (situacao) {
  'candidatura_pendente' => StatusParticipacao.padrinhoPendente,
  'candidatura_em_analise' => StatusParticipacao.padrinhoEmAnalise,
  'candidatura_aprovada_aguardando_matching' =>
    StatusParticipacao.padrinhoAguardandoMatching,
  'candidatura_rejeitada' => StatusParticipacao.padrinhoRejeitado,
  'padrinho_ativo' => StatusParticipacao.padrinhoAtivo,
  'apadrinhado_pendente' => StatusParticipacao.apadrinhadoPendente,
  'apadrinhado_rejeitado' => StatusParticipacao.apadrinhadoRejeitado,
  'apadrinhado_aguardando' => StatusParticipacao.apadrinhadoAguardandoMatch,
  'apadrinhado_ativo' => StatusParticipacao.apadrinhadoAtivo,
  'concluido' => StatusParticipacao.concluido,
  _ => StatusParticipacao.nenhuma,
};

extension PermissoesParticipacao on StatusParticipacao {
  bool get ativo =>
      this == StatusParticipacao.padrinhoAtivo ||
      this == StatusParticipacao.apadrinhadoAtivo;
  bool get candidatura => const {
    StatusParticipacao.padrinhoPendente,
    StatusParticipacao.padrinhoEmAnalise,
    StatusParticipacao.padrinhoRejeitado,
    StatusParticipacao.padrinhoAguardandoMatching,
  }.contains(this);
  bool get semInscricao =>
      this == StatusParticipacao.nenhuma || this == StatusParticipacao.explorar;
}
