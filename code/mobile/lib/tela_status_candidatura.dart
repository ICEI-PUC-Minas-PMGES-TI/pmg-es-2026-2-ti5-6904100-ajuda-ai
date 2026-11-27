import 'package:flutter/material.dart';

import 'configuracoes/tela_config_suporte.dart';
import 'sessao_usuario.dart';
import 'status_participacao.dart';
import 'widgets/app_bottom_navigation.dart';
import 'widgets/navegacao_app.dart';
import 'theme/colors.dart';
import 'widgets/cabecalho_logos.dart';
import 'widgets/campos_cadastro.dart';

enum _EstadoEtapa { concluida, atual, futura, negativa }

/// Status da candidatura de padrinho (versão mobile da p08).
class StatusCandidaturaPage extends StatefulWidget {
  const StatusCandidaturaPage({super.key});

  @override
  State<StatusCandidaturaPage> createState() => _StatusCandidaturaPageState();
}

class _StatusCandidaturaPageState extends State<StatusCandidaturaPage> {
  bool _sincronizando = true;
  String? _erro;

  SessaoUsuario get _sessao => SessaoUsuario.atual;

  @override
  void initState() {
    super.initState();
    _sincronizar();
  }

  Future<void> _sincronizar() async {
    setState(() => _sincronizando = true);
    final ok = await _sessao.sincronizarSituacao(forcar: true);
    _erro = ok ? null : 'Não foi possível consultar a candidatura. Atualize para tentar novamente.';
    if (mounted) setState(() => _sincronizando = false);
  }

  String get _situacao => _sessao.situacao?.situacao ?? 'nenhuma';

  static const _meses = [
    'jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', //
    'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.',
  ];

  String _formatar(DateTime data) {
    final hora = data.hour.toString().padLeft(2, '0');
    final minuto = data.minute.toString().padLeft(2, '0');
    return '${data.day} de ${_meses[data.month - 1]} de ${data.year} • '
        '$hora:$minuto';
  }

  List<(String, String, _EstadoEtapa)> _etapas() {
    final situacao = _situacao;
    final enviadaEm =
        _sessao.situacao?.criadoEm ?? _sessao.candidaturaEnviadaEm;
    final grupo = _sessao.grupo;
    final analisada =
        situacao == 'candidatura_rejeitada' ||
        situacao == 'padrinho_ativo' ||
        situacao == 'candidatura_aprovada_aguardando_matching';

    return [
      (
        'Candidatura enviada',
        enviadaEm == null ? 'Recebemos suas respostas.' : _formatar(enviadaEm),
        _EstadoEtapa.concluida,
      ),
      switch (situacao) {
        'candidatura_pendente' => (
          'Candidatura recebida',
          'Sua candidatura está na fila de análise da coordenação.',
          _EstadoEtapa.atual,
        ),
        _ when analisada => (
          'Em análise',
          'Análise concluída pela coordenação.',
          _EstadoEtapa.concluida,
        ),
        _ => (
          'Em análise',
          'Nossa equipe está analisando suas informações.',
          _EstadoEtapa.atual,
        ),
      },
      switch (situacao) {
        'candidatura_rejeitada' => (
          'Resultado',
          _sessao.motivoRejeicao == null
              ? 'Sua candidatura não foi aprovada neste ciclo. Você poderá '
                    'tentar novamente nas próximas inscrições.'
              : 'Sua candidatura não foi aprovada. Motivo: '
                    '${_sessao.motivoRejeicao}',
          _EstadoEtapa.negativa,
        ),
        'candidatura_aprovada_aguardando_matching' => (
          'Candidatura aprovada',
          'Aguardando definição do seu grupo.',
          _EstadoEtapa.concluida,
        ),
        'padrinho_ativo' => (
          'Resultado',
          'Candidatura aprovada! Boas-vindas ao time de padrinhos.',
          _EstadoEtapa.concluida,
        ),
        _ => (
          'Resultado',
          'Você será notificado aqui e no aplicativo.',
          _EstadoEtapa.futura,
        ),
      },
      if (situacao == 'padrinho_ativo' && grupo != null)
        (
          'Início das atividades',
          'Você está no $grupo. Acompanhe seus apadrinhados pelo perfil.',
          _EstadoEtapa.concluida,
        )
      else if (situacao == 'padrinho_ativo')
        (
          'Início das atividades',
          'A coordenação está formando os grupos.',
          _EstadoEtapa.atual,
        )
      else
        (
          'Início das atividades',
          'Após a aprovação, você receberá orientações para começar.',
          _EstadoEtapa.futura,
        ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final semCandidatura =
        _situacao == 'nenhuma' || _situacao.startsWith('apadrinhado');
    final periodoAnalise = _sessao.situacao?.programa
        ?.etapa('analise')
        ?.periodoTexto;

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: RefreshIndicator(
              color: AppColors.primary,
              onRefresh: _sincronizar,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
                children: [
                  const CabecalhoLogos(),
                  if (_sincronizando)
                    const Padding(
                      padding: EdgeInsets.only(top: 8),
                      child: LinearProgressIndicator(
                        minHeight: 2,
                        color: AppColors.primary,
                        backgroundColor: AppColors.lavender,
                      ),
                    )
                  else
                    const SizedBox(height: 10),
                  const SizedBox(height: 10),
                  const Text(
                    'Status da candidatura',
                    style: TextStyle(
                      color: AppColors.ink,
                      fontSize: 26,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.4,
                      height: 1.1,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Acompanhe as etapas da análise da sua candidatura para '
                    'ser padrinho(a).',
                    style: TextStyle(
                      fontFamily: 'Inter',
                      color: AppColors.muted,
                      fontSize: 13,
                      height: 1.4,
                    ),
                  ),
                  Text(_sessao.status.titulo),
                  Text('Ciclo: ${_sessao.programaAtual}'),
                  TextButton(
                    onPressed: () => Navigator.of(context).pushReplacement(
                      MaterialPageRoute<void>(
                        builder: (_) =>
                            const AppShell(inicial: AppDestination.perfil),
                      ),
                    ),
                    child: const Text('Meu perfil'),
                  ),
                  const SizedBox(height: 18),
                  if (_erro != null)
                    Text(_erro!, style: const TextStyle(color: Colors.red))
                  else if (semCandidatura)
                    const AvisoCadastro(
                      child: Text(
                        'Você ainda não tem uma candidatura a padrinho neste '
                        'ciclo. Pelo seu perfil você pode se candidatar quando '
                        'estiver a partir do 2º período.',
                        style: TextStyle(
                          fontFamily: 'Inter',
                          color: AppColors.ink,
                          fontSize: 13,
                          height: 1.4,
                        ),
                      ),
                    )
                  else ...[
                    const _Agradecimento(),
                    const SizedBox(height: 14),
                    _Linha(etapas: _etapas()),
                    const SizedBox(height: 14),
                    AvisoCadastro(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Prazo de análise',
                            style: TextStyle(
                              fontFamily: 'Inter',
                              color: AppColors.primary,
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            periodoAnalise == null
                                ? 'A análise das candidaturas é feita conforme '
                                      'o calendário do programa. Você receberá '
                                      'um aviso no aplicativo assim que houver '
                                      'uma atualização.'
                                : 'A análise das candidaturas acontece de '
                                      '$periodoAnalise. Você receberá um aviso '
                                      'no aplicativo assim que houver uma '
                                      'atualização.',
                            style: const TextStyle(
                              fontFamily: 'Inter',
                              color: AppColors.ink,
                              fontSize: 12,
                              height: 1.4,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 12),
                  _CardDuvidas(
                    onAjuda: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => const SuporteConfigPage(),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Linha extends StatelessWidget {
  const _Linha({required this.etapas});

  final List<(String, String, _EstadoEtapa)> etapas;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 16, 14, 4),
      decoration: EstiloCampo.decoracao(),
      child: Column(
        children: [
          for (final (i, (titulo, descricao, estado)) in etapas.indexed)
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Column(
                    children: [
                      _Marcador(estado: estado),
                      if (i < etapas.length - 1)
                        Expanded(
                          child: Container(
                            width: 2,
                            color: estado == _EstadoEtapa.concluida
                                ? AppColors.primary
                                : AppAccents.cardBorder,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.only(bottom: 16, top: 2),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            titulo,
                            style: TextStyle(
                              fontFamily: 'Inter',
                              color: estado == _EstadoEtapa.futura
                                  ? AppColors.muted
                                  : estado == _EstadoEtapa.negativa
                                  ? const Color(0xFFB45309)
                                  : AppColors.primary,
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 2),
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
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _Marcador extends StatelessWidget {
  const _Marcador({required this.estado});

  final _EstadoEtapa estado;

  @override
  Widget build(BuildContext context) {
    return switch (estado) {
      _EstadoEtapa.concluida => const CircleAvatar(
        radius: 13,
        backgroundColor: Color(0xFF13A05F),
        child: Icon(Icons.check, size: 16, color: Colors.white),
      ),
      _EstadoEtapa.negativa => const CircleAvatar(
        radius: 13,
        backgroundColor: Color(0xFFC2334F),
        child: Icon(Icons.close, size: 16, color: Colors.white),
      ),
      _EstadoEtapa.atual => Container(
        width: 26,
        height: 26,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: const Color(0xFF13A05F), width: 2),
        ),
        child: const CircleAvatar(
          radius: 6,
          backgroundColor: Color(0xFF13A05F),
        ),
      ),
      _EstadoEtapa.futura => Container(
        width: 26,
        height: 26,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: AppAccents.cardBorder, width: 2),
        ),
      ),
    };
  }
}

class _Agradecimento extends StatelessWidget {
  const _Agradecimento();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.lavender,
        borderRadius: BorderRadius.circular(14),
      ),
      child: const Row(
        children: [
          CircleAvatar(
            radius: 24,
            backgroundColor: Colors.white,
            child: Icon(
              Icons.volunteer_activism_outlined,
              color: AppColors.primary,
            ),
          ),
          SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Obrigado por se candidatar!',
                  style: TextStyle(
                    color: AppColors.ink,
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                SizedBox(height: 2),
                Text(
                  'Sua iniciativa faz a diferença na jornada de novos alunos '
                  'da PUC Minas.',
                  style: TextStyle(
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
    );
  }
}

class _CardDuvidas extends StatelessWidget {
  const _CardDuvidas({required this.onAjuda});

  final VoidCallback onAjuda;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: EstiloCampo.decoracao(),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppAccents.tileLilas,
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.help_outline, color: AppColors.primary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Dúvidas?',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.ink,
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 2),
                const Text(
                  'Acesse a central de ajuda ou entre em contato com a '
                  'coordenação do programa.',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.muted,
                    fontSize: 12,
                    height: 1.35,
                  ),
                ),
                TextButton(
                  onPressed: onAjuda,
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.primary,
                    padding: EdgeInsets.zero,
                    minimumSize: const Size(0, 36),
                  ),
                  child: const Text(
                    'Acessar ajuda →',
                    style: TextStyle(
                      fontFamily: 'Inter',
                      fontWeight: FontWeight.w700,
                      decoration: TextDecoration.underline,
                      decorationColor: AppColors.primary,
                    ),
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
