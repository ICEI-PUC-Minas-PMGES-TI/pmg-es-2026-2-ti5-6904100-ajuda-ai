import 'package:flutter/material.dart';

import '../sessao_usuario.dart';
import '../tela_feed.dart';
import '../tela_home.dart';
import '../tela_mapa.dart';
import '../tela_perfil.dart';
import 'app_bottom_navigation.dart';
import 'revalidar_participacao.dart';

/// Diagnóstico de navegação, só em debug: mostra quando uma página nasce ou
/// morre e quando a participação é consultada. Cada página deve aparecer UMA
/// vez por sessão; repetição indica recriação indevida.
export '../services/diagnostico_navegacao.dart';

/// Casca do app logado: a barra de baixo fica fixa e só o conteúdo acima dela
/// muda. As abas já visitadas continuam vivas (mapa e feed não recarregam).
class AppShell extends StatefulWidget {
  const AppShell({
    super.key,
    this.inicial = AppDestination.inicio,
    @visibleForTesting this.construtorDePagina,
  });

  final AppDestination inicial;

  /// Só para testes: páginas de mentira no lugar das reais.
  final Widget Function(AppDestination)? construtorDePagina;

  /// A casca mais próxima, ou `null` fora dela.
  static AppShellState? of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<_EscopoCasca>()?.estado;

  static bool dentro(BuildContext context) => of(context) != null;

  @override
  State<AppShell> createState() => AppShellState();
}

class AppShellState extends State<AppShell>
    with SingleTickerProviderStateMixin {
  late AppDestination _atual;
  final _visitadas = <AppDestination>{};

  /// Crossfade: a página nova aparece sobre a anterior, que continua opaca por
  /// baixo até o fim. Assim nunca há um instante sem conteúdo (sem piscada).
  late final AnimationController _fade = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 150),
    value: 1,
  );

  /// Página que está saindo (só visível enquanto o fade corre).
  AppDestination? _saindo;

  @override
  void initState() {
    super.initState();
    _atual = widget.inicial;
    _visitadas.add(_atual);
  }

  @override
  void dispose() {
    _fade.dispose();
    super.dispose();
  }

  AppDestination get atual => _atual;

  void ir(AppDestination destino) {
    if (destino == _atual) return;
    if (destino == AppDestination.missoes) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(content: Text('Missões: em breve!')));
      return;
    }
    final antes = _atual;
    // O mapa 3D é uma view nativa: sem opacidade nem duas telas ao mesmo
    // tempo. Entrar ou sair dele troca na hora; o fade é só entre as outras.
    final instantaneo =
        MediaQuery.disableAnimationsOf(context) ||
        destino == AppDestination.mapa ||
        antes == AppDestination.mapa;
    setState(() {
      _atual = destino;
      _visitadas.add(destino);
      if (instantaneo || (destino == _saindo && _fade.value < 1)) {
        // Voltar para a que ainda estava visível por baixo: já está pronta.
        _saindo = null;
        _fade.value = 1;
      } else {
        // Troca no meio de outra: a anterior (qualquer que seja) fica opaca
        // por baixo e o fade recomeça, sem acumular animações.
        _saindo = antes;
        _fade.forward(from: 0);
      }
    });
  }

  /// Uma camada por página visitada. A estrutura de cada camada nunca muda
  /// (chave + TickerMode + Offstage + Opacity), então a página não é recriada
  /// nem perde estado, mesmo quando a ordem das camadas muda.
  Widget _camada(AppDestination d, AppDestination atual) {
    return KeyedSubtree(
      key: ValueKey(
        '${SessaoUsuario.atual.identidade?.email}:${SessaoUsuario.atual.accessToken}:$d',
      ),
      child: AnimatedBuilder(
        animation: _fade,
        // As páginas são o `child`: o fade não reconstrói nenhuma delas.
        child: _pagina(d),
        builder: (context, pagina) {
          final t = Curves.easeOutCubic.transform(_fade.value);
          final ativa = d == atual;
          final saindo = !ativa && d == _saindo && _fade.value < 1;
          final visivel = ativa || saindo;
          return TickerMode(
            enabled: visivel,
            child: Offstage(
              offstage: !visivel,
              child: IgnorePointer(
                ignoring: !ativa,
                // Opacity em 1.0 não cria camada: em repouso custa nada.
                child: Opacity(opacity: ativa ? t : 1, child: pagina),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _pagina(AppDestination destino) =>
      widget.construtorDePagina?.call(destino) ??
      switch (destino) {
        AppDestination.inicio => const HomePage(),
        AppDestination.feed => const FeedPage(),
        AppDestination.perfil => const ProfilePage(),
        AppDestination.mapa => const MapaPage(),
        AppDestination.missoes => const SizedBox.shrink(),
      };

  /// Fundo para frente: as ocultas, a que sai e, por cima, a atual.
  List<AppDestination> _ordem(AppDestination atual) {
    final todas = {..._visitadas, atual};
    final saindo = _saindo;
    // Sem fade em curso (troca instantânea, inclusive de/para o mapa), a ordem
    // natural basta e o mapa nunca muda de posição na pilha.
    if (saindo == null) {
      return [
        for (final d in AppDestination.values)
          if (todas.contains(d)) d,
      ];
    }
    return [
      for (final d in AppDestination.values)
        if (todas.contains(d) && d != atual && d != saindo) d,
      if (saindo != atual && todas.contains(saindo)) saindo,
      atual,
    ];
  }

  @override
  Widget build(BuildContext context) {
    // As abas vêm da situação confirmada do usuário. A casca ouve a sessão:
    // mudança real de participação atualiza a barra, e uma consulta em
    // andamento ou falha não (a sessão guarda o último valor confirmado).
    return RevalidarParticipacao(
      atualizar: () => SessaoUsuario.atual.sincronizarSituacao(),
      child: ListenableBuilder(
        listenable: SessaoUsuario.atual.mudancas,
        builder: (context, _) {
          final destinos = SessaoUsuario.atual.destinos;
          // A aba atual é a fonte de verdade; se a participação realmente
          // acabou e ela saiu da lista, cai na primeira permitida.
          final atual = destinos.contains(_atual) ? _atual : destinos.first;
          return _EscopoCasca(
            estado: this,
            atual: atual,
            child: Scaffold(
              backgroundColor: Colors.white,
              // Páginas vivas, uma camada cada. A atual fica por último (por cima)
              // e entra em fade sobre a que sai; a barra anima à parte.
              body: Stack(
                fit: StackFit.expand,
                children: [for (final d in _ordem(atual)) _camada(d, atual)],
              ),
              bottomNavigationBar: AppBottomNavigation(
                daCasca: true,
                selected: atual,
                destinations: destinos,
                onSelected: ir,
              ),
            ),
          );
        },
      ),
    );
  }
}

class _EscopoCasca extends InheritedWidget {
  const _EscopoCasca({
    required this.estado,
    required this.atual,
    required super.child,
  });

  final AppShellState estado;
  final AppDestination atual;

  @override
  bool updateShouldNotify(_EscopoCasca antigo) => antigo.atual != atual;
}

/// Troca de aba: dentro da casca só muda o conteúdo; fora dela (telas soltas,
/// como o status da candidatura) entra na casca já na aba pedida.
void navegarDestino(
  BuildContext context,
  AppDestination destination, {
  required AppDestination atual,
}) {
  if (destination == atual) return;
  final casca = AppShell.of(context);
  if (casca != null) {
    casca.ir(destination);
    return;
  }
  if (destination == AppDestination.missoes) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(const SnackBar(content: Text('Missões: em breve!')));
    return;
  }
  Navigator.of(context).pushReplacement(
    MaterialPageRoute(builder: (_) => AppShell(inicial: destination)),
  );
}
