import 'package:flutter/material.dart';

import 'tela_feed.dart';
import 'tela_historico.dart';
import 'tela_home.dart';
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
              const SizedBox(height: 14),
              const _PessoaPerfil(),
              const SizedBox(height: 10),
              _VinculoAtivo(onTap: () => _abrirPadrinho(context)),
              const SizedBox(height: 12),
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
                      Text('Ver histórico', style: TextStyle(fontSize: 11)),
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
              const SizedBox(height: 10),
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
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFFF0E8FC),
        borderRadius: BorderRadius.circular(15),
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: AppColors.primary,
          fontSize: 9,
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
          padding: const EdgeInsets.fromLTRB(10, 8, 10, 7),
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
                                fontSize: 14,
                                fontWeight: FontWeight.w800)),
                        Text(
                          'Você já está vinculada ao programa e pode conversar com seu padrinho.',
                          style: TextStyle(
                              color: AppColors.muted,
                              fontSize: 10,
                              height: 1.2),
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
                        style: TextStyle(color: AppColors.muted, fontSize: 10)),
                    Text('Rodrigo Silva',
                        style: TextStyle(
                            color: AppColors.ink,
                            fontSize: 10,
                            fontWeight: FontWeight.w700)),
                  ],
                ),
              ),
              const SizedBox(height: 5),
              const Row(
                children: [
                  Expanded(child: _MiniDado(Icons.groups_rounded, '1', 'Padrinho')),
                  _Separador(),
                  Expanded(child: _MiniDado(Icons.emoji_events_rounded, 'Grupo 08', 'Seu grupo')),
                  _Separador(),
                  Expanded(child: _MiniDado(Icons.calendar_month_rounded, 'Programa 2026/2', 'Período atual')),
                ],
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
        Icon(icone, color: AppColors.primary, size: 16),
        const SizedBox(width: 4),
        Flexible(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(valor,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      color: AppColors.ink,
                      fontSize: 9,
                      fontWeight: FontWeight.w800)),
              Text(rotulo,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: AppColors.muted, fontSize: 8)),
            ],
          ),
        ),
      ],
    );
  }
}

class _Separador extends StatelessWidget {
  const _Separador();

  @override
  Widget build(BuildContext context) => Container(
        height: 28,
        width: 1,
        margin: const EdgeInsets.symmetric(horizontal: 5),
        color: _borda,
      );
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
                  fontSize: 15,
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
    return Row(
      children: [
        for (var index = 0; index < itens.length; index++) ...[
          if (index > 0) const SizedBox(width: 5),
          Expanded(
            child: _JornadaCard(
              icone: itens[index].$1,
              valor: itens[index].$2,
              rotulo: itens[index].$3,
              fundoIcone: itens[index].$4,
              corIcone: itens[index].$5,
            ),
          ),
        ],
      ],
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
      height: 52,
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
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
            width: 27,
            height: 27,
            decoration: BoxDecoration(color: fundoIcone, shape: BoxShape.circle),
            child: Icon(icone, color: corIcone, size: 16),
          ),
          const SizedBox(width: 4),
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
                        fontSize: 9,
                        fontWeight: FontWeight.w800)),
                Text(rotulo,
                    maxLines: 2,
                    style: const TextStyle(
                        color: AppColors.muted, fontSize: 7, height: 1.1)),
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
                height: 28,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  child: Row(
                    children: [
                      Icon(acessos[index].$1, color: AppColors.primary, size: 17),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Text(acessos[index].$2,
                            style: const TextStyle(
                                color: AppColors.ink, fontSize: 10)),
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
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
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
                            fontSize: 8,
                            fontWeight: FontWeight.w800,
                            letterSpacing: .4)),
                    SizedBox(height: 2),
                    Text('Praça da Liberdade • sexta-feira, 16:00',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            color: AppColors.ink,
                            fontSize: 10,
                            fontWeight: FontWeight.w700)),
                    Text('Encontro do Grupo 08 com seu padrinho Rodrigo Silva.',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: AppColors.muted, fontSize: 9)),
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
