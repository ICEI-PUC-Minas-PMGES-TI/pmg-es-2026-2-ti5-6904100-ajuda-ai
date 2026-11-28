import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'models/notificacao.dart';
import 'models/situacao_participacao.dart';
import 'services/notificacoes_api.dart';
import 'sessao_usuario.dart';
import 'tela_encontros.dart';
import 'tela_resgatar.dart';
import 'main.dart' show estiloBarraClara;
import 'theme/colors.dart';
import 'widgets/app_bottom_navigation.dart';
import 'widgets/navegacao_app.dart';
import 'widgets/painel_notificacoes.dart';
import 'widgets/progresso_gamificacao.dart';
import 'widgets/abrir_conversas.dart';

const double _gutter = 20;

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: SessaoUsuario.atual.mudancas,
      builder: (context, _) => Scaffold(
        backgroundColor: Colors.white,
        body: SingleChildScrollView(
          padding: EdgeInsets.zero,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: const [_Cabecalho(), _Painel()],
          ),
        ),
        bottomNavigationBar: const _BarraInferior(),
      ),
    );
  }
}

class _Cabecalho extends StatelessWidget {
  const _Cabecalho();

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: estiloBarraClara,
      child: Container(
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

class _LinhaMarca extends StatefulWidget {
  const _LinhaMarca();

  @override
  State<_LinhaMarca> createState() => _LinhaMarcaState();
}

class _LinhaMarcaState extends State<_LinhaMarca> with WidgetsBindingObserver {
  AppDestination? _abaAnterior;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    CentralNotificacoes.atual.atualizar();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final aba = AppShell.of(context)?.atual;
    if (aba == AppDestination.inicio &&
        _abaAnterior != null &&
        _abaAnterior != aba) {
      CentralNotificacoes.atual.atualizar();
    }
    _abaAnterior = aba;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      CentralNotificacoes.atual.atualizar();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Future<void> _abrir() async {
    await mostrarNotificacoes(
      context,
      publico: SessaoUsuario.atual.ehPadrinhoAtivo
          ? 'padrinhos'
          : 'apadrinhados',
    );
    CentralNotificacoes.atual.atualizar();
  }

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
        IconButton(
          onPressed: () => abrirConversas(context),
          icon: const Icon(Icons.chat_bubble_outline, color: Colors.white),
          tooltip: 'Conversas',
        ),
        ValueListenableBuilder<Notificacoes>(
          valueListenable: CentralNotificacoes.atual.estado,
          builder: (context, dados, _) => _SinoNotificacoes(
            quantidade:
                SessaoUsuario.atual.preferencias['notificacoesAvisos'] == false
                ? 0
                : dados.naoLidas,
            onPressed: _abrir,
          ),
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
      message: quantidade > 0
          ? 'Notificações ($quantidade não lidas)'
          : 'Notificações',
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
            if (quantidade > 0)
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
                    key: const Key('sino-contagem'),
                    quantidade > 9 ? '9+' : '$quantidade',
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

String _saudacao() {
  final nome = SessaoUsuario.atual.nomeExibicao;
  if (nome == null) return 'Olá!';
  final primeiro = nome.split(RegExp(r'\s+')).first;
  return 'Olá, $primeiro!';
}

/// Papel real do participante (a Home só abre para participantes ativos).
String _rotuloPapel() =>
    SessaoUsuario.atual.ehPadrinhoAtivo ? 'Padrinho' : 'Apadrinhado';

String _inicialCabecalho() {
  final nome = SessaoUsuario.atual.nomeExibicao;
  if (nome == null || nome.isEmpty) return '';
  return nome[0].toUpperCase();
}

class _Saudacao extends StatelessWidget {
  const _Saudacao();

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _saudacao(),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 6),
              const Text(
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
        const _BotaoResgatar(),
        const SizedBox(width: 12),
        _AvatarPerfil(iniciais: _inicialCabecalho(), papel: _rotuloPapel()),
      ],
    );
  }
}

class _BotaoResgatar extends StatelessWidget {
  const _BotaoResgatar();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Material(
        color: const Color(0xFF5B2DB0),
        borderRadius: BorderRadius.circular(20),
        child: InkWell(
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) =>
                  ResgatarPage(saldoXp: SessaoUsuario.atual.xp.value ?? 0),
            ),
          ),
          borderRadius: BorderRadius.circular(20),
          child: Container(
            width: 78,
            height: 78,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: Colors.white.withValues(alpha: 0.16)),
            ),
            child: const Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Icon(
                      Icons.card_giftcard_rounded,
                      size: 32,
                      color: Colors.white,
                    ),
                    Positioned(
                      top: -8,
                      right: -10,
                      child: Icon(
                        Icons.auto_awesome,
                        size: 14,
                        color: AppAccents.star,
                      ),
                    ),
                  ],
                ),
                SizedBox(height: 6),
                Text(
                  'Resgatar',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    color: Colors.white,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AvatarPerfil extends StatelessWidget {
  const _AvatarPerfil({required this.iniciais, required this.papel});

  final String iniciais;
  final String papel;

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
                    Icons.verified_user_outlined,
                    size: 14,
                    color: AppColors.primary,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    papel,
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
          _CardVinculo(),
          SizedBox(height: 16),
          _AtalhoEncontros(),
          SizedBox(height: 24),
          _ExplorarMapa(),
        ],
      ),
    );
  }
}

class _AtalhoEncontros extends StatelessWidget {
  const _AtalhoEncontros();

  @override
  Widget build(BuildContext context) => OutlinedButton.icon(
    icon: const Icon(Icons.event_outlined),
    label: const Text('Encontros'),
    onPressed: () => Navigator.of(context)
        .push(MaterialPageRoute<void>(builder: (_) => const TelaEncontros())),
  );
}

class _Cartao extends StatelessWidget {
  const _Cartao({
    required this.child,
    this.cor = AppAccents.cardBg,
    this.onTap,
  });

  final Widget child;
  final Color cor;
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
          padding: const EdgeInsets.all(18),
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

/// Progresso real (nível, barra e moedas). Lê `GET /me/xp` ao abrir; a
/// coleta de um totem e os resgates atualizam o mesmo valor.
class _CardPontos extends StatefulWidget {
  const _CardPontos();

  @override
  State<_CardPontos> createState() => _CardPontosState();
}

class _CardPontosState extends State<_CardPontos> {
  @override
  void initState() {
    super.initState();
    SessaoUsuario.atual.atualizarXp();
  }

  @override
  Widget build(BuildContext context) => const CartaoProgresso();
}

class _CardVinculo extends StatelessWidget {
  const _CardVinculo();

  @override
  Widget build(BuildContext context) {
    final sessao = SessaoUsuario.atual;
    final ehPadrinho = sessao.ehPadrinhoAtivo;
    final pessoas = ehPadrinho ? sessao.apadrinhados : sessao.padrinhos;
    final titulo = ehPadrinho
        ? (pessoas.length == 1 ? 'Seu apadrinhado' : 'Seus apadrinhados')
        : pessoas.length > 1
        ? 'Seus padrinhos'
        : 'Seu padrinho';

    return _Cartao(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            titulo,
            style: const TextStyle(
              color: AppColors.primary,
              fontSize: 17,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 14),
          if (pessoas.isEmpty)
            Text(
              ehPadrinho
                  ? 'Você ainda não tem apadrinhados neste ciclo. A coordenação faz o vínculo.'
                  : 'Seu padrinho aparece aqui quando a coordenação concluir o vínculo.',
              style: const TextStyle(
                fontFamily: 'Inter',
                color: AppColors.muted,
                fontSize: 14,
              ),
            )
          else
            for (final (indice, pessoa) in pessoas.indexed) ...[
              if (indice > 0) const SizedBox(height: 14),
              _LinhaPessoa(
                pessoa: pessoa,
                onConversar: sessao.situacao?.conversasLiberadas == true
                    ? () => abrirConversas(
                        context,
                        focoEmail: pessoa.email,
                        focoVinculo: pessoa.vinculoId,
                      )
                    : null,
              ),
              if (pessoa.grupoId != null)
                TextButton.icon(
                  onPressed: sessao.situacao?.conversasLiberadas == true
                      ? () => abrirConversas(context, focoGrupo: pessoa.grupoId)
                      : null,
                  icon: const Icon(Icons.groups_outlined),
                  label: Text('Conversa do ${pessoa.grupo ?? 'grupo'}'),
                ),
            ],
        ],
      ),
    );
  }
}

class _LinhaPessoa extends StatelessWidget {
  const _LinhaPessoa({required this.pessoa, required this.onConversar});

  final PessoaVinculo pessoa;
  final VoidCallback? onConversar;

  String get _iniciais {
    if (pessoa.iniciais.isNotEmpty) return pessoa.iniciais;
    final nome = pessoa.nome.trim();
    return nome.isEmpty ? '?' : nome[0].toUpperCase();
  }

  String get _detalhe => [
    if (pessoa.curso.isNotEmpty) pessoa.curso,
    if (pessoa.periodo != null) '${pessoa.periodo}º período',
  ].join(' · ');

  @override
  Widget build(BuildContext context) {
    final botao = OutlinedButton.icon(
      onPressed: onConversar,
      icon: const Icon(Icons.chat_bubble_outline_rounded, size: 18),
      label: const Text(
        'Conversar',
        style: TextStyle(
          fontFamily: 'Inter',
          fontSize: 14,
          fontWeight: FontWeight.w700,
        ),
      ),
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.primary,
        backgroundColor: Colors.white,
        side: const BorderSide(color: AppAccents.cardBorder),
        minimumSize: const Size(0, 44),
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    );
    final identidade = Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            pessoa.nome,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: AppColors.ink,
              fontSize: 17,
              fontWeight: FontWeight.w800,
            ),
          ),
          if (_detalhe.isNotEmpty) ...[
            const SizedBox(height: 3),
            Text(
              _detalhe,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontFamily: 'Inter',
                color: AppColors.muted,
                fontSize: 13,
              ),
            ),
          ],
        ],
      ),
    );
    final avatar = Container(
      width: 60,
      height: 60,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: AppColors.lavender,
        shape: BoxShape.circle,
        border: Border.all(color: AppColors.primary.withValues(alpha: 0.18)),
      ),
      child: Text(
        _iniciais,
        style: const TextStyle(
          color: AppColors.primary,
          fontSize: 20,
          fontWeight: FontWeight.w800,
        ),
      ),
    );

    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth < 340) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(children: [avatar, const SizedBox(width: 12), identidade]),
              const SizedBox(height: 12),
              botao,
            ],
          );
        }
        return Row(
          children: [
            avatar,
            const SizedBox(width: 12),
            identidade,
            const SizedBox(width: 8),
            botao,
          ],
        );
      },
    );
  }
}

/// Ponto de entrada honesto para o mapa: sem distâncias nem XP inventados.
class _ExplorarMapa extends StatelessWidget {
  const _ExplorarMapa();

  @override
  Widget build(BuildContext context) {
    return _Cartao(
      cor: AppColors.lavender,
      onTap: () => navegarDestino(
        context,
        AppDestination.mapa,
        atual: AppDestination.inicio,
      ),
      child: Row(
        children: [
          Container(
            width: 56,
            height: 56,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.7),
              borderRadius: BorderRadius.circular(16),
            ),
            child: const Icon(
              Icons.explore_rounded,
              size: 30,
              color: AppColors.primary,
            ),
          ),
          const SizedBox(width: 14),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Explore o campus',
                  style: TextStyle(
                    color: AppColors.ink,
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                SizedBox(height: 4),
                Text(
                  'Encontre prédios, restaurantes e totens para ganhar XP.',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.muted,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right_rounded, color: AppColors.muted),
        ],
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
      destinations: SessaoUsuario.atual.destinos,
      onSelected: (destination) =>
          navegarDestino(context, destination, atual: AppDestination.inicio),
    );
  }
}
