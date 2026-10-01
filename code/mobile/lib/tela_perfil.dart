import 'package:flutter/material.dart';

import 'dados_cadastro.dart';
import 'sessao_usuario.dart';
import 'status_participacao.dart';
import 'tela_cadastro_padrinho.dart';
import 'tela_cadastro_perfil.dart';
import 'tela_historico.dart';
import 'tela_login.dart';
import 'theme/colors.dart';
import 'widgets/app_bottom_navigation.dart';
import 'widgets/navegacao_app.dart';

const _borda = Color(0xFFE9E5F1);
const _bordaLilas = Color(0xFFDDD2F3);
const _fundoLilasCard = Color(0xFFF8F5FC);

class _DadosPerfil {
  const _DadosPerfil({
    required this.nome,
    required this.curso,
    required this.periodo,
    required this.email,
    required this.sobre,
  });

  final String nome;
  final String curso;
  final String periodo;
  final String email;
  final String sobre;

  String get iniciais {
    final partes = nome
        .trim()
        .split(RegExp(r'\s+'))
        .where((parte) => parte.isNotEmpty)
        .toList();
    if (partes.isEmpty) return '?';
    if (partes.length == 1) {
      return partes.first.substring(0, 1).toUpperCase();
    }
    return '${partes.first[0]}${partes.last[0]}'.toUpperCase();
  }

  _DadosPerfil copyWith({
    String? nome,
    String? curso,
    String? periodo,
    String? email,
    String? sobre,
  }) {
    return _DadosPerfil(
      nome: nome ?? this.nome,
      curso: curso ?? this.curso,
      periodo: periodo ?? this.periodo,
      email: email ?? this.email,
      sobre: sobre ?? this.sobre,
    );
  }
}

class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key});

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  static const _fallback = _DadosPerfil(
    nome: 'Ana Clara',
    curso: 'Engenharia Química',
    periodo: '1º período',
    email: 'ana.clara@pucminas.edu.br',
    sobre:
        'Gosto de tecnologia, inovação e projetos no campus. '
        'Estou no primeiro período e quero conhecer a rotina da PUC.',
  );

  late _DadosPerfil _dados;
  bool _editando = false;
  bool _detalhesCandidaturaAbertos = false;

  late final TextEditingController _nomeController;
  late final TextEditingController _cursoController;
  late final TextEditingController _periodoController;
  late final TextEditingController _emailController;
  late final TextEditingController _sobreController;

  SessaoUsuario get _sessao => SessaoUsuario.atual;

  @override
  void initState() {
    super.initState();
    _dados = _dadosDaSessao();
    _nomeController = TextEditingController(text: _dados.nome);
    _cursoController = TextEditingController(text: _dados.curso);
    _periodoController = TextEditingController(text: _dados.periodo);
    _emailController = TextEditingController(text: _dados.email);
    _sobreController = TextEditingController(text: _dados.sobre);
  }

  _DadosPerfil _dadosDaSessao() {
    final sessao = _sessao.dados;
    if (sessao == null) return _fallback;
    return _DadosPerfil(
      nome: sessao.nome,
      curso: sessao.curso,
      periodo: '${sessao.periodo}º período',
      email: sessao.email,
      sobre: sessao.expectativaPadrinho?.trim().isNotEmpty == true
          ? sessao.expectativaPadrinho!.trim()
          : sessao.outrasInformacoes?.trim().isNotEmpty == true
          ? sessao.outrasInformacoes!.trim()
          : 'Ainda não há uma descrição no perfil.',
    );
  }

  @override
  void dispose() {
    _nomeController.dispose();
    _cursoController.dispose();
    _periodoController.dispose();
    _emailController.dispose();
    _sobreController.dispose();
    super.dispose();
  }

  void _iniciarEdicao() {
    _nomeController.text = _dados.nome;
    _cursoController.text = _dados.curso;
    _periodoController.text = _dados.periodo;
    _emailController.text = _dados.email;
    _sobreController.text = _dados.sobre;
    setState(() => _editando = true);
  }

  void _cancelarEdicao() => setState(() => _editando = false);

  void _confirmarEdicao() {
    final nome = _nomeController.text.trim();
    final curso = _cursoController.text.trim();
    final periodo = _periodoController.text.trim();
    final email = _emailController.text.trim();
    final sobre = _sobreController.text.trim();

    if (nome.isEmpty || curso.isEmpty || periodo.isEmpty || email.isEmpty) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(
            content: Text('Preencha nome, curso, período e e-mail.'),
          ),
        );
      return;
    }

    setState(() {
      _dados = _dados.copyWith(
        nome: nome,
        curso: curso,
        periodo: periodo,
        email: email,
        sobre: sobre,
      );
      _editando = false;
    });

    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        const SnackBar(content: Text('Perfil atualizado com sucesso.')),
      );
  }

  String _formatarData(DateTime data) {
    final dia = data.day.toString().padLeft(2, '0');
    final mes = data.month.toString().padLeft(2, '0');
    final ano = data.year.toString();
    return '$dia/$mes/$ano';
  }

  @override
  Widget build(BuildContext context) {
    final status = _sessao.status;

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        bottom: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
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
                ],
              ),
              const SizedBox(height: 16),
              Text(
                _editando ? 'Editar perfil' : 'Meu perfil',
                style: const TextStyle(
                  color: AppColors.ink,
                  fontSize: 24,
                  height: 1.1,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                _editando
                    ? 'Altere seus dados e confirme para salvar.'
                    : 'Suas informações e participação no programa.',
                style: const TextStyle(
                  fontFamily: 'Inter',
                  color: AppColors.muted,
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: 20),
              _Identidade(
                dados: _dados,
                editando: _editando,
                nomeController: _nomeController,
                onEditar: _editando ? null : _iniciarEdicao,
              ),
              if (_editando) ...[
                const SizedBox(height: 20),
                const _Titulo('Sobre mim'),
                const SizedBox(height: 8),
                _CampoTexto(
                  controller: _sobreController,
                  dica: 'Conte um pouco sobre você',
                  maxLines: 4,
                ),
                const SizedBox(height: 16),
                const _Titulo('Informações acadêmicas'),
                const SizedBox(height: 8),
                _CampoTexto(controller: _cursoController, dica: 'Curso'),
                const SizedBox(height: 8),
                _CampoTexto(controller: _periodoController, dica: 'Período'),
                const SizedBox(height: 8),
                _CampoTexto(
                  controller: _emailController,
                  dica: 'E-mail institucional',
                ),
                const SizedBox(height: 20),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _cancelarEdicao,
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.ink,
                          minimumSize: const Size.fromHeight(48),
                          side: const BorderSide(color: _borda),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: const Text('Cancelar'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: FilledButton(
                        onPressed: _confirmarEdicao,
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          foregroundColor: Colors.white,
                          minimumSize: const Size.fromHeight(48),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: const Text('Confirmar'),
                      ),
                    ),
                  ],
                ),
              ] else ...[
                const SizedBox(height: 24),
                const _Titulo('Participação no programa'),
                const SizedBox(height: 10),
                _CardParticipacao(
                  status: status,
                  enviadaEm: _sessao.candidaturaEnviadaEm,
                  formatarData: _formatarData,
                  onVerCandidatura: () => setState(
                    () => _detalhesCandidaturaAbertos =
                        !_detalhesCandidaturaAbertos,
                  ),
                  detalhesAbertos: _detalhesCandidaturaAbertos,
                  onCandidatarPadrinho: () => _candidatarPadrinho(context),
                  onCandidatarApadrinhado: () =>
                      _candidatarApadrinhado(context),
                ),
                if (_sessao.ehPadrinhoEmAnalise &&
                    _detalhesCandidaturaAbertos) ...[
                  const SizedBox(height: 12),
                  _DetalhesCandidatura(dados: _sessao.dados),
                ],
                const SizedBox(height: 24),
                Row(
                  children: [
                    const Expanded(child: _Titulo('Sobre mim')),
                    TextButton(
                      onPressed: _iniciarEdicao,
                      style: TextButton.styleFrom(
                        foregroundColor: AppColors.primary,
                        padding: EdgeInsets.zero,
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        textStyle: const TextStyle(
                          fontFamily: 'Inter',
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      child: const Text('Editar'),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  _dados.sobre,
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.ink,
                    fontSize: 14,
                    height: 1.45,
                  ),
                ),
                const SizedBox(height: 24),
                const _Titulo('Informações acadêmicas'),
                const SizedBox(height: 8),
                _InfoAcademica(
                  linhas: [
                    ('Curso', _dados.curso),
                    ('Período', _dados.periodo),
                    ('E-mail institucional', _dados.email),
                  ],
                ),
                const SizedBox(height: 20),
                const _Titulo('Programa'),
                const SizedBox(height: 8),
                _LinkHistorico(
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const HistoricoParticipacaoPage(),
                    ),
                  ),
                ),
                const SizedBox(height: 28),
                SizedBox(
                  width: double.infinity,
                  child: TextButton(
                    onPressed: () => _sair(context),
                    style: TextButton.styleFrom(
                      foregroundColor: const Color(0xFFB91C1C),
                      minimumSize: const Size.fromHeight(44),
                      textStyle: const TextStyle(
                        fontFamily: 'Inter',
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    child: const Text('Sair da conta'),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
      bottomNavigationBar: AppBottomNavigation(
        selected: AppDestination.perfil,
        destinations: _sessao.destinos,
        onSelected: (destination) =>
            navegarDestino(context, destination, atual: AppDestination.perfil),
      ),
    );
  }

  void _candidatarPadrinho(BuildContext context) {
    final dados = _sessao.dados;
    if (dados == null) return;
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => CadastroPadrinhoPage(dados: dados)),
    );
  }

  void _candidatarApadrinhado(BuildContext context) {
    final dados = _sessao.dados;
    if (dados == null) return;
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => PerfilCadastroPage(dados: dados)),
    );
  }

  void _sair(BuildContext context) {
    _sessao.limpar();
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginPage()),
      (route) => false,
    );
  }
}

class _Titulo extends StatelessWidget {
  const _Titulo(this.texto);
  final String texto;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          texto,
          style: const TextStyle(
            color: AppColors.ink,
            fontSize: 16,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 6),
        Container(
          width: 28,
          height: 3,
          decoration: BoxDecoration(
            color: AppColors.primary.withValues(alpha: 0.7),
            borderRadius: BorderRadius.circular(2),
          ),
        ),
      ],
    );
  }
}

class _LinkHistorico extends StatelessWidget {
  const _LinkHistorico({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: _fundoLilasCard,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: _bordaLilas),
          ),
          child: const Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Histórico de participação',
                      style: TextStyle(
                        fontFamily: 'Inter',
                        color: AppColors.ink,
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'Veja suas participações anteriores no Ajuda Aí.',
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
              Icon(Icons.chevron_right, color: AppColors.muted),
            ],
          ),
        ),
      ),
    );
  }
}

class _Identidade extends StatelessWidget {
  const _Identidade({
    required this.dados,
    required this.editando,
    required this.nomeController,
    required this.onEditar,
  });

  final _DadosPerfil dados;
  final bool editando;
  final TextEditingController nomeController;
  final VoidCallback? onEditar;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 72,
          height: 72,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: const Color(0xFFEDE6FA),
            border: Border.all(color: AppColors.primary.withValues(alpha: 0.35), width: 1.5),
          ),
          child: Text(
            dados.iniciais,
            style: const TextStyle(
              color: AppColors.primary,
              fontSize: 22,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: editando
              ? _CampoTexto(
                  controller: nomeController,
                  dica: 'Nome',
                  textStyle: const TextStyle(
                    color: AppColors.ink,
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                  ),
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      dados.nome,
                      style: const TextStyle(
                        color: AppColors.ink,
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      dados.curso,
                      style: const TextStyle(
                        fontFamily: 'Inter',
                        color: AppColors.muted,
                        fontSize: 13,
                      ),
                    ),
                    Text(
                      dados.periodo,
                      style: const TextStyle(
                        fontFamily: 'Inter',
                        color: AppColors.muted,
                        fontSize: 13,
                      ),
                    ),
                    if (onEditar != null) ...[
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: onEditar,
                        style: TextButton.styleFrom(
                          foregroundColor: AppColors.primary,
                          padding: EdgeInsets.zero,
                          minimumSize: Size.zero,
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          textStyle: const TextStyle(
                            fontFamily: 'Inter',
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        child: const Text('Editar perfil'),
                      ),
                    ],
                  ],
                ),
        ),
      ],
    );
  }
}

class _CardParticipacao extends StatelessWidget {
  const _CardParticipacao({
    required this.status,
    required this.enviadaEm,
    required this.formatarData,
    required this.onVerCandidatura,
    required this.detalhesAbertos,
    required this.onCandidatarPadrinho,
    required this.onCandidatarApadrinhado,
  });

  final StatusParticipacao status;
  final DateTime? enviadaEm;
  final String Function(DateTime) formatarData;
  final VoidCallback onVerCandidatura;
  final bool detalhesAbertos;
  final VoidCallback onCandidatarPadrinho;
  final VoidCallback onCandidatarApadrinhado;

  @override
  Widget build(BuildContext context) {
    return switch (status) {
      StatusParticipacao.padrinhoEmAnalise => _StatusCard(
        titulo: 'Candidatura de padrinho',
        selo: 'Em análise',
        descricao:
            'Sua candidatura foi enviada e está sendo analisada pela '
            'coordenação.',
        corSelo: AppColors.primary,
        fundoSelo: AppColors.lavender,
        meta: enviadaEm == null
            ? null
            : 'Enviada em: ${formatarData(enviadaEm!)}',
        acao: TextButton(
          onPressed: onVerCandidatura,
          style: TextButton.styleFrom(
            foregroundColor: AppColors.primary,
            padding: EdgeInsets.zero,
            minimumSize: Size.zero,
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
          child: Text(
            detalhesAbertos
                ? 'Ocultar candidatura'
                : 'Ver candidatura',
            style: const TextStyle(
              fontFamily: 'Inter',
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
      StatusParticipacao.padrinhoAtivo => const _StatusCard(
        titulo: 'Padrinho ativo',
        selo: 'Ativo',
        descricao: 'Você participa atualmente do programa de apadrinhamento.',
        corSelo: AppAccents.success,
        fundoSelo: AppAccents.successBg,
        meta: 'Acompanhe seus apadrinhados e encontros pelo aplicativo.',
      ),
      StatusParticipacao.padrinhoRejeitado => _StatusCard(
        titulo: 'Candidatura não aprovada',
        selo: 'Não aprovada',
        descricao:
            'Sua candidatura não foi aprovada neste ciclo. Você poderá '
            'tentar novamente em uma próxima abertura.',
        corSelo: const Color(0xFFB45309),
        fundoSelo: const Color(0xFFFFF7ED),
        acao: TextButton(
          onPressed: onCandidatarPadrinho,
          style: TextButton.styleFrom(
            foregroundColor: AppColors.primary,
            padding: EdgeInsets.zero,
            minimumSize: Size.zero,
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
          child: const Text(
            'Ver opções',
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
      StatusParticipacao.apadrinhadoAtivo => const _StatusCard(
        titulo: 'Apadrinhado ativo',
        selo: 'Ativo',
        descricao:
            'Você já está vinculado ao programa e pode conversar com '
            'seu padrinho.',
        corSelo: AppAccents.success,
        fundoSelo: AppAccents.successBg,
      ),
      StatusParticipacao.apadrinhadoAguardandoMatch => _StatusCard(
        titulo: 'Cadastro enviado',
        selo: 'Aguardando match',
        descricao:
            'Suas informações foram enviadas. A coordenação está '
            'buscando um padrinho compatível.',
        corSelo: AppColors.primary,
        fundoSelo: AppColors.lavender,
        meta: enviadaEm == null
            ? null
            : 'Enviado em: ${formatarData(enviadaEm!)}',
      ),
      StatusParticipacao.explorar || StatusParticipacao.nenhuma =>
        _OpcoesExplorar(
          podePadrinho: SessaoUsuario.atual.podeCandidatarPadrinho,
          podeApadrinhado: SessaoUsuario.atual.podeCandidatarApadrinhado,
          onPadrinho: onCandidatarPadrinho,
          onApadrinhado: onCandidatarApadrinhado,
        ),
    };
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({
    required this.titulo,
    required this.selo,
    required this.descricao,
    required this.corSelo,
    required this.fundoSelo,
    this.meta,
    this.acao,
  });

  final String titulo;
  final String selo;
  final String descricao;
  final Color corSelo;
  final Color fundoSelo;
  final String? meta;
  final Widget? acao;

  @override
  Widget build(BuildContext context) {
    final fundo = corSelo == AppAccents.success
        ? AppAccents.successBg.withValues(alpha: 0.55)
        : _fundoLilasCard;
    final borda = corSelo == AppAccents.success
        ? AppAccents.success.withValues(alpha: 0.25)
        : _bordaLilas;
    final faixa = corSelo == AppAccents.success
        ? AppAccents.success
        : AppColors.primary;

    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: double.infinity,
        decoration: BoxDecoration(
          color: fundo,
          border: Border.all(color: borda),
          borderRadius: BorderRadius.circular(12),
        ),
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(width: 4, color: faixa),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              titulo,
                              style: const TextStyle(
                                color: AppColors.ink,
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: fundoSelo,
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text(
                              selo,
                              style: TextStyle(
                                fontFamily: 'Inter',
                                color: corSelo,
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        descricao,
                        style: const TextStyle(
                          fontFamily: 'Inter',
                          color: AppColors.muted,
                          fontSize: 13,
                          height: 1.4,
                        ),
                      ),
                      if (meta != null) ...[
                        const SizedBox(height: 10),
                        Text(
                          meta!,
                          style: const TextStyle(
                            fontFamily: 'Inter',
                            color: AppColors.ink,
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                      if (acao != null) ...[const SizedBox(height: 8), acao!],
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OpcoesExplorar extends StatelessWidget {
  const _OpcoesExplorar({
    required this.podePadrinho,
    required this.podeApadrinhado,
    required this.onPadrinho,
    required this.onApadrinhado,
  });

  final bool podePadrinho;
  final bool podeApadrinhado;
  final VoidCallback onPadrinho;
  final VoidCallback onApadrinhado;

  @override
  Widget build(BuildContext context) {
    if (!podePadrinho && !podeApadrinhado) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: _borda),
        ),
        child: const Text(
          'No momento não há inscrição aberta para o seu perfil acadêmico.',
          style: TextStyle(
            fontFamily: 'Inter',
            color: AppColors.muted,
            fontSize: 13,
            height: 1.4,
          ),
        ),
      );
    }

    return Column(
      children: [
        if (podeApadrinhado)
          _OpcaoSimples(
            titulo: 'Quero ser apadrinhado',
            descricao:
                'As inscrições estão abertas. Receba orientação de um '
                'aluno mais experiente.',
            onTap: onApadrinhado,
          ),
        if (podeApadrinhado && podePadrinho) const SizedBox(height: 8),
        if (podePadrinho)
          _OpcaoSimples(
            titulo: 'Quero ser padrinho',
            descricao:
                'Você já passou do 1º período e pode apoiar novos alunos.',
            onTap: onPadrinho,
          ),
      ],
    );
  }
}

class _OpcaoSimples extends StatelessWidget {
  const _OpcaoSimples({
    required this.titulo,
    required this.descricao,
    required this.onTap,
  });

  final String titulo;
  final String descricao;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: _borda),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      titulo,
                      style: const TextStyle(
                        fontFamily: 'Inter',
                        color: AppColors.ink,
                        fontSize: 14,
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
              const Icon(Icons.chevron_right, color: AppColors.muted),
            ],
          ),
        ),
      ),
    );
  }
}

class _DetalhesCandidatura extends StatelessWidget {
  const _DetalhesCandidatura({required this.dados});

  final DadosCadastro? dados;

  @override
  Widget build(BuildContext context) {
    final cadastro = dados;
    if (cadastro == null) {
      return const SizedBox.shrink();
    }

    final linhas = <(String, String)>[
      if (cadastro.areasApoio.isNotEmpty)
        ('Áreas de interesse', cadastro.areasApoio.join(', ')),
      if (cadastro.disponibilidade?.isNotEmpty == true)
        ('Disponibilidade', cadastro.disponibilidade!),
      if (cadastro.genero?.isNotEmpty == true) ('Gênero', cadastro.genero!),
      if (cadastro.bolsistaProuni != null)
        ('Bolsista ProUni', cadastro.bolsistaProuni! ? 'Sim' : 'Não'),
      if (cadastro.deOutraCidade != null)
        ('Outra cidade', cadastro.deOutraCidade! ? 'Sim' : 'Não'),
      if (cadastro.expectativaPadrinho?.isNotEmpty == true)
        ('Motivação', cadastro.expectativaPadrinho!),
    ];

    if (linhas.isEmpty) return const SizedBox.shrink();

    return _InfoAcademica(linhas: linhas, tituloInterno: 'Minha candidatura');
  }
}

class _InfoAcademica extends StatelessWidget {
  const _InfoAcademica({required this.linhas, this.tituloInterno});

  final List<(String, String)> linhas;
  final String? tituloInterno;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      decoration: BoxDecoration(
        color: _fundoLilasCard.withValues(alpha: 0.55),
        border: Border.all(color: _bordaLilas),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (tituloInterno != null) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(0, 10, 0, 4),
              child: Text(
                tituloInterno!,
                style: const TextStyle(
                  fontFamily: 'Inter',
                  color: AppColors.ink,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
          for (var index = 0; index < linhas.length; index++) ...[
            if (index > 0 || tituloInterno != null)
              const Divider(height: 1, color: _borda),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final estreito = constraints.maxWidth < 320;
                  if (estreito) {
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          linhas[index].$1,
                          style: const TextStyle(
                            fontFamily: 'Inter',
                            color: AppColors.muted,
                            fontSize: 13,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          linhas[index].$2,
                          style: const TextStyle(
                            fontFamily: 'Inter',
                            color: AppColors.ink,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            height: 1.35,
                          ),
                        ),
                      ],
                    );
                  }
                  return Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        flex: 4,
                        child: Text(
                          linhas[index].$1,
                          style: const TextStyle(
                            fontFamily: 'Inter',
                            color: AppColors.muted,
                            fontSize: 13,
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
                            fontWeight: FontWeight.w600,
                            height: 1.35,
                          ),
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _CampoTexto extends StatelessWidget {
  const _CampoTexto({
    required this.controller,
    required this.dica,
    this.maxLines = 1,
    this.textStyle,
  });

  final TextEditingController controller;
  final String dica;
  final int maxLines;
  final TextStyle? textStyle;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      maxLines: maxLines,
      style: textStyle ??
          const TextStyle(
            fontFamily: 'Inter',
            color: AppColors.ink,
            fontSize: 14,
          ),
      decoration: InputDecoration(
        hintText: dica,
        hintStyle: const TextStyle(
          fontFamily: 'Inter',
          color: AppColors.muted,
          fontSize: 13,
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 12,
          vertical: 12,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _borda),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _borda),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.primary, width: 1.4),
        ),
      ),
    );
  }
}
