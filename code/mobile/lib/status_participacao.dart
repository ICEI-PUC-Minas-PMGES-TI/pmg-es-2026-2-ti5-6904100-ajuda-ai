/// Estado de participação do usuário no programa.
enum StatusParticipacao {
  nenhuma,
  explorar,
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
    StatusParticipacao.padrinhoEmAnalise => 'Candidatura de padrinho',
    StatusParticipacao.padrinhoAtivo => 'Padrinho ativo',
    StatusParticipacao.padrinhoRejeitado => 'Candidatura não aprovada',
    StatusParticipacao.apadrinhadoPendente => 'Cadastro em análise',
    StatusParticipacao.apadrinhadoRejeitado => 'Cadastro não aprovado',
    StatusParticipacao.apadrinhadoAguardandoMatch => 'Aguardando padrinho',
    StatusParticipacao.apadrinhadoAtivo => 'Apadrinhado ativo',
    StatusParticipacao.concluido => 'Participação concluída',
  };

  String get selo => switch (this) {
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

/// Converte a `situacao` de `GET /participacoes/situacao` no estado do app.
///
/// `candidatura_pendente` e `candidatura_em_analise` viram o mesmo estado
/// ([StatusParticipacao.padrinhoEmAnalise]): para o aluno, as duas significam
/// "aguardando a coordenação". A diferença fina fica em
/// `SessaoUsuario.situacao` e aparece na tela de status da candidatura.
///
/// Devolve `null` para `nenhuma` (o app decide se mantém o estado local).
StatusParticipacao? statusDaSituacao(String situacao) => switch (situacao) {
  'candidatura_pendente' ||
  'candidatura_em_analise' => StatusParticipacao.padrinhoEmAnalise,
  'candidatura_rejeitada' => StatusParticipacao.padrinhoRejeitado,
  'padrinho_ativo' => StatusParticipacao.padrinhoAtivo,
  'apadrinhado_pendente' => StatusParticipacao.apadrinhadoPendente,
  'apadrinhado_rejeitado' => StatusParticipacao.apadrinhadoRejeitado,
  'apadrinhado_aguardando' => StatusParticipacao.apadrinhadoAguardandoMatch,
  'apadrinhado_ativo' => StatusParticipacao.apadrinhadoAtivo,
  'concluido' => StatusParticipacao.concluido,
  _ => null,
};
