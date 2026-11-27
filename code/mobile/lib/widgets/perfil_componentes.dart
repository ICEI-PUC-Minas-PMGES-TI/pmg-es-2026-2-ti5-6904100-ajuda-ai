import 'package:flutter/material.dart';

import '../models/situacao_participacao.dart';
import '../sessao_usuario.dart';
import '../status_participacao.dart';
import '../theme/colors.dart';

const corBordaPerfil = Color(0xFFE9E5F1);
const corBordaLilasPerfil = Color(0xFFDDD2F3);
const corFundoLilasPerfil = Color(0xFFF8F5FC);

class ChipsInteresses extends StatelessWidget {
  const ChipsInteresses({super.key, required this.interesses});

  final List<String> interesses;

  @override
  Widget build(BuildContext context) {
    if (interesses.isEmpty) return const SizedBox.shrink();
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        for (final interesse in interesses)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
            decoration: BoxDecoration(
              color: AppAccents.tileLilas,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Text(
              interesse,
              style: const TextStyle(
                fontFamily: 'Inter',
                color: AppColors.primary,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
      ],
    );
  }
}

/// Card de situação no programa, conforme o estado real da sessão.
class CardSituacaoPerfil extends StatelessWidget {
  const CardSituacaoPerfil({
    super.key,
    required this.sessao,
    required this.formatarData,
    required this.detalhesAbertos,
    required this.onVerCandidatura,
    required this.onAcompanharStatus,
    required this.onAbrirPadrinho,
    required this.onCandidatarPadrinho,
    required this.onCandidatarApadrinhado,
  });

  final SessaoUsuario sessao;
  final String Function(DateTime) formatarData;
  final bool detalhesAbertos;
  final VoidCallback onVerCandidatura;
  final VoidCallback onAcompanharStatus;
  final VoidCallback onAbrirPadrinho;
  final VoidCallback onCandidatarPadrinho;
  final VoidCallback onCandidatarApadrinhado;

  Widget _link(String texto, VoidCallback onPressed) => TextButton(
    onPressed: onPressed,
    style: TextButton.styleFrom(
      foregroundColor: AppColors.primary,
      padding: const EdgeInsets.only(right: 12),
      minimumSize: Size.zero,
      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
    ),
    child: Text(
      texto,
      style: const TextStyle(
        fontFamily: 'Inter',
        fontSize: 13,
        fontWeight: FontWeight.w600,
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final enviadaEm = sessao.candidaturaEnviadaEm;
    final programa = sessao.situacao?.programa?.codigo ?? sessao.programaAtual;
    final infoPrograma = (
      Icons.calendar_month_outlined,
      'Programa $programa',
      'Período atual',
    );
    final padrinhos = sessao.situacao?.padrinhosAtuais ?? const [];
    final padrinho = sessao.padrinho;
    final grupo = sessao.grupo;

    return switch (sessao.status) {
      StatusParticipacao.padrinhoPendente ||
      StatusParticipacao.padrinhoAguardandoMatching => CardStatusPerfil(
        titulo: sessao.status.titulo,
        selo: sessao.status.selo,
        icone: Icons.fact_check_outlined,
        descricao: sessao.status == StatusParticipacao.padrinhoPendente
            ? 'Recebemos sua candidatura. Aguarde a análise da coordenação.'
            : 'Aguardando definição do seu grupo. As atividades serão liberadas após o vínculo confirmado.',
        corSelo: AppColors.primary,
        fundoSelo: AppColors.lavender,
        infos: [infoPrograma],
        acao: _link('Acompanhar status', onAcompanharStatus),
      ),
      StatusParticipacao.padrinhoEmAnalise => CardStatusPerfil(
        titulo: 'Candidatura de padrinho',
        selo: 'Em análise',
        icone: Icons.fact_check_outlined,
        descricao:
            'Sua candidatura foi enviada e está sendo analisada pela '
            'coordenação.',
        corSelo: AppColors.primary,
        fundoSelo: AppColors.lavender,
        meta: enviadaEm == null
            ? null
            : 'Enviada em: ${formatarData(enviadaEm)}',
        acao: Wrap(
          children: [
            _link(
              detalhesAbertos ? 'Ocultar candidatura' : 'Ver candidatura',
              onVerCandidatura,
            ),
            _link('Acompanhar status', onAcompanharStatus),
          ],
        ),
      ),
      StatusParticipacao.padrinhoAtivo => CardStatusPerfil(
        titulo: 'Padrinho ativo',
        selo: 'Ativo',
        icone: Icons.groups_2_outlined,
        descricao: 'Você participa atualmente do programa de apadrinhamento.',
        corSelo: AppAccents.success,
        fundoSelo: AppAccents.successBg,
        destaque: sessao.apadrinhados.isEmpty
            ? 'Seus apadrinhados aparecerão aqui após a formação dos grupos.'
            : 'Apadrinhados: '
                  '${sessao.apadrinhados.map((p) => p.nome).join(', ')}',
        infos: [
          (
            Icons.people_outline,
            '${sessao.apadrinhados.length}',
            sessao.apadrinhados.length == 1 ? 'Apadrinhado' : 'Apadrinhados',
          ),
          (Icons.emoji_events_outlined, grupo ?? 'A definir', 'Seu grupo'),
          infoPrograma,
        ],
      ),
      StatusParticipacao.padrinhoRejeitado => CardStatusPerfil(
        titulo: 'Candidatura não aprovada',
        selo: 'Não aprovada',
        icone: Icons.info_outline,
        descricao: sessao.motivoRejeicao == null
            ? 'Sua candidatura não foi aprovada neste ciclo. Você poderá '
                  'tentar novamente em uma próxima abertura.'
            : 'Sua candidatura não foi aprovada. Motivo: '
                  '${sessao.motivoRejeicao}',
        corSelo: const Color(0xFFB45309),
        fundoSelo: const Color(0xFFFFF7ED),
        acao: Wrap(children: [_link('Ver status', onAcompanharStatus)]),
      ),
      StatusParticipacao.apadrinhadoAtivo => CardStatusPerfil(
        titulo: 'Apadrinhado ativo',
        selo: 'Ativo',
        icone: Icons.groups_outlined,
        descricao:
            'Você já está vinculado(a) ao programa e pode conversar com '
            'seu padrinho.',
        corSelo: AppAccents.success,
        fundoSelo: AppAccents.successBg,
        destaque: padrinhos.length > 1
            ? 'Padrinhos: ${padrinhos.map((p) => p.nome).join(', ')}'
            : padrinho == null
            ? null
            : 'Padrinho: ${padrinho.nome}',
        onTap: onAbrirPadrinho,
        infos: [
          (
            Icons.person_outline,
            '${padrinhos.length}',
            padrinhos.length == 1 ? 'Padrinho' : 'Padrinhos',
          ),
          (Icons.emoji_events_outlined, grupo ?? 'A definir', 'Seu grupo'),
          infoPrograma,
        ],
      ),
      StatusParticipacao.apadrinhadoPendente => CardStatusPerfil(
        titulo: 'Cadastro em análise',
        selo: 'Aguardando aprovação',
        icone: Icons.fact_check_outlined,
        descricao:
            'Recebemos seu cadastro de apadrinhado. Ele aguarda a aprovação '
            'da coordenação; depois disso você entra na formação dos grupos.',
        corSelo: AppColors.primary,
        fundoSelo: AppColors.lavender,
        meta: enviadaEm == null
            ? null
            : 'Enviado em: ${formatarData(enviadaEm)}',
        infos: [
          infoPrograma,
          (Icons.hourglass_empty, 'Aguardando', 'aprovação'),
          (Icons.school_outlined, '${sessao.periodo}º período', 'Seu semestre'),
        ],
      ),
      StatusParticipacao.apadrinhadoRejeitado => CardStatusPerfil(
        titulo: 'Cadastro não aprovado',
        selo: 'Não aprovado',
        icone: Icons.info_outline,
        descricao: sessao.motivoRejeicao == null
            ? 'A coordenação não aprovou seu cadastro. Em caso de dúvida, '
                  'procure a coordenação do programa.'
            : 'A coordenação não aprovou seu cadastro. Motivo: '
                  '${sessao.motivoRejeicao}',
        corSelo: const Color(0xFFB45309),
        fundoSelo: const Color(0xFFFFF7ED),
      ),
      StatusParticipacao.apadrinhadoAguardandoMatch => CardStatusPerfil(
        titulo: 'Aprovado — aguardando matching',
        selo: 'Aguardando matching',
        icone: Icons.person_search_outlined,
        descricao:
            'Seu cadastro foi aprovado. Estamos buscando o '
            'melhor match para você.',
        corSelo: AppColors.primary,
        fundoSelo: AppColors.lavender,
        meta: enviadaEm == null
            ? null
            : 'Enviado em: ${formatarData(enviadaEm)}',
        infos: [
          infoPrograma,
          (Icons.search, 'Matching em', 'andamento'),
          (Icons.school_outlined, '${sessao.periodo}º período', 'Seu semestre'),
        ],
      ),
      StatusParticipacao.concluido => const CardStatusPerfil(
        titulo: 'Participação concluída',
        selo: 'Concluída',
        icone: Icons.verified_outlined,
        descricao:
            'Você concluiu sua participação neste ciclo. Obrigado por fazer '
            'parte do Ajuda-aí!',
        corSelo: AppColors.primary,
        fundoSelo: AppColors.lavender,
      ),
      StatusParticipacao.explorar ||
      StatusParticipacao.nenhuma => OpcoesParticipar(
        podePadrinho: sessao.podeCandidatarPadrinho,
        podeApadrinhado: sessao.podeCandidatarApadrinhado,
        onPadrinho: onCandidatarPadrinho,
        onApadrinhado: onCandidatarApadrinhado,
      ),
    };
  }
}

class CardStatusPerfil extends StatelessWidget {
  const CardStatusPerfil({
    super.key,
    required this.titulo,
    required this.selo,
    required this.descricao,
    required this.corSelo,
    required this.fundoSelo,
    this.icone,
    this.meta,
    this.acao,
    this.destaque,
    this.infos = const [],
    this.onTap,
  });

  final String titulo;
  final String selo;
  final String descricao;
  final Color corSelo;
  final Color fundoSelo;
  final IconData? icone;
  final String? meta;
  final Widget? acao;
  final String? destaque;
  final List<(IconData, String, String)> infos;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final sucesso = corSelo == AppAccents.success;
    final fundo = sucesso
        ? AppAccents.successBg.withValues(alpha: 0.55)
        : corFundoLilasPerfil;
    final borda = sucesso
        ? AppAccents.success.withValues(alpha: 0.25)
        : corBordaLilasPerfil;
    final faixa = sucesso ? AppAccents.success : AppColors.primary;

    final conteudo = Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (icone != null) ...[
                CircleAvatar(
                  radius: 22,
                  backgroundColor: Colors.white,
                  child: Icon(icone, color: faixa, size: 24),
                ),
                const SizedBox(width: 12),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(
                          titulo,
                          style: const TextStyle(
                            color: AppColors.ink,
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: fundoSelo,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            selo,
                            style: TextStyle(
                              fontFamily: 'Inter',
                              color: corSelo,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      descricao,
                      style: const TextStyle(
                        fontFamily: 'Inter',
                        color: AppColors.muted,
                        fontSize: 13,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
              if (onTap != null)
                const Icon(Icons.chevron_right, color: AppColors.muted),
            ],
          ),
          if (destaque != null) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                destaque!,
                style: const TextStyle(
                  fontFamily: 'Inter',
                  color: AppColors.ink,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
          if (infos.isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 10),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final (icone, valor, rotulo) in infos)
                    Expanded(
                      child: Column(
                        children: [
                          Icon(icone, size: 20, color: AppColors.primary),
                          const SizedBox(height: 4),
                          Text(
                            valor,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontFamily: 'Inter',
                              color: AppColors.ink,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          Text(
                            rotulo,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontFamily: 'Inter',
                              color: AppColors.muted,
                              fontSize: 11,
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ],
          if (meta != null) ...[
            const SizedBox(height: 10),
            Text(
              meta!,
              style: const TextStyle(
                fontFamily: 'Inter',
                color: AppColors.ink,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          if (acao != null) ...[const SizedBox(height: 8), acao!],
        ],
      ),
    );

    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Material(
        color: fundo,
        child: InkWell(
          onTap: onTap,
          child: Container(
            width: double.infinity,
            decoration: BoxDecoration(
              border: Border.all(color: borda),
              borderRadius: BorderRadius.circular(12),
            ),
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(width: 4, color: faixa),
                  Expanded(child: conteudo),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class OpcoesParticipar extends StatelessWidget {
  const OpcoesParticipar({
    super.key,
    required this.podePadrinho,
    required this.podeApadrinhado,
    required this.onPadrinho,
    required this.onApadrinhado,
  });

  final bool podePadrinho;
  final bool podeApadrinhado;
  final VoidCallback onPadrinho;
  final VoidCallback onApadrinhado;

  @override
  Widget build(BuildContext context) {
    if (!podePadrinho && !podeApadrinhado) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: corBordaPerfil),
        ),
        child: const Text(
          'No momento não há inscrição aberta para o seu perfil acadêmico.',
          style: TextStyle(
            fontFamily: 'Inter',
            color: AppColors.muted,
            fontSize: 13,
            height: 1.4,
          ),
        ),
      );
    }

    return Column(
      children: [
        if (podeApadrinhado)
          _OpcaoSimples(
            titulo: 'Quero ser apadrinhado',
            descricao:
                'As inscrições estão abertas. Receba orientação de um '
                'aluno mais experiente.',
            onTap: onApadrinhado,
          ),
        if (podeApadrinhado && podePadrinho) const SizedBox(height: 8),
        if (podePadrinho)
          _OpcaoSimples(
            titulo: 'Quero ser padrinho',
            descricao:
                'Você já passou do 1º período e pode apoiar novos alunos.',
            onTap: onPadrinho,
          ),
      ],
    );
  }
}

class _OpcaoSimples extends StatelessWidget {
  const _OpcaoSimples({
    required this.titulo,
    required this.descricao,
    required this.onTap,
  });

  final String titulo;
  final String descricao;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: corBordaPerfil),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      titulo,
                      style: const TextStyle(
                        fontFamily: 'Inter',
                        color: AppColors.ink,
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      descricao,
                      style: const TextStyle(
                        fontFamily: 'Inter',
                        color: AppColors.muted,
                        fontSize: 12,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: AppColors.muted),
            ],
          ),
        ),
      ),
    );
  }
}

/// "Minha jornada": indicadores reais da participação (sem números fictícios).
class SecaoJornada extends StatelessWidget {
  const SecaoJornada({
    super.key,
    required this.sessao,
    required this.onVerHistorico,
    required this.formatarData,
  });

  final SessaoUsuario sessao;
  final VoidCallback onVerHistorico;
  final String Function(DateTime) formatarData;

  @override
  Widget build(BuildContext context) {
    final ProgramaSituacao? programa = sessao.situacao?.programa;
    final status = sessao.status;
    final ehPadrinho =
        status == StatusParticipacao.padrinhoAtivo || status.candidatura;
    final enviada = sessao.candidaturaEnviadaEm;

    final tiles = <(IconData, Color, Color, String, String)>[
      (
        Icons.calendar_month_outlined,
        AppAccents.tileAzul,
        AppAccents.iconeAzul,
        programa?.codigo ?? sessao.programaAtual,
        'Programa',
      ),
      (
        Icons.flag_outlined,
        AppAccents.tileLaranja,
        AppAccents.iconeLaranja,
        programa?.statusRotulo ?? 'A definir',
        'Etapa do programa',
      ),
      (
        Icons.groups_outlined,
        AppAccents.tileLilas,
        AppColors.primary,
        sessao.grupo ?? 'A definir',
        'Grupo',
      ),
      if (status == StatusParticipacao.padrinhoAtivo)
        (
          Icons.people_outline,
          AppAccents.tileVerde,
          AppAccents.iconeVerde,
          '${sessao.apadrinhados.length}',
          'Apadrinhados',
        )
      else if (ehPadrinho)
        (
          Icons.event_available_outlined,
          AppAccents.tileVerde,
          AppAccents.iconeVerde,
          enviada == null ? '—' : formatarData(enviada),
          'Candidatura enviada',
        )
      else
        (
          Icons.person_outline,
          AppAccents.tileVerde,
          AppAccents.iconeVerde,
          sessao.padrinho?.nome.split(' ').first ?? 'A definir',
          'Seu padrinho',
        ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Expanded(
              child: Text(
                'Minha jornada',
                style: TextStyle(
                  color: AppColors.ink,
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            TextButton(
              onPressed: onVerHistorico,
              style: TextButton.styleFrom(foregroundColor: AppColors.primary),
              child: const Text(
                'Ver histórico ›',
                style: TextStyle(
                  fontFamily: 'Inter',
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        LayoutBuilder(
          builder: (context, constraints) {
            final colunas = constraints.maxWidth >= 520 ? 4 : 2;
            final largura =
                (constraints.maxWidth - 8 * (colunas - 1)) / colunas;
            return Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final (icone, fundo, cor, valor, rotulo) in tiles)
                  Container(
                    width: largura,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: corBordaPerfil),
                    ),
                    child: Row(
                      children: [
                        CircleAvatar(
                          radius: 18,
                          backgroundColor: fundo,
                          child: Icon(icone, size: 18, color: cor),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                valor,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontFamily: 'Inter',
                                  color: AppColors.ink,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              Text(
                                rotulo,
                                maxLines: 2,
                                style: const TextStyle(
                                  fontFamily: 'Inter',
                                  color: AppColors.muted,
                                  fontSize: 11,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}

class ItemAcessoRapido {
  const ItemAcessoRapido(this.icone, this.titulo, this.onTap);

  final IconData icone;
  final String titulo;
  final VoidCallback onTap;
}

class AcessosRapidos extends StatelessWidget {
  const AcessosRapidos({super.key, required this.itens});

  final List<ItemAcessoRapido> itens;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: corBordaPerfil),
      ),
      child: Column(
        children: [
          for (final (i, item) in itens.indexed) ...[
            if (i > 0) const Divider(height: 1, color: corBordaPerfil),
            ListTile(
              onTap: item.onTap,
              leading: Icon(item.icone, color: AppColors.ink),
              title: Text(
                item.titulo,
                style: const TextStyle(
                  fontFamily: 'Inter',
                  color: AppColors.ink,
                  fontSize: 14,
                ),
              ),
              trailing: const Icon(Icons.chevron_right, color: AppColors.muted),
            ),
          ],
        ],
      ),
    );
  }
}

/// Card "Enquanto isso" do design (p17a).
class CardEnquantoIsso extends StatelessWidget {
  const CardEnquantoIsso({super.key, required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: corFundoLilasPerfil,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: corBordaLilasPerfil),
          ),
          child: const Row(
            children: [
              CircleAvatar(
                radius: 22,
                backgroundColor: AppAccents.tileLilas,
                child: Icon(Icons.map_outlined, color: AppColors.primary),
              ),
              SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'ENQUANTO ISSO',
                      style: TextStyle(
                        fontFamily: 'Inter',
                        color: AppColors.primary,
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.4,
                      ),
                    ),
                    Text(
                      'Conheça as PUC Stops',
                      style: TextStyle(
                        color: AppColors.ink,
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: AppColors.primary),
            ],
          ),
        ),
      ),
    );
  }
}
