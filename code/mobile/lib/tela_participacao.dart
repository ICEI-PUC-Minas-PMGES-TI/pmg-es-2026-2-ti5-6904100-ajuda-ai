import 'package:flutter/material.dart';

import 'dados_cadastro.dart';
import 'sessao_usuario.dart';
import 'tela_cadastro_padrinho.dart';
import 'tela_cadastro_perfil.dart';
import 'tela_mapa.dart';
import 'theme/colors.dart';
import 'widgets/campos_cadastro.dart';

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

class ParticipacaoPage extends StatefulWidget {
  const ParticipacaoPage({super.key, required this.dados});

  final DadosCadastro dados;

  @override
  State<ParticipacaoPage> createState() => _ParticipacaoPageState();
}

class _ParticipacaoPageState extends State<ParticipacaoPage> {
  Participacao? _escolha;

  void _continuar() {
    if (_escolha?.bloqueio(widget.dados.periodo) != null) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(
            content: Text('Essa opção não está disponível para você.'),
          ),
        );
      return;
    }

    final sessao = SessaoUsuario.atual;
    if (_escolha != null &&
        _escolha != Participacao.explorar &&
        !(_escolha == Participacao.padrinho
            ? sessao.podeCandidatarPadrinho
            : sessao.podeCandidatarApadrinhado)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Inscrição indisponível neste ciclo. Consulte seu perfil.',
          ),
        ),
      );
      return;
    }

    switch (_escolha) {
      case null:
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(
            const SnackBar(content: Text('Escolha uma opção para continuar.')),
          );
      case Participacao.apadrinhado:
        SessaoUsuario.atual.iniciarCadastro(
          dadosCadastro: widget.dados,
          escolha: Participacao.apadrinhado,
        );
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => PerfilCadastroPage(dados: widget.dados),
          ),
        );
      case Participacao.padrinho:
        SessaoUsuario.atual.iniciarCadastro(
          dadosCadastro: widget.dados,
          escolha: Participacao.padrinho,
        );
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => CadastroPadrinhoPage(dados: widget.dados),
          ),
        );
      case Participacao.explorar:
        SessaoUsuario.atual.definir(
          dadosCadastro: widget.dados,
          escolha: Participacao.explorar,
        );
        Navigator.of(context).pushAndRemoveUntil(
          MaterialPageRoute(builder: (_) => const MapaPage()),
          (_) => false,
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    return EstruturaCadastro(
      children: [
        const TituloPasso(
          passo: 2,
          total: 3,
          titulo: 'Como você quer participar?',
          subtitulo: 'Escolha a opção que mais combina com você neste momento.',
        ),
        if (SessaoUsuario.atual.programas.isNotEmpty)
          DropdownButton<String>(
            hint: const Text('Selecione o ciclo'),
            value:
                SessaoUsuario.atual.programas.any(
                  (p) => p['codigo'] == SessaoUsuario.atual.programaAtual,
                )
                ? SessaoUsuario.atual.programaAtual
                : null,
            items: SessaoUsuario.atual.programas
                .map(
                  (p) => DropdownMenuItem(
                    value: p['codigo'] as String,
                    child: Text('${p['titulo']}'),
                  ),
                )
                .toList(),
            onChanged: (codigo) async {
              if (codigo == null) return;
              try {
                await SessaoUsuario.atual.selecionarPrograma(codigo);
                if (mounted) setState(() {});
              } catch (erro) {
                if (mounted) {
                  ScaffoldMessenger.of(this.context)
                      .showSnackBar(SnackBar(content: Text('$erro')));
                }
              }
            },
          ),
        const SizedBox(height: 18),
        for (final opcao in Participacao.values)
          _CardOpcao(
            opcao: opcao,
            selecionada: _escolha == opcao,
            bloqueio: opcao.bloqueio(widget.dados.periodo),
            onTap: () =>
                setState(() => _escolha = _escolha == opcao ? null : opcao),
          ),
        const SizedBox(height: 12),
        BotaoCadastro(texto: 'Continuar', onPressed: _continuar),
      ],
    );
  }
}

class _CardOpcao extends StatelessWidget {
  const _CardOpcao({
    required this.opcao,
    required this.selecionada,
    required this.bloqueio,
    required this.onTap,
  });

  final Participacao opcao;
  final bool selecionada;
  final Bloqueio? bloqueio;
  final VoidCallback onTap;

  bool get _bloqueada => bloqueio != null;

  @override
  Widget build(BuildContext context) {
    final corTexto = _bloqueada ? AppColors.muted : AppColors.ink;
    final corIcone = _bloqueada ? AppColors.muted : AppColors.primary;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: _bloqueada
            ? AppAccents.cardBg
            : selecionada
            ? AppColors.lavender
            : Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(
            color: selecionada
                ? (_bloqueada ? AppAccents.iconeLaranja : AppColors.primary)
                : AppAccents.cardBorder,
            width: selecionada ? 1.5 : 1.2,
          ),
        ),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              children: [
                Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: _bloqueada
                            ? AppAccents.cardBorder
                            : AppAccents.tileLilas,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(opcao.icone, color: corIcone),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            opcao.titulo,
                            style: TextStyle(
                              fontFamily: 'Inter',
                              color: corTexto,
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            bloqueio?.resumo ?? opcao.descricao,
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
                    Icon(
                      selecionada
                          ? Icons.keyboard_arrow_up_rounded
                          : _bloqueada
                          ? Icons.lock_outline
                          : Icons.chevron_right_rounded,
                      color: corIcone,
                      size: _bloqueada && !selecionada ? 20 : 24,
                    ),
                  ],
                ),
                if (selecionada) ...[
                  const Divider(height: 22, color: AppAccents.cardBorder),
                  for (final item in bloqueio?.motivos ?? opcao.beneficios)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Row(
                        children: [
                          Icon(
                            _bloqueada ? Icons.info : Icons.check_circle,
                            size: 18,
                            color: _bloqueada
                                ? AppAccents.iconeLaranja
                                : AppAccents.success,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              item,
                              style: const TextStyle(
                                fontFamily: 'Inter',
                                color: AppColors.ink,
                                fontSize: 12,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
