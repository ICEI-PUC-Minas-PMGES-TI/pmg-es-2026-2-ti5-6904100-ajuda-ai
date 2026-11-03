import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import '../services/auth_api.dart';
import '../services/api_config.dart';
import '../services/coordenacao_api.dart';
import '../tela_login.dart';
import '../tela_feed.dart';
import '../theme/colors.dart';
import 'tela_candidaturas_coord.dart';
import 'tela_configuracoes_coord.dart';
import 'tela_dashboard_coord.dart';
import 'tela_formularios_coord.dart';
import 'tela_mais_coord.dart';
import 'tela_matching_coord.dart';
import 'tela_programas_coord.dart';
import 'tela_usuarios_coord.dart';

/// Shell nativo da área da coordenação (app mobile).
/// O feed pode ser administrado integralmente pelo aplicativo.
class TelaCoordenacao extends StatefulWidget {
  const TelaCoordenacao({
    super.key,
    this.emailDemo = 'renata@pucminas.edu.br',
    this.client,
    this.baseUrl,
    this.sessaoAutenticada,
    this.feedEventsClientFactory,
  });

  final String emailDemo;
  final SessaoAuth? sessaoAutenticada;
  final http.Client Function()? feedEventsClientFactory;

  /// Cliente HTTP injetável (testes); null usa o padrão.
  final http.Client? client;

  /// Base fixa da API (testes); null tenta os candidatos de `apiBaseUrlCandidates`.
  final String? baseUrl;

  @override
  State<TelaCoordenacao> createState() => _TelaCoordenacaoState();
}

class _TelaCoordenacaoState extends State<TelaCoordenacao> {
  late final _authApi = AuthApi(client: widget.client, baseUrl: widget.baseUrl);
  SessaoAuth? _sessao;
  CoordenacaoApi? _api;
  String? _erro;
  bool _carregando = true;
  int _aba = 0;
  String? _programa;
  String? _programaSolicitado;
  bool _exigirSelecao = false;
  List<Map<String, dynamic>> _programas = const [];
  bool _carregandoProgramas = true;
  String? _erroProgramas;
  String? _avisoPrograma;
  int _consultaProgramas = 0;
  String? _filtroStatus;
  String? _filtroPublico;
  int _versao = 0;
  int _versaoLista = 0;

  @override
  void initState() {
    super.initState();
    _entrar();
  }

  Future<void> _entrar() async {
    setState(() {
      _carregando = true;
      _erro = null;
    });
    try {
      final sessao =
          widget.sessaoAutenticada ??
          await _authApi.loginDemo(widget.emailDemo);
      if (!sessao.ehCoordenador) {
        throw Exception('Acesso restrito à coordenação.');
      }
      if (!mounted) return;
      setState(() {
        _sessao = sessao;
        // Reutiliza a mesma base que respondeu no login (10.0.2.2 ou fallback).
        _api = CoordenacaoApi(
          accessToken: sessao.accessToken,
          baseUrl: _authApi.baseUrl,
          client: widget.client,
        );
        _carregando = false;
      });
      await _carregarProgramas();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _erro = e.toString().replaceFirst('Exception: ', '');
        _carregando = false;
      });
    }
  }

  Future<void> _carregarProgramas({String? preferido}) async {
    final api = _api;
    if (api == null) return;
    if (preferido != null) _programaSolicitado = preferido;
    final consulta = ++_consultaProgramas;
    setState(() {
      _carregandoProgramas = true;
      _erroProgramas = null;
    });
    try {
      final lista = await api.programas();
      if (!mounted || consulta != _consultaProgramas) return;
      final anterior = _programaSolicitado ?? _programa;
      final existe = lista.any((p) => p['codigo'] == anterior);
      setState(() {
        _programas = lista;
        if (_programaSolicitado != null && existe) _exigirSelecao = false;
        _programaSolicitado = null;
        _programa = existe
            ? anterior
            : !_exigirSelecao && lista.length == 1
            ? lista.single['codigo'] as String
            : null;
        _avisoPrograma = anterior != null && !existe
            ? 'O programa selecionado não está mais disponível. Confira o ciclo antes de continuar.'
            : null;
        _carregandoProgramas = false;
        _filtroStatus = null;
        _filtroPublico = null;
        _versao++;
        _versaoLista++;
      });
    } catch (erro) {
      if (!mounted || consulta != _consultaProgramas) return;
      setState(() {
        _erroProgramas = erro is ApiIndisponivelException
            ? 'Não foi possível carregar os programas. Verifique sua conexão e tente novamente.'
            : 'Não foi possível carregar os programas da coordenação. Tente novamente.';
        _carregandoProgramas = false;
      });
    }
  }

  void _selecionarPrograma(String? codigo) {
    if (codigo == null || !_programas.any((p) => p['codigo'] == codigo)) return;
    setState(() {
      _programa = codigo;
      _exigirSelecao = false;
      _avisoPrograma = null;
      _filtroStatus = null;
      _filtroPublico = null;
      _versao++;
      _versaoLista++;
    });
  }

  void _sair() {
    _consultaProgramas++;
    _sessao = null;
    _api = null;
    encerrarSessao(context, client: widget.client, baseUrl: widget.baseUrl);
  }

  Widget _estadoContexto() {
    if (_carregandoProgramas) {
      return const Center(child: CircularProgressIndicator());
    }
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              _erroProgramas ??
                  (_programas.isEmpty
                      ? 'Nenhum programa cadastrado. Abra um ciclo em Programas para começar.'
                      : 'Selecione um programa/ciclo para administrar.'),
              textAlign: TextAlign.center,
            ),
            if (_erroProgramas != null)
              FilledButton(
                onPressed: _carregarProgramas,
                child: const Text('Tentar novamente'),
              ),
            if (_erroProgramas == null)
              TextButton(
                onPressed: () => _abrirDestino('programas', const {}),
                child: const Text('Gerenciar programas'),
              ),
          ],
        ),
      ),
    );
  }

  void _abrirCandidaturas({String? status, String? publico}) {
    setState(() {
      _filtroStatus = status;
      _filtroPublico = publico;
      _aba = 1;
      _versaoLista++;
    });
  }

  /// Destinos do dashboard (pontos de atenção / ações rápidas) e da aba Mais.
  void _abrirDestino(String destino, Map<String, String> query) {
    if (destino == 'comunicado') destino = 'feed';
    final api = _api;
    if (api == null) return;
    if (_programa == null &&
        destino != 'programas' &&
        destino != 'configuracoes' &&
        destino != 'feed') {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Selecione um programa/ciclo antes de abrir esta seção.',
          ),
        ),
      );
      return;
    }
    if (destino == 'candidaturas' || destino == 'cadastros') {
      _abrirCandidaturas(
        status: query['status'] ?? (destino == 'cadastros' ? 'pendente' : null),
        publico:
            query['publico'] ?? (destino == 'cadastros' ? 'apadrinhado' : null),
      );
      return;
    }
    if (destino == 'sem_vinculo') {
      _abrirCandidaturas(status: 'sem_vinculo', publico: 'apadrinhado');
      return;
    }
    if (destino == 'configuracoes') {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => TelaConfiguracoesCoord(
            nome: _sessao?.nome ?? 'Coordenação',
            email: _sessao?.email ?? widget.emailDemo,
            onSair: () {
              Navigator.of(context).pop();
              _sair();
            },
          ),
        ),
      );
      return;
    }
    final Widget pagina = switch (destino) {
      'feed' => FeedPage(
        client: widget.client,
        accessToken: _sessao!.accessToken,
        baseUrl: api.baseUrl,
        nomeAutor: _sessao!.nome,
        coordenacao: true,
        eventsClientFactory: widget.feedEventsClientFactory,
      ),
      'usuarios' => TelaUsuariosCoord(api: api, programa: _programa),
      'formularios' => TelaFormulariosCoord(api: api, programa: _programa),
      'matching' => TelaMatchingCoord(api: api, programa: _programa!),
      _ => TelaProgramasCoord(
        api: api,
        pendencia: query['pendencia'],
        iniciarNovo: query['novo'] == '1',
        onProgramaCriado: (codigo) => _carregarProgramas(preferido: codigo),
        onProgramaSelecionado: (codigo) {
          _aba = 0;
          _carregarProgramas(preferido: codigo);
        },
        onProgramaExcluido: (codigo) {
          if (_programaSolicitado == codigo) _programaSolicitado = null;
          if (_programa == codigo) {
            _programa = null;
            _exigirSelecao = true;
            _aba = 0;
            _filtroStatus = null;
            _filtroPublico = null;
            Navigator.of(context).pop();
          }
          _carregarProgramas();
        },
      ),
    };
    Navigator.of(context)
        .push(MaterialPageRoute<void>(builder: (_) => pagina))
        .then((_) {
          // Força o dashboard/lista a recarregar com os dados alterados.
          if (mounted) _carregarProgramas();
        });
  }

  @override
  Widget build(BuildContext context) {
    if (_carregando) {
      return const Scaffold(
        backgroundColor: Color(0xFFF6F5FB),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircularProgressIndicator(color: AppColors.primary),
              SizedBox(height: 16),
              Text('Abrindo painel da coordenação…'),
            ],
          ),
        ),
      );
    }

    if (_erro != null || _api == null || _sessao == null) {
      return Scaffold(
        backgroundColor: const Color(0xFFF6F5FB),
        appBar: AppBar(
          title: const Text('Coordenação'),
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
        ),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  _erro ?? 'Não foi possível abrir o painel.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppColors.ink),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _entrar,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                  ),
                  child: const Text('Tentar novamente'),
                ),
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Voltar'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final paginas = [
      if (_programa != null && !_carregandoProgramas && _erroProgramas == null)
        TelaDashboardCoord(
          key: ValueKey('dashboard-$_programa-$_versao'),
          api: _api!,
          programa: _programa!,
          onProgramaChanged: (codigo) => _carregarProgramas(preferido: codigo),
          mostrarSeletor: false,
          onVerCandidaturas: _abrirCandidaturas,
          onAbrirDestino: _abrirDestino,
        )
      else
        _estadoContexto(),
      if (_programa != null && !_carregandoProgramas && _erroProgramas == null)
        TelaCandidaturasCoord(
          key: ValueKey(
            'candidaturas-$_programa-$_versao-$_versaoLista-$_filtroPublico-$_filtroStatus',
          ),
          api: _api!,
          programa: _programa,
          status: _filtroStatus,
          publico: _filtroPublico,
        )
      else
        _estadoContexto(),
      TelaMaisCoord(
        nomeCoordenador: _sessao!.nome,
        onAbrir: (destino) => _abrirDestino(destino, const {}),
        onSair: _sair,
      ),
    ];

    return Scaffold(
      backgroundColor: const Color(0xFFF6F5FB),
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  Expanded(
                    child: _programas.isEmpty
                        ? const Text('Coordenação')
                        : DropdownButton<String>(
                            key: const ValueKey('programa-coordenacao'),
                            isExpanded: true,
                            value: _programa,
                            hint: const Text('Selecione o programa/ciclo'),
                            items: _programas
                                .map(
                                  (p) => DropdownMenuItem<String>(
                                    value: p['codigo'] as String,
                                    child: Text(
                                      '${p['titulo'] ?? p['nome'] ?? 'Programa ${p['codigo']}'}',
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                )
                                .toList(),
                            onChanged:
                                _carregandoProgramas || _erroProgramas != null
                                ? null
                                : _selecionarPrograma,
                          ),
                  ),
                  IconButton(
                    tooltip: 'Feed do programa',
                    onPressed: () => _abrirDestino('feed', const {}),
                    icon: const Icon(Icons.dynamic_feed_outlined),
                  ),
                  IconButton(
                    tooltip: 'Atualizar programas',
                    onPressed: _carregandoProgramas ? null : _carregarProgramas,
                    icon: const Icon(Icons.refresh),
                  ),
                  IconButton(
                    tooltip: 'Sair da coordenação',
                    onPressed: _sair,
                    icon: const Icon(Icons.logout),
                  ),
                ],
              ),
            ),
            if (_avisoPrograma != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text(_avisoPrograma!),
              ),
            Expanded(
              child:
                  _carregandoProgramas ||
                      _erroProgramas != null ||
                      _programa == null
                  ? (_aba == 2 &&
                            !_carregandoProgramas &&
                            _erroProgramas == null
                        ? paginas[2]
                        : _estadoContexto())
                  : IndexedStack(index: _aba, children: paginas),
            ),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _aba,
        onDestinationSelected: (i) => setState(() {
          _aba = i;
          if (i == 0) {
            _filtroStatus = null;
            _filtroPublico = null;
          }
        }),
        backgroundColor: Colors.white,
        indicatorColor: const Color(0xFFEBE4FF),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard, color: AppColors.primary),
            label: 'Dashboard',
          ),
          NavigationDestination(
            icon: Icon(Icons.assignment_outlined),
            selectedIcon: Icon(Icons.assignment, color: AppColors.primary),
            label: 'Candidaturas',
          ),
          NavigationDestination(
            icon: Icon(Icons.more_horiz),
            selectedIcon: Icon(Icons.more_horiz, color: AppColors.primary),
            label: 'Mais',
          ),
        ],
      ),
    );
  }
}
