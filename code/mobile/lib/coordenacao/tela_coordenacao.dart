import 'package:flutter/material.dart';

import '../services/auth_api.dart';
import '../services/coordenacao_api.dart';
import '../theme/colors.dart';
import 'tela_candidaturas_coord.dart';
import 'tela_dashboard_coord.dart';

/// Shell nativo da área da coordenação (app mobile).
/// No computador, o painel continua sendo o front web em `/coordenacao`.
class TelaCoordenacao extends StatefulWidget {
  const TelaCoordenacao({super.key, this.emailDemo = 'renata@pucminas.edu.br'});

  final String emailDemo;

  @override
  State<TelaCoordenacao> createState() => _TelaCoordenacaoState();
}

class _TelaCoordenacaoState extends State<TelaCoordenacao> {
  final _authApi = AuthApi();
  SessaoAuth? _sessao;
  CoordenacaoApi? _api;
  String? _erro;
  bool _carregando = true;
  int _aba = 0;
  String? _programa;
  String? _filtroStatus;

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
    });
  }

  void _abrirDestino(String destino, Map<String, String> query) {
    if (destino == 'candidaturas') {
      _abrirCandidaturas(status: query['status']);
      return;
    }
    final pendencia = query['pendencia'];
    final mensagem = switch (destino) {
      'programas' when pendencia == 'grupos' =>
        'Abra Programas no painel web para revisar grupos incompletos.',
      'programas' when pendencia == 'prazo' =>
        'Abra Programas no painel web para revisar o prazo de inscrições.',
      'usuarios' => 'Abra Usuários no painel web para gerenciar vínculos.',
      _ => 'Seção disponível no painel web da coordenação.',
    };
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(mensagem)));
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
                  style: FilledButton.styleFrom(backgroundColor: AppColors.primary),
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
        api: _api!,
        programa: _programa,
        onProgramaChanged: (codigo) => setState(() => _programa = codigo),
        onVerCandidaturas: _abrirCandidaturas,
        onAbrirDestino: _abrirDestino,
      ),
      TelaCandidaturasCoord(
        api: _api!,
        programa: _programa,
        status: _filtroStatus,
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
        ],
      ),
    );
  }
}
