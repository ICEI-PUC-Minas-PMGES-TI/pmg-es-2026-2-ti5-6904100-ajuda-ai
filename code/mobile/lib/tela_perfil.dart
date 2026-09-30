import 'package:flutter/material.dart';

import 'tela_feed.dart';
import 'tela_historico.dart';
import 'tela_home.dart';
import 'tela_login.dart';
import 'tela_padrinho_definido.dart';
import 'theme/colors.dart';
import 'widgets/app_bottom_navigation.dart';

const _borda = Color(0xFFE9E5F1);

class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        bottom: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Image.asset('assets/images/logo.png', height: 28),
                  Container(
                    width: 1,
                    height: 24,
                    margin: const EdgeInsets.symmetric(horizontal: 10),
                    color: AppColors.muted.withValues(alpha: 0.35),
                  ),
                  Image.asset('assets/images/puclogo.png', height: 32),
                  const Spacer(),
                  IconButton(
                    onPressed: () => _aviso(context, 'Configurações'),
                    tooltip: 'Configurações',
                    icon: const Icon(Icons.settings_outlined),
                    color: AppColors.ink,
                  ),
                ],
              ),
              const SizedBox(height: 10),
              const Text(
                'Meu perfil',
                style: TextStyle(
                  color: AppColors.ink,
                  fontSize: 25,
                  height: 1.05,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 3),
              const Text(
                'Seu progresso, participação e principais informações.',
                style: TextStyle(
                  fontFamily: 'Inter',
                  color: AppColors.muted,
                  fontSize: 12,
                ),
              ),
              const SizedBox(height: 18),
              const _PessoaPerfil(),
              const SizedBox(height: 16),
              _VinculoAtivo(onTap: () => _abrirPadrinho(context)),
              const SizedBox(height: 20),
              const _TituloSecao('Sobre mim'),
              const SizedBox(height: 8),
              const _BlocoTexto(
                'Gosto de tecnologia, inovação e projetos no campus. '
                'Estou no primeiro período e quero conhecer a rotina da PUC.',
              ),
              const SizedBox(height: 18),
              const _TituloSecao('Informações acadêmicas'),
              const SizedBox(height: 8),
              const _InfoAcademica(
                linhas: [
                  ('Curso', 'Engenharia Química'),
                  ('Período', '1º período'),
                  ('E-mail institucional', 'ana.clara@pucminas.edu.br'),
                ],
              ),
              const SizedBox(height: 18),
              _TituloSecao(
                'Minha jornada',
                acao: TextButton(
                  onPressed: () => _abrirHistorico(context),
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.primary,
                    padding: EdgeInsets.zero,
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: const Row(
                    children: [
                      Text('Ver histórico', style: TextStyle(fontSize: 14)),
                      SizedBox(width: 2),
                      Icon(Icons.chevron_right, size: 17),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 7),
              const _ResumoJornada(),
              const SizedBox(height: 11),
              const _TituloSecao('Acessos rápidos'),
              const SizedBox(height: 6),
              _AcessosRapidos(
                onPadrinho: () => _abrirPadrinho(context),
                onHistorico: () => _abrirHistorico(context),
                onEmBreve: (texto) => _aviso(context, texto),
              ),
              const SizedBox(height: 6),
              _ProximoEncontro(onTap: () => _aviso(context, 'Próximo encontro')),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: () => _sair(context),
                  icon: const Icon(Icons.logout_rounded),
                  label: const Text('Sair da conta'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFFDC2626),
                    minimumSize: const Size.fromHeight(52),
                    side: const BorderSide(color: Color(0xFFFECACA)),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                    textStyle: const TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 12),
            ],
          ),
        ),
      ),
      bottomNavigationBar: const _ProfileNavigation(),
    );
  }

  void _abrirPadrinho(BuildContext context) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => const PadrinhoDefinidoPage(
          padrinho: Padrinho(
            nome: 'Rodrigo Silva',
            curso: 'Engenharia de Software',
            sobre: 'Gosto de tecnologia, inovação e projetos no campus.',
            interesses: ['Tecnologia', 'Inovação', 'Projetos'],
            online: true,
          ),
        ),
      ),
    );
  }

  void _abrirHistorico(BuildContext context) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const HistoricoParticipacaoPage()),
    );
  }

  void _sair(BuildContext context) {
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginPage()),
      (route) => false,
    );
  }

  void _aviso(BuildContext context, String texto) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text('$texto: em breve!')));
  }
}

class _PessoaPerfil extends StatelessWidget {
  const _PessoaPerfil();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Stack(
          clipBehavior: Clip.none,
          children: [
            Container(
              width: 112,
              height: 112,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: const Color(0xFFE9DFFF), width: 5),
                gradient: const LinearGradient(
                  colors: [Color(0xFFF3E9FE), Color(0xFFE1D3FB)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
              ),
              child: const Text(
                'AC',
                style: TextStyle(
                  color: AppColors.primary,
                  fontSize: 30,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            Positioned(
              right: -2,
              bottom: -2,
              child: Container(
                padding: const EdgeInsets.all(7),
                decoration: const BoxDecoration(
                  color: Color(0xFFE8D8FF),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.edit_outlined,
                    color: AppColors.primary, size: 16),
              ),
            ),
          ],
        ),
        const SizedBox(width: 14),
        const Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Ana Clara',
                style: TextStyle(
                  color: AppColors.ink,
                  fontSize: 20,
                  height: 1.1,
                  fontWeight: FontWeight.w800,
                ),
              ),
              SizedBox(height: 3),
              Text('Engenharia Química',
                  style: TextStyle(color: AppColors.muted, fontSize: 13)),
              Text('1º período',
                  style: TextStyle(color: AppColors.muted, fontSize: 12)),
              SizedBox(height: 6),
              Wrap(
                spacing: 4,
                runSpacing: 4,
                children: [
                  _Tag('Tecnologia'),
                  _Tag('Inovação'),
                  _Tag('Projetos'),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag(this.label);
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: const Color(0xFFF0E8FC),
        borderRadius: BorderRadius.circular(15),
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: AppColors.primary,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _VinculoAtivo extends StatelessWidget {
  const _VinculoAtivo({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppAccents.successBg,
      borderRadius: BorderRadius.circular(15),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(15),
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
          decoration: BoxDecoration(
            border: Border.all(color: const Color(0xFFD1F3DF)),
            borderRadius: BorderRadius.circular(15),
          ),
          child: Column(
            children: [
              Row(
                children: [
                  const Icon(Icons.groups_rounded,
                      color: AppAccents.success, size: 40),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Apadrinhado ativo',
                            style: TextStyle(
                                color: AppColors.ink,
                                fontSize: 16,
                                fontWeight: FontWeight.w800)),
                        SizedBox(height: 2),
                        Text(
                          'Você já está vinculada ao programa e pode conversar com seu padrinho.',
                          style: TextStyle(
                              color: AppColors.muted,
                              fontSize: 13,
                              height: 1.3),
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right,
                      color: AppAccents.success, size: 24),
                ],
              ),
              const SizedBox(height: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.8),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.person_outline, color: AppColors.primary, size: 19),
                    SizedBox(width: 7),
                    Text('Padrinho: ',
                        style: TextStyle(color: AppColors.muted, fontSize: 14)),
                    Text('Rodrigo Silva',
                        style: TextStyle(
                            color: AppColors.ink,
                            fontSize: 14,
                            fontWeight: FontWeight.w700)),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              const _MiniDado(Icons.groups_rounded, '1', 'Padrinho'),
              const SizedBox(height: 6),
              const _MiniDado(Icons.emoji_events_rounded, 'Grupo 08', 'Seu grupo'),
              const SizedBox(height: 6),
              const _MiniDado(
                Icons.calendar_month_rounded,
                'Programa 2026/2',
                'Período atual',
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MiniDado extends StatelessWidget {
  const _MiniDado(this.icone, this.valor, this.rotulo);
  final IconData icone;
  final String valor;
  final String rotulo;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icone, color: AppColors.primary, size: 18),
        const SizedBox(width: 8),
        Flexible(
          child: Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: valor,
                  style: const TextStyle(
                    color: AppColors.ink,
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                TextSpan(
                  text: '  $rotulo',
                  style: const TextStyle(color: AppColors.muted, fontSize: 13),
                ),
              ],
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}

class _BlocoTexto extends StatelessWidget {
  const _BlocoTexto(this.texto);
  final String texto;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: _borda),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Text(
        texto,
        style: const TextStyle(
          fontFamily: 'Inter',
          color: AppColors.ink,
          fontSize: 14,
          height: 1.4,
        ),
      ),
    );
  }
}

class _InfoAcademica extends StatelessWidget {
  const _InfoAcademica({required this.linhas});
  final List<(String, String)> linhas;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: _borda),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        children: [
          for (var index = 0; index < linhas.length; index++) ...[
            if (index > 0) const Divider(height: 1, color: _borda),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    flex: 5,
                    child: Text(
                      linhas[index].$1,
                      style: const TextStyle(
                        fontFamily: 'Inter',
                        color: AppColors.muted,
                        fontSize: 14,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 6,
                    child: Text(
                      linhas[index].$2,
                      textAlign: TextAlign.end,
                      style: const TextStyle(
                        fontFamily: 'Inter',
                        color: AppColors.ink,
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _TituloSecao extends StatelessWidget {
  const _TituloSecao(this.titulo, {this.acao});
  final String titulo;
  final Widget? acao;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(titulo,
              style: const TextStyle(
                  color: AppColors.ink,
                  fontSize: 18,
                  fontWeight: FontWeight.w800)),
        ),
        if (acao != null) acao!,
      ],
    );
  }
}

class _ResumoJornada extends StatelessWidget {
  const _ResumoJornada();

  @override
  Widget build(BuildContext context) {
    const itens = [
      (Icons.star_rounded, '950 XP', 'XP total', AppAccents.tileLaranja, AppAccents.iconeLaranja),
      (Icons.emoji_events_rounded, '7', 'Missões\nconcluídas', AppAccents.tileLilas, AppColors.primary),
      (Icons.calendar_month_rounded, '3', 'Encontros\nrealizados', AppAccents.tileAzul, AppColors.primary),
      (Icons.place_rounded, '5', 'Locais\nvisitados', AppAccents.tileLilas, AppColors.primary),
    ];
    return LayoutBuilder(
      builder: (context, constraints) {
        final colunas = constraints.maxWidth >= 560 ? 4 : 2;
        const espaco = 10.0;
        final largura =
            (constraints.maxWidth - espaco * (colunas - 1)) / colunas;
        return Wrap(
          spacing: espaco,
          runSpacing: espaco,
          children: [
            for (final item in itens)
              SizedBox(
                width: largura,
                child: _JornadaCard(
                  icone: item.$1,
                  valor: item.$2,
                  rotulo: item.$3,
                  fundoIcone: item.$4,
                  corIcone: item.$5,
                ),
              ),
          ],
        );
      },
    );
  }
}

class _JornadaCard extends StatelessWidget {
  const _JornadaCard({
    required this.icone,
    required this.valor,
    required this.rotulo,
    required this.fundoIcone,
    required this.corIcone,
  });

  final IconData icone;
  final String valor;
  final String rotulo;
  final Color fundoIcone;
  final Color corIcone;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: 78),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: _borda),
        borderRadius: BorderRadius.circular(10),
        boxShadow: const [
          BoxShadow(color: Color(0x081B1340), blurRadius: 8, offset: Offset(0, 2)),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(color: fundoIcone, shape: BoxShape.circle),
            child: Icon(icone, color: corIcone, size: 20),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(valor,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        color: AppColors.ink,
                        fontSize: 16,
                        fontWeight: FontWeight.w800)),
                Text(rotulo,
                    maxLines: 2,
                    style: const TextStyle(
                        color: AppColors.muted, fontSize: 12, height: 1.2)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AcessosRapidos extends StatelessWidget {
  const _AcessosRapidos({
    required this.onPadrinho,
    required this.onHistorico,
    required this.onEmBreve,
  });

  final VoidCallback onPadrinho;
  final VoidCallback onHistorico;
  final ValueChanged<String> onEmBreve;

  @override
  Widget build(BuildContext context) {
    final acessos = <(IconData, String, VoidCallback)>[
      (Icons.person_outline_rounded, 'Meu padrinho', onPadrinho),
      (Icons.groups_2_outlined, 'Meu grupo', () => onEmBreve('Meu grupo')),
      (Icons.chat_bubble_outline_rounded, 'Conversas', () => onEmBreve('Conversas')),
      (Icons.bar_chart_rounded, 'Minha participação', onHistorico),
      (Icons.access_time_rounded, 'Histórico de participação', onHistorico),
      (Icons.emoji_events_outlined, 'Conquistas', () => onEmBreve('Conquistas')),
    ];
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: _borda),
        borderRadius: BorderRadius.circular(11),
      ),
      child: Column(
        children: [
          for (var index = 0; index < acessos.length; index++) ...[
            if (index > 0) const Divider(height: 1, indent: 45, endIndent: 10),
            InkWell(
              onTap: acessos[index].$3,
              borderRadius: BorderRadius.circular(11),
              child: SizedBox(
                height: 52,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  child: Row(
                    children: [
                      Icon(acessos[index].$1, color: AppColors.primary, size: 22),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Text(acessos[index].$2,
                            style: const TextStyle(
                                color: AppColors.ink, fontSize: 15)),
                      ),
                      const Icon(Icons.chevron_right,
                          color: AppColors.muted, size: 18),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _ProximoEncontro extends StatelessWidget {
  const _ProximoEncontro({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFFF5F0FF),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          decoration: BoxDecoration(
            border: Border.all(color: const Color(0xFFE9DFFF)),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: const BoxDecoration(
                    color: Color(0xFFE8D8FF), shape: BoxShape.circle),
                child: const Icon(Icons.calendar_month_outlined,
                    color: AppColors.primary, size: 22),
              ),
              const SizedBox(width: 10),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('PRÓXIMO ENCONTRO',
                        style: TextStyle(
                            color: AppColors.primary,
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            letterSpacing: .4)),
                    SizedBox(height: 4),
                    Text('Praça da Liberdade • sexta-feira, 16:00',
                        style: TextStyle(
                            color: AppColors.ink,
                            fontSize: 15,
                            height: 1.25,
                            fontWeight: FontWeight.w700)),
                    SizedBox(height: 2),
                    Text('Encontro do Grupo 08 com seu padrinho Rodrigo Silva.',
                        style: TextStyle(
                            color: AppColors.muted, fontSize: 13, height: 1.3)),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right,
                  color: AppColors.primary, size: 22),
            ],
          ),
        ),
      ),
    );
  }
}

class _ProfileNavigation extends StatelessWidget {
  const _ProfileNavigation();

  @override
  Widget build(BuildContext context) {
    return AppBottomNavigation(
      selected: AppDestination.perfil,
      onSelected: (destination) {
        switch (destination) {
          case AppDestination.inicio:
            Navigator.of(context).pushReplacement(
              MaterialPageRoute(builder: (_) => const HomePage()),
            );
            break;
          case AppDestination.feed:
            Navigator.of(context).pushReplacement(
              MaterialPageRoute(builder: (_) => const FeedPage()),
            );
            break;
          case AppDestination.mapa:
          case AppDestination.missoes:
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('${destination.name}: em breve!')),
            );
            break;
          case AppDestination.perfil:
            break;
        }
      },
    );
  }
}
