import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import '../services/auth_api.dart';
import '../services/coordenacao_api.dart';
import '../theme/colors.dart';
import 'tela_candidaturas_coord.dart';
import 'tela_comunicado_coord.dart';
import 'tela_dashboard_coord.dart';
import 'tela_cadastros_coord.dart';
import 'tela_formularios_coord.dart';
import 'tela_mais_coord.dart';
import 'tela_programas_coord.dart';
import 'tela_usuarios_coord.dart';

/// Shell nativo da área da coordenação (app mobile).
/// No computador, o painel continua sendo o front web em `/coordenacao`.
class TelaCoordenacao extends StatefulWidget {
  const TelaCoordenacao({
    super.key,
    this.emailDemo = 'renata@pucminas.edu.br',
    this.client,
    this.baseUrl,
  });

  final String emailDemo;

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
  String? _filtroStatus;
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
      final sessao = await _authApi.loginDemo(widget.emailDemo);
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
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _erro = e.toString().replaceFirst('Exception: ', '');
        _carregando = false;
      });
    }
  }

  void _abrirCandidaturas({String? status}) {
    setState(() {
      _filtroStatus = status;
      _aba = 1;
      _versaoLista++;
    });
  }

  /// Destinos do dashboard (pontos de atenção / ações rápidas) e da aba Mais.
  void _abrirDestino(String destino, Map<String, String> query) {
    final api = _api;
    if (api == null) return;
    if (destino == 'candidaturas') {
      _abrirCandidaturas(status: query['status']);
      return;
    }
    if (destino == 'sem_vinculo') {
      _abrirCandidaturas(status: 'sem_vinculo');
      return;
    }
    final Widget pagina = switch (destino) {
      'cadastros' => TelaCadastrosCoord(api: api, status: query['status']),
      'usuarios' => TelaUsuariosCoord(api: api, programa: _programa),
      'formularios' => TelaFormulariosCoord(api: api, programa: _programa),
      'comunicado' => TelaComunicadoCoord(api: api),
      _ => TelaProgramasCoord(
        api: api,
        pendencia: query['pendencia'],
        onProgramaCriado: (codigo) => setState(() => _programa = codigo),
      ),
    };
    Navigator.of(context)
        .push(MaterialPageRoute<void>(builder: (_) => pagina))
        .then((_) {
          // Força o dashboard/lista a recarregar com os dados alterados.
          if (mounted) setState(() => _versao++);
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
      TelaDashboardCoord(
        key: ValueKey('dashboard-$_versao'),
        api: _api!,
        programa: _programa,
        onProgramaChanged: (codigo) => setState(() => _programa = codigo),
        onVerCandidaturas: _abrirCandidaturas,
        onAbrirDestino: _abrirDestino,
      ),
      TelaCandidaturasCoord(
        key: ValueKey('candidaturas-$_versao-$_versaoLista'),
        api: _api!,
        programa: _programa,
        status: _filtroStatus,
      ),
      TelaMaisCoord(
        nomeCoordenador: _sessao!.nome,
        onAbrir: (destino) => _abrirDestino(destino, const {}),
        onSair: () => Navigator.of(context).maybePop(),
      ),
    ];

    return Scaffold(
      backgroundColor: const Color(0xFFF6F5FB),
      body: IndexedStack(index: _aba, children: paginas),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _aba,
        onDestinationSelected: (i) => setState(() {
          _aba = i;
          if (i == 0) _filtroStatus = null;
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
