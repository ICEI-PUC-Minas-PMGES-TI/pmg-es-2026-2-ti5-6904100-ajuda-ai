import 'package:flutter/material.dart';

import '../sessao_usuario.dart';
import '../theme/colors.dart';
import 'tela_config_apadrinhamento.dart';
import 'tela_config_aparencia.dart';
import 'tela_config_dados.dart';
import 'tela_config_notificacoes.dart';
import 'tela_config_privacidade.dart';
import 'tela_config_suporte.dart';

/// Configurações (p25): lista das seis seções.
class ConfiguracoesPage extends StatelessWidget {
  const ConfiguracoesPage({super.key});

  static final _secoes = <(IconData, String, Widget Function())>[
    (
      Icons.notifications_none_rounded,
      'Notificação e Preferências',
      () => const NotificacoesConfigPage(),
    ),
    (
      Icons.lock_outline,
      'Privacidade e Visibilidade',
      () => const PrivacidadeConfigPage(),
    ),
    (
      Icons.people_outline,
      'Apadrinhamento',
      () => const ApadrinhamentoConfigPage(),
    ),
    (
      Icons.visibility_outlined,
      'Aparência e Acessibilidade',
      () => const AparenciaConfigPage(),
    ),
    (
      Icons.storage_outlined,
      'Dados e Armazenamento',
      () => const DadosConfigPage(),
    ),
    (Icons.explore_outlined, 'Suporte', () => const SuporteConfigPage()),
  ];

  @override
  Widget build(BuildContext context) {
    return EstruturaConfig(
      titulo: 'Configurações',
      children: [
        for (final (icone, titulo, pagina) in _secoes)
          ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 4),
            leading: Icon(icone, color: AppColors.ink),
            title: Text(
              titulo,
              style: const TextStyle(
                fontFamily: 'Inter',
                color: AppColors.ink,
                fontSize: 15,
                fontWeight: FontWeight.w700,
              ),
            ),
            trailing: const Icon(Icons.chevron_right, color: AppColors.muted),
            onTap: () =>
                Navigator.of(context)
                    .push(MaterialPageRoute(builder: (_) => pagina())),
          ),
      ],
    );
  }
}

/// Estrutura comum das telas de configuração (voltar + título).
class EstruturaConfig extends StatelessWidget {
  const EstruturaConfig({
    super.key,
    required this.titulo,
    required this.children,
    this.subtitulo,
  });

  final String titulo;
  final String? subtitulo;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              children: [
                Row(
                  children: [
                    IconButton(
                      onPressed: () => Navigator.of(context).maybePop(),
                      tooltip: 'Voltar',
                      icon: const Icon(
                        Icons.arrow_back_ios_new,
                        color: AppColors.ink,
                        size: 20,
                      ),
                    ),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        titulo,
                        style: const TextStyle(
                          color: AppColors.ink,
                          fontSize: 21,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ],
                ),
                if (subtitulo != null)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
                    child: Text(
                      subtitulo!,
                      style: const TextStyle(
                        fontFamily: 'Inter',
                        color: AppColors.muted,
                        fontSize: 13,
                        height: 1.4,
                      ),
                    ),
                  ),
                const SizedBox(height: 14),
                ...children,
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Interruptor ligado a uma chave de [SessaoUsuario.preferencias].
class LinhaPreferencia extends StatefulWidget {
  const LinhaPreferencia({
    super.key,
    required this.chave,
    required this.titulo,
    required this.descricao,
  });

  final String chave;
  final String titulo;
  final String descricao;

  @override
  State<LinhaPreferencia> createState() => _LinhaPreferenciaState();
}

class _LinhaPreferenciaState extends State<LinhaPreferencia> {
  Map<String, bool> get _prefs => SessaoUsuario.atual.preferencias;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppAccents.cardBorder),
      ),
      child: SwitchListTile(
        value: _prefs[widget.chave] ?? false,
        activeThumbColor: Colors.white,
        activeTrackColor: AppColors.primary,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        title: Text(
          widget.titulo,
          style: const TextStyle(
            fontFamily: 'Inter',
            color: AppColors.ink,
            fontSize: 14,
            fontWeight: FontWeight.w700,
          ),
        ),
        subtitle: Text(
          widget.descricao,
          style: const TextStyle(
            fontFamily: 'Inter',
            color: AppColors.muted,
            fontSize: 12,
          ),
        ),
        onChanged: (valor) => setState(() => _prefs[widget.chave] = valor),
      ),
    );
  }
}

/// Texto de rodapé das telas de configuração.
class NotaConfig extends StatelessWidget {
  const NotaConfig(this.texto, {super.key});

  final String texto;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Text(
        texto,
        style: const TextStyle(
          fontFamily: 'Inter',
          color: AppColors.muted,
          fontSize: 12,
          height: 1.4,
        ),
      ),
    );
  }
}
