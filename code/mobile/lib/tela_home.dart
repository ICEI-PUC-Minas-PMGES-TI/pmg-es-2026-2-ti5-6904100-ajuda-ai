import 'package:flutter/material.dart';

import 'tela_feed.dart';
import 'tela_perfil.dart';
import 'theme/colors.dart';
import 'widgets/app_bottom_navigation.dart';

const double _gutter = 20;

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SingleChildScrollView(
        padding: EdgeInsets.zero,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: const [_Cabecalho(), _Painel()],
        ),
      ),
      bottomNavigationBar: const _BarraInferior(),
    );
  }
}

class _Cabecalho extends StatelessWidget {
  const _Cabecalho();

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppAccents.headerTop, AppAccents.headerBottom],
        ),
      ),
      child: Stack(
        children: [
          const Positioned.fill(child: _Brilhos()),
          SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(_gutter, 8, _gutter, 52),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: const [
                  _LinhaMarca(),
                  SizedBox(height: 22),
                  _Saudacao(),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Brilhos extends StatelessWidget {
  const _Brilhos();

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Stack(
        children: [
          Positioned(top: 60, right: 90, child: _brilho(18)),
          Positioned(top: 130, right: 150, child: _brilho(12)),
          Positioned(top: 180, left: 40, child: _brilho(14)),
          Positioned(top: 96, left: 150, child: _brilho(10)),
        ],
      ),
    );
  }

  Widget _brilho(double size) => Icon(
    Icons.auto_awesome,
    size: size,
    color: Colors.white.withValues(alpha: 0.28),
  );
}

class _LinhaMarca extends StatelessWidget {
  const _LinhaMarca();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Image.asset(
          'assets/images/logo.png',
          height: 40,
          color: Colors.white,
          semanticLabel: 'Ajuda-aí',
        ),
        const SizedBox(width: 14),
        Image.asset(
          'assets/images/puclogo.png',
          height: 40,
          color: Colors.white,
          semanticLabel: 'PUC Minas',
        ),
        const Spacer(),
        _SinoNotificacoes(
          quantidade: 3,
          onPressed: () => _emBreve(context, 'Notificações'),
        ),
      ],
    );
  }
}

class _SinoNotificacoes extends StatelessWidget {
  const _SinoNotificacoes({required this.quantidade, required this.onPressed});

  final int quantidade;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: 'Notificações',
      child: InkResponse(
        onTap: onPressed,
        radius: 26,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            const Padding(
              padding: EdgeInsets.all(4),
              child: Icon(
                Icons.notifications_none_rounded,
                size: 30,
                color: Colors.white,
              ),
            ),
            Positioned(
              top: -2,
              right: -2,
              child: Container(
                width: 20,
                height: 20,
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                  color: Color(0xFF8B5CF6),
                  shape: BoxShape.circle,
                ),
                child: Text(
                  '$quantidade',
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Saudacao extends StatelessWidget {
  const _Saudacao();

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
                'Olá, Camila!',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                ),
              ),
              SizedBox(height: 6),
              Text(
                'Bem-vinda à PUC Minas!',
                style: TextStyle(
                  fontFamily: 'Inter',
                  color: Color(0xFFD9CCEC),
                  fontSize: 15,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 12),
        const _AvatarNivel(iniciais: 'C', nivel: 4),
      ],
    );
  }
}

class _AvatarNivel extends StatelessWidget {
  const _AvatarNivel({required this.iniciais, required this.nivel});

  final String iniciais;
  final int nivel;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 104,
      height: 104,
      child: Stack(
        alignment: Alignment.topCenter,
        children: [
          Container(
            width: 84,
            height: 84,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.lavender,
              shape: BoxShape.circle,
              border: Border.all(color: const Color(0xFF9B5DE5), width: 3),
            ),
            child: Text(
              iniciais,
              style: const TextStyle(
                color: AppColors.primary,
                fontSize: 34,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          Positioned(
            bottom: 0,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.ink.withValues(alpha: 0.18),
                    blurRadius: 10,
                    offset: const Offset(0, 3),
                  ),
                ],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.shield_outlined,
                    size: 14,
                    color: AppColors.primary,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    'Nível $nivel',
                    style: const TextStyle(
                      fontFamily: 'Inter',
                      color: AppColors.ink,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Painel extends StatelessWidget {
  const _Painel();

  @override
  Widget build(BuildContext context) {
    return Container(
      transform: Matrix4.translationValues(0, -28, 0),
      padding: const EdgeInsets.fromLTRB(_gutter, 24, _gutter, 8),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: const [
          _CardPontos(),
          SizedBox(height: 16),
          _CardMissao(),
          SizedBox(height: 16),
          _CardPadrinho(),
          SizedBox(height: 24),
          _ContinueExplorando(),
        ],
      ),
    );
  }
}

class _Cartao extends StatelessWidget {
  const _Cartao({
    required this.child,
    this.cor = AppAccents.cardBg,
    this.padding = const EdgeInsets.all(18),
    this.onTap,
  });

  final Widget child;
  final Color cor;
  final EdgeInsets padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: cor,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Container(
          padding: padding,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: AppAccents.cardBorder),
          ),
          child: child,
        ),
      ),
    );
  }
}

class _CardPontos extends StatelessWidget {
  const _CardPontos();

  static const int _xp = 1430;
  static const int _meta = 2000;

  static String _milhar(int valor) => valor.toString().replaceAllMapped(
    RegExp(r'(\d)(?=(\d{3})+$)'),
    (encontrado) => '${encontrado[1]}.',
  );

  @override
  Widget build(BuildContext context) {
    return _Cartao(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Expanded(
                child: Text(
                  'Seus pontos',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.muted,
                    fontSize: 15,
                  ),
                ),
              ),
              _BotaoPilula(
                texto: 'Ver ranking',
                icone: Icons.emoji_events_outlined,
                onPressed: () => _emBreve(context, 'Ranking'),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              const Icon(Icons.star_rounded, size: 34, color: AppAccents.star),
              const SizedBox(width: 10),
              Text(
                _milhar(_xp),
                style: const TextStyle(
                  color: AppColors.ink,
                  fontSize: 32,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -1,
                  height: 1.1,
                ),
              ),
              const SizedBox(width: 6),
              const Padding(
                padding: EdgeInsets.only(bottom: 4),
                child: Text(
                  'XP',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.muted,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: const LinearProgressIndicator(
              value: _xp / _meta,
              minHeight: 10,
              backgroundColor: AppColors.lavender,
              valueColor: AlwaysStoppedAnimation(AppColors.primary),
            ),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: Text(
              '${_milhar(_xp)} / ${_milhar(_meta)} XP',
              style: const TextStyle(
                fontFamily: 'Inter',
                color: AppColors.muted,
                fontSize: 13,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _BotaoPilula extends StatelessWidget {
  const _BotaoPilula({
    required this.texto,
    required this.icone,
    required this.onPressed,
  });

  final String texto;
  final IconData icone;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.lavender,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                texto,
                style: const TextStyle(
                  fontFamily: 'Inter',
                  color: AppColors.primary,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(width: 6),
              Icon(icone, size: 16, color: AppColors.primary),
            ],
          ),
        ),
      ),
    );
  }
}

class _CardMissao extends StatelessWidget {
  const _CardMissao();

  @override
  Widget build(BuildContext context) {
    return _Cartao(
      cor: AppColors.lavender,
      onTap: () => _emBreve(context, 'Missão do dia'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Missão do dia',
                  style: TextStyle(
                    color: AppColors.primary,
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              const Icon(
                Icons.timer_outlined,
                size: 16,
                color: AppColors.muted,
              ),
              const SizedBox(width: 5),
              const Text(
                '12h restante',
                style: TextStyle(
                  fontFamily: 'Inter',
                  color: AppColors.muted,
                  fontSize: 13,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Container(
                width: 60,
                height: 60,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.7),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Icon(
                  Icons.location_on,
                  size: 30,
                  color: AppAccents.iconeVerde,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Conheça a Praça da Liberdade',
                      style: TextStyle(
                        color: AppColors.ink,
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'Visite e faça check-in no local',
                      style: TextStyle(
                        fontFamily: 'Inter',
                        color: AppColors.muted,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 10),
                    const _EtiquetaXp('+150 XP'),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, color: AppColors.muted),
            ],
          ),
        ],
      ),
    );
  }
}

class _EtiquetaXp extends StatelessWidget {
  const _EtiquetaXp(this.texto);

  final String texto;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: AppAccents.successBg,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        texto,
        style: const TextStyle(
          fontFamily: 'Inter',
          color: AppAccents.success,
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _CardPadrinho extends StatelessWidget {
  const _CardPadrinho();

  @override
  Widget build(BuildContext context) {
    return _Cartao(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Seu padrinho',
            style: TextStyle(
              color: AppColors.primary,
              fontSize: 17,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Container(
                width: 60,
                height: 60,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.lavender,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: AppColors.primary.withValues(alpha: 0.18),
                  ),
                ),
                child: const Text(
                  'TM',
                  style: TextStyle(
                    color: AppColors.primary,
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Thiago Moreira',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: AppColors.ink,
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    SizedBox(height: 3),
                    Text(
                      'Engenharia de Software',
                      style: TextStyle(
                        fontFamily: 'Inter',
                        color: AppColors.muted,
                        fontSize: 13,
                      ),
                    ),
                    SizedBox(height: 6),
                    Row(
                      children: [
                        Icon(Icons.circle, size: 9, color: AppAccents.success),
                        SizedBox(width: 6),
                        Text(
                          'Online',
                          style: TextStyle(
                            fontFamily: 'Inter',
                            color: AppAccents.success,
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              OutlinedButton.icon(
                onPressed: () => _emBreve(context, 'Conversas'),
                icon: const Icon(Icons.chat_bubble_outline_rounded, size: 18),
                label: const Text(
                  'Conversar',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.primary,
                  backgroundColor: Colors.white,
                  side: const BorderSide(color: AppAccents.cardBorder),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 12,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Lugar {
  const _Lugar({
    required this.icone,
    required this.corIcone,
    required this.fundo,
    required this.nome,
    required this.distancia,
    required this.xp,
  });

  final IconData icone;
  final Color corIcone;
  final Color fundo;
  final String nome;
  final String distancia;
  final String xp;
}

const List<_Lugar> _lugares = [
  _Lugar(
    icone: Icons.menu_book_rounded,
    corIcone: AppColors.primary,
    fundo: AppAccents.tileLilas,
    nome: 'Biblioteca',
    distancia: '120 m',
    xp: '+100 XP',
  ),
  _Lugar(
    icone: Icons.apartment_rounded,
    corIcone: AppAccents.iconeAzul,
    fundo: AppAccents.tileAzul,
    nome: 'Seu prédio',
    distancia: '80 m',
    xp: '+100 XP',
  ),
  _Lugar(
    icone: Icons.science_rounded,
    corIcone: AppAccents.iconeLaranja,
    fundo: AppAccents.tileLaranja,
    nome: 'Laboratórios',
    distancia: '150 m',
    xp: '+100 XP',
  ),
  _Lugar(
    icone: Icons.park_rounded,
    corIcone: AppAccents.iconeVerde,
    fundo: AppAccents.tileVerde,
    nome: 'Área de convivência',
    distancia: '200 m',
    xp: '+80 XP',
  ),
];

class _ContinueExplorando extends StatelessWidget {
  const _ContinueExplorando();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'Continue explorando',
              style: TextStyle(
                color: AppColors.ink,
                fontSize: 19,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.3,
              ),
            ),
            InkWell(
              onTap: () => _emBreve(context, 'Lugares do campus'),
              borderRadius: BorderRadius.circular(8),
              child: const Padding(
                padding: EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                child: Text(
                  'Ver todos',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.primary,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        SizedBox(
          height: 186,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            clipBehavior: Clip.none,
            itemCount: _lugares.length,
            separatorBuilder: (_, _) => const SizedBox(width: 12),
            itemBuilder: (context, indice) =>
                _CardLugar(lugar: _lugares[indice]),
          ),
        ),
      ],
    );
  }
}

class _CardLugar extends StatelessWidget {
  const _CardLugar({required this.lugar});

  final _Lugar lugar;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 132,
      child: _Cartao(
        padding: const EdgeInsets.all(10),
        onTap: () => _emBreve(context, lugar.nome),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              height: 76,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: lugar.fundo,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(lugar.icone, size: 34, color: lugar.corIcone),
            ),
            const SizedBox(height: 10),
            Text(
              lugar.nome,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: AppColors.ink,
                fontSize: 13,
                fontWeight: FontWeight.w700,
                height: 1.2,
              ),
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                const Icon(
                  Icons.location_on_outlined,
                  size: 13,
                  color: AppColors.muted,
                ),
                const SizedBox(width: 3),
                Text(
                  lugar.distancia,
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.muted,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              lugar.xp,
              style: const TextStyle(
                fontFamily: 'Inter',
                color: AppAccents.success,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BarraInferior extends StatelessWidget {
  const _BarraInferior();

  @override
  Widget build(BuildContext context) {
    return AppBottomNavigation(
      selected: AppDestination.inicio,
      onSelected: (destination) {
        switch (destination) {
          case AppDestination.feed:
            Navigator.of(context).pushReplacement(
              MaterialPageRoute(builder: (_) => const FeedPage()),
            );
            break;
          case AppDestination.inicio:
            break;
          case AppDestination.mapa:
            _emBreve(context, 'Mapa');
            break;
          case AppDestination.missoes:
            _emBreve(context, 'Missões');
            break;
          case AppDestination.perfil:
            Navigator.of(context).pushReplacement(
              MaterialPageRoute(builder: (_) => const ProfilePage()),
            );
            break;
        }
      },
    );
  }
}

void _emBreve(BuildContext context, String funcionalidade) {
  ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content: Text('$funcionalidade: em breve!')));
}
