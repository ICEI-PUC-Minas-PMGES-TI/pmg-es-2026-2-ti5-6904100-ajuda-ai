import 'package:flutter/material.dart';

import 'widgets/abrir_conversas.dart';
import 'widgets/vinculos_participante.dart';
import 'widgets/revalidar_participacao.dart';

import 'models/situacao_participacao.dart';
import 'sessao_usuario.dart';
import 'theme/colors.dart';
import 'widgets/cabecalho_logos.dart';
import 'widgets/campos_cadastro.dart';

class Padrinho {
  const Padrinho({
    required this.nome,
    required this.curso,
    required this.sobre,
    this.interesses = const [],
    this.online = false,
    this.email = '',
    this.periodo,
    this.grupo,
  });

  factory Padrinho.daPessoa(PessoaVinculo pessoa) => Padrinho(
    nome: pessoa.nome,
    curso: pessoa.curso,
    email: pessoa.email,
    periodo: pessoa.periodo,
    grupo: pessoa.grupo,
    interesses: pessoa.interesses,
    sobre: pessoa.interesses.isEmpty
        ? 'Padrinho do programa Ajuda-aí.'
        : 'Interesses: ${pessoa.interesses.join(', ')}.',
  );

  final String nome;
  final String curso;
  final String sobre;
  final List<String> interesses;
  final bool online;
  final String email;
  final int? periodo;
  final String? grupo;

  String get iniciais => nome
      .split(' ')
      .where((parte) => parte.isNotEmpty)
      .take(2)
      .map((parte) => parte[0].toUpperCase())
      .join();
}

/// "Seu padrinho foi definido!" com o padrinho real de
/// `GET /participacoes/situacao`. Sem padrinho, mostra o estado de espera.
class PadrinhoDefinidoPage extends StatefulWidget {
  const PadrinhoDefinidoPage({super.key, this.padrinho});

  /// Força um padrinho (testes/prévia). Se null, usa o da sessão.
  final Padrinho? padrinho;

  @override
  State<PadrinhoDefinidoPage> createState() => _PadrinhoDefinidoPageState();
}

class _PadrinhoDefinidoPageState extends State<PadrinhoDefinidoPage> {
  bool _carregando = false;

  @override
  void initState() {
    super.initState();
    if (widget.padrinho == null) {
      _carregando = SessaoUsuario.atual.padrinho == null;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        SessaoUsuario.atual.sincronizarSituacao().then((_) {
          if (mounted) setState(() => _carregando = false);
        });
      });
    }
  }

  Padrinho? get _padrinho {
    if (widget.padrinho != null) return widget.padrinho;
    final pessoa = SessaoUsuario.atual.padrinho;
    return pessoa == null ? null : Padrinho.daPessoa(pessoa);
  }

  void _verPerfil(Padrinho padrinho) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      builder: (_) => _PerfilPadrinhoSheet(padrinho: padrinho),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (widget.padrinho == null) {
      return RevalidarParticipacao(
        atualizar: () => SessaoUsuario.atual.sincronizarSituacao(),
        child: ListenableBuilder(
          listenable: SessaoUsuario.atual.mudancas,
          builder: (context, _) {
            final sessao = SessaoUsuario.atual;
            return Scaffold(
              appBar: AppBar(title: const Text('Meus vínculos')),
              body: SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: VinculosParticipante(
                  dados: sessao.situacao,
                  carregando: _carregando && sessao.situacao == null,
                  erro: sessao.estadoSituacao == EstadoSituacao.erro
                      ? sessao.erroSituacao ?? 'Não foi possível atualizar os vínculos. Tente novamente.'
                      : null,
                  onAtualizar: () => sessao.sincronizarSituacao(forcar: true),
                  onPrivado: (p) => abrirConversas(
                    context,
                    focoEmail: p.email,
                    focoVinculo: p.vinculoId,
                  ),
                  onGrupo: (p) => abrirConversas(context, focoGrupo: p.grupoId),
                  onHistorico: () => abrirConversas(context),
                ),
              ),
            );
          },
        ),
      );
    }
    final padrinho = _padrinho;
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const CabecalhoLogos(),
              const SizedBox(height: 20),
              if (padrinho == null && _carregando)
                const Padding(
                  padding: EdgeInsets.only(top: 80),
                  child: Center(
                    child: CircularProgressIndicator(color: AppColors.primary),
                  ),
                )
              else if (padrinho == null)
                const _SemPadrinho()
              else ...[
                const _Destaque(),
                const SizedBox(height: 18),
                _CardPadrinho(padrinho: padrinho),
                const SizedBox(height: 14),
                _ProximosPassos(
                  onMensagem: () =>
                      abrirConversas(context, focoEmail: padrinho.email),
                  onPerfil: () => _verPerfil(padrinho),
                ),
                const SizedBox(height: 14),
                _VinculoAtivo(
                  grupo: padrinho.grupo ?? SessaoUsuario.atual.grupo,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _SemPadrinho extends StatelessWidget {
  const _SemPadrinho();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const SizedBox(height: 24),
        Container(
          width: 96,
          height: 96,
          decoration: const BoxDecoration(
            color: AppAccents.tileLilas,
            shape: BoxShape.circle,
          ),
          child: const Icon(
            Icons.hourglass_top_rounded,
            size: 44,
            color: AppColors.primary,
          ),
        ),
        const SizedBox(height: 18),
        const Text(
          'Seu padrinho ainda não foi definido',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: AppColors.ink,
            fontSize: 22,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'A coordenação está formando os grupos. Você será avisado(a) assim '
          'que o seu padrinho for definido.',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontFamily: 'Inter',
            color: AppColors.muted,
            fontSize: 13,
            height: 1.4,
          ),
        ),
        const SizedBox(height: 22),
        TextButton(
          onPressed: () => Navigator.of(context).maybePop(),
          child: const Text('Voltar'),
        ),
      ],
    );
  }
}

class _PerfilPadrinhoSheet extends StatelessWidget {
  const _PerfilPadrinhoSheet({required this.padrinho});

  final Padrinho padrinho;

  @override
  Widget build(BuildContext context) {
    final linhas = <(IconData, String, String)>[
      (Icons.school_outlined, 'Curso', padrinho.curso),
      if (padrinho.periodo != null)
        (Icons.bar_chart_rounded, 'Período', '${padrinho.periodo}º período'),
      if (padrinho.email.isNotEmpty)
        (Icons.mail_outline, 'E-mail institucional', padrinho.email),
      if (padrinho.grupo != null)
        (Icons.groups_outlined, 'Grupo', padrinho.grupo!),
    ];
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 28,
                  backgroundColor: AppAccents.tileLilas,
                  child: Text(
                    padrinho.iniciais,
                    style: const TextStyle(
                      color: AppColors.primary,
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        padrinho.nome,
                        style: const TextStyle(
                          color: AppColors.ink,
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const Text(
                        'Seu padrinho no Ajuda-aí',
                        style: TextStyle(
                          fontFamily: 'Inter',
                          color: AppColors.muted,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            for (final (icone, rotulo, valor) in linhas)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: Icon(icone, color: AppColors.primary),
                title: Text(
                  rotulo,
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.muted,
                    fontSize: 12,
                  ),
                ),
                subtitle: Text(
                  valor,
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.ink,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            if (padrinho.interesses.isNotEmpty) ...[
              const SizedBox(height: 6),
              const Text(
                'Interesses',
                style: TextStyle(
                  fontFamily: 'Inter',
                  color: AppColors.muted,
                  fontSize: 12,
                ),
              ),
              const SizedBox(height: 6),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final interesse in padrinho.interesses)
                    Chip(
                      label: Text(interesse),
                      backgroundColor: AppAccents.tileLilas,
                      side: BorderSide.none,
                      labelStyle: const TextStyle(
                        fontFamily: 'Inter',
                        color: AppColors.primary,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Destaque extends StatelessWidget {
  const _Destaque();

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Seu padrinho foi definido!',
                style: TextStyle(
                  color: AppColors.ink,
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.4,
                  height: 1.1,
                ),
              ),
              SizedBox(height: 8),
              Text(
                'Sua conexão no Ajuda-aí foi criada com sucesso. Agora você '
                'já pode iniciar essa jornada com seu padrinho!',
                style: TextStyle(
                  fontFamily: 'Inter',
                  color: AppColors.muted,
                  fontSize: 13,
                  height: 1.4,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 12),
        // TODO: usar a ilustração do Figma.
        Container(
          width: 96,
          height: 96,
          decoration: const BoxDecoration(
            color: AppAccents.tileLilas,
            shape: BoxShape.circle,
          ),
          child: const Icon(
            Icons.handshake_outlined,
            size: 48,
            color: AppColors.primary,
          ),
        ),
      ],
    );
  }
}

class _CardPadrinho extends StatelessWidget {
  const _CardPadrinho({required this.padrinho});

  final Padrinho padrinho;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: EstiloCampo.decoracao(),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Stack(
            children: [
              CircleAvatar(
                radius: 34,
                backgroundColor: AppAccents.tileLilas,
                child: Text(
                  padrinho.iniciais,
                  style: const TextStyle(
                    color: AppColors.primary,
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              if (padrinho.online)
                Positioned(
                  right: 2,
                  bottom: 2,
                  child: Container(
                    width: 14,
                    height: 14,
                    decoration: BoxDecoration(
                      color: AppAccents.success,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 2),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  padrinho.nome,
                  style: const TextStyle(
                    color: AppColors.ink,
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                Text(
                  padrinho.curso,
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.muted,
                    fontSize: 12,
                  ),
                ),
                if (padrinho.online) ...[
                  const SizedBox(height: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: AppAccents.successBg,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Text(
                      'Online',
                      style: TextStyle(
                        fontFamily: 'Inter',
                        color: AppAccents.success,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 8),
                Text(
                  padrinho.sobre,
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.ink,
                    fontSize: 12,
                    height: 1.35,
                  ),
                ),
                if (padrinho.interesses.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (final interesse in padrinho.interesses)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: AppAccents.tileLilas,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            interesse,
                            style: const TextStyle(
                              fontFamily: 'Inter',
                              color: AppColors.primary,
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ProximosPassos extends StatelessWidget {
  const _ProximosPassos({required this.onMensagem, required this.onPerfil});

  final VoidCallback onMensagem;
  final VoidCallback onPerfil;

  static const _passos = [
    (
      Icons.send_outlined,
      'Envie sua primeira mensagem',
      'Diga olá, se apresente e conte um pouco sobre você.',
    ),
    (
      Icons.person_search_outlined,
      'Conheça o perfil do seu padrinho',
      'Veja mais informações, interesses e experiências.',
    ),
    (
      Icons.calendar_month_outlined,
      'Combine um primeiro encontro',
      'Vocês podem conversar no campus ou em um ambiente online.',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: EstiloCampo.decoracao(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Próximos passos',
            style: TextStyle(
              color: AppColors.ink,
              fontSize: 16,
              fontWeight: FontWeight.w800,
            ),
          ),
          const Text(
            'Aproveite para dar os primeiros passos na sua jornada!',
            style: TextStyle(
              fontFamily: 'Inter',
              color: AppColors.muted,
              fontSize: 12,
            ),
          ),
          const SizedBox(height: 12),
          for (final (i, (icone, titulo, descricao)) in _passos.indexed)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CircleAvatar(
                    radius: 11,
                    backgroundColor: AppColors.lavender,
                    child: Text(
                      '${i + 1}',
                      style: const TextStyle(
                        fontFamily: 'Inter',
                        color: AppColors.primary,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Icon(icone, size: 20, color: AppColors.primary),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          titulo,
                          style: const TextStyle(
                            fontFamily: 'Inter',
                            color: AppColors.ink,
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
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
                ],
              ),
            ),
          const SizedBox(height: 4),
          BotaoCadastro(texto: 'Enviar mensagem', onPressed: onMensagem),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            height: 50,
            child: OutlinedButton(
              onPressed: onPerfil,
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.primary,
                side: const BorderSide(color: AppColors.primary, width: 1.2),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
              child: const Text(
                'Ver perfil do padrinho',
                style: TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _VinculoAtivo extends StatelessWidget {
  const _VinculoAtivo({this.grupo});

  final String? grupo;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppAccents.successBg,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.groups_outlined,
            color: AppAccents.success,
            size: 28,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  grupo == null
                      ? 'Seu vínculo está ativo!'
                      : 'Seu vínculo está ativo! · $grupo',
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    color: AppAccents.success,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const Text(
                  'Agora você já pode conversar, participar de encontros e '
                  'acompanhar missões juntos no Ajuda-aí.',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.ink,
                    fontSize: 12,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
