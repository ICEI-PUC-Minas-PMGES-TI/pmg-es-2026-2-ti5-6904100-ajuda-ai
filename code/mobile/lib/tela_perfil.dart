import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import 'configuracoes/tela_config_suporte.dart';
import 'configuracoes/tela_configuracoes.dart';
import 'dados_cadastro.dart';
import 'sessao_usuario.dart';
import 'status_participacao.dart';
import 'tela_cadastro_padrinho.dart';
import 'tela_cadastro_perfil.dart';
import 'tela_feed.dart';
import 'tela_historico.dart';
import 'tela_login.dart';
import 'tela_padrinho_definido.dart';
import 'tela_resgatar.dart' show formatarXp;
import 'tela_status_candidatura.dart';
import 'theme/colors.dart';
import 'widgets/app_bottom_navigation.dart';
import 'widgets/aviso_mapa.dart';
import 'widgets/navegacao_app.dart';
import 'widgets/perfil_componentes.dart';

const _borda = corBordaPerfil;
const _bordaLilas = corBordaLilasPerfil;
const _fundoLilasCard = corFundoLilasPerfil;

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
  static const _semSobre = 'Nada informado.';

  static const _fallback = _DadosPerfil(
    nome: 'Perfil não carregado',
    curso: '',
    periodo: '1º período',
    email: '',
    sobre: _semSobre,
  );

  late _DadosPerfil _dados;
  bool _editando = false;
  bool _salvando = false;
  String? _erro;
  String? _erroFoto;
  bool _detalhesCandidaturaAbertos = false;

  late final TextEditingController _nomeController;
  late final TextEditingController _cursoController;
  late final TextEditingController _periodoController;
  late final TextEditingController _emailController;
  late final TextEditingController _sobreController;
  late final TextEditingController _turnoController;
  late final TextEditingController _interessesController;

  SessaoUsuario get _sessao => SessaoUsuario.atual;

  @override
  void initState() {
    super.initState();
    _dados = _dadosDaSessao();
    _nomeController = TextEditingController(text: _dados.nome);
    _cursoController = TextEditingController(text: _dados.curso);
    _periodoController = TextEditingController(text: _dados.periodo);
    _emailController = TextEditingController(text: _dados.email);
    _sobreController = TextEditingController(
      text: _dados.sobre == _semSobre ? '' : _dados.sobre,
    );
    _turnoController = TextEditingController();
    _interessesController = TextEditingController();
    _sincronizar();
  }

  Future<void> _sincronizar() async {
    try {
      await _sessao.carregarContexto();
      if (mounted) {
        setState(() {
          _dados = _dadosDaSessao();
          _erro = null;
        });
      }
    } catch (erro) {
      if (mounted) setState(() => _erro = '$erro');
    }
    try {
      final email = _sessao.identidade?.email;
      final foto = await _sessao.participacoesApi.foto();
      if (mounted && email == _sessao.identidade?.email) {
        setState(() {
          _sessao.fotoUrl = foto;
          _erroFoto = null;
        });
      }
    } catch (erro) {
      if (mounted) {
        setState(() => _erroFoto = 'Não foi possível carregar a foto. $erro');
      }
    }
  }

  Future<void> _escolherFoto() async {
    if (_salvando) return;
    try {
      final resultado = await FilePicker.pickFiles(
        type: FileType.image,
        withData: true,
      );
      final bytes = resultado?.files.single.bytes;
      if (bytes == null || !mounted) return;
      setState(() => _salvando = true);
      final url = await _sessao.participacoesApi.enviarFoto(bytes);
      if (mounted) {
        setState(() {
          _sessao.fotoUrl = url;
          _erroFoto = null;
        });
      }
    } catch (erro) {
      if (mounted) setState(() => _erroFoto = 'Foto não salva: $erro');
    } finally {
      if (mounted) setState(() => _salvando = false);
    }
  }

  void _abrir(Widget pagina) {
    Navigator.of(context)
        .push(MaterialPageRoute(builder: (_) => pagina))
        .then((_) {
          if (mounted) setState(() {});
        });
  }

  _DadosPerfil _dadosDaSessao() {
    final sessao = _sessao.dados;
    if (sessao == null) return _fallback;
    final sobre = sessao.sobre?.trim();
    return _DadosPerfil(
      nome: sessao.nome,
      curso: sessao.curso,
      periodo: '${sessao.periodo}º período',
      email: sessao.email,
      sobre: sobre == null || sobre.isEmpty ? _semSobre : sobre,
    );
  }

  @override
  void dispose() {
    _nomeController.dispose();
    _cursoController.dispose();
    _periodoController.dispose();
    _emailController.dispose();
    _sobreController.dispose();
    _turnoController.dispose();
    _interessesController.dispose();
    super.dispose();
  }

  void _iniciarEdicao() {
    _nomeController.text = _dados.nome;
    _cursoController.text = _dados.curso;
    _periodoController.text = _dados.periodo;
    _emailController.text = _dados.email;
    _sobreController.text = _dados.sobre == _semSobre ? '' : _dados.sobre;
    _turnoController.text = _sessao.dados?.turno ?? '';
    _interessesController.text = _sessao.dados?.interesses.join(', ') ?? '';
    setState(() => _editando = true);
  }

  void _cancelarEdicao() => setState(() => _editando = false);

  Future<void> _confirmarEdicao() async {
    if (_salvando || _sessao.dados == null) return;
    setState(() => _salvando = true);
    try {
      await _sessao.salvarPerfil(
        _sessao.dados!.copyWith(
          nome: _nomeController.text.trim(),
          curso: _cursoController.text.trim(),
          periodo:
              int.tryParse(
                _periodoController.text.replaceAll(RegExp(r'[^0-9]'), ''),
              ) ??
              0,
          turno: _turnoController.text.trim(),
          interesses: _interessesController.text
              .split(',')
              .map((v) => v.trim())
              .where((v) => v.isNotEmpty)
              .toList(),
          sobre: _sobreController.text.trim().isEmpty
              ? null
              : _sobreController.text.trim(),
          limparSobre: _sobreController.text.trim().isEmpty,
        ),
      );
      if (mounted) {
        setState(() {
          _dados = _dadosDaSessao();
          _editando = false;
          _erro = null;
        });
      }
    } catch (erro) {
      if (mounted) setState(() => _erro = '$erro');
    } finally {
      if (mounted) setState(() => _salvando = false);
    }
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
    final participa = status.participa;

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
                  const Spacer(),
                  IconButton(
                    onPressed: () => _abrir(const ConfiguracoesPage()),
                    tooltip: 'Configurações',
                    icon: const Icon(
                      Icons.settings_outlined,
                      color: AppColors.primary,
                      size: 26,
                    ),
                  ),
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
                    : 'Seu progresso, participação e principais informações.',
                style: const TextStyle(
                  fontFamily: 'Inter',
                  color: AppColors.muted,
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: 20),
              if (_erro != null)
                Text(_erro!, style: const TextStyle(color: Colors.red)),
              if (_erro != null)
                TextButton(
                  onPressed: _sincronizar,
                  child: const Text('Tentar novamente'),
                ),
              if (_sessao.programas.isNotEmpty)
                DropdownButton<String>(
                  value:
                      _sessao.programas.any(
                        (p) => p['codigo'] == _sessao.programaAtual,
                      )
                      ? _sessao.programaAtual
                      : null,
                  hint: const Text('Selecione o ciclo'),
                  items: _sessao.programas
                      .map(
                        (p) => DropdownMenuItem(
                          value: p['codigo'] as String,
                          child: Text('${p['titulo']}'),
                        ),
                      )
                      .toList(),
                  onChanged: (codigo) async {
                    if (codigo == null) return;
                    try {
                      await _sessao.selecionarPrograma(codigo);
                      if (mounted) setState(() => _erro = null);
                    } catch (erro) {
                      if (mounted) setState(() => _erro = '$erro');
                    }
                  },
                ),
              if (_sessao.fotoUrl != null)
                Image.network(
                  _sessao.fotoUrl!,
                  width: 72,
                  height: 72,
                  errorBuilder: (_, erro, stack) =>
                      const Text('Foto indisponível'),
                ),
              if (_erroFoto != null) Text(_erroFoto!),
              TextButton(
                onPressed: _salvando ? null : _escolherFoto,
                child: const Text('Selecionar ou substituir foto'),
              ),
              const Padding(
                padding: EdgeInsets.only(top: 4),
                child: Text(
                  'PNG, JPG ou WEBP · até 2 MB',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 12,
                    color: AppColors.muted,
                  ),
                ),
              ),
              _Identidade(
                dados: _dados,
                editando: _editando,
                nomeController: _nomeController,
                onEditar: _editando ? null : _iniciarEdicao,
                interesses: _sessao.dados?.interesses ?? const [],
              ),
              if (_editando) ...[
                const SizedBox(height: 20),
                const _Titulo('Informações acadêmicas'),
                const SizedBox(height: 8),
                _CampoTexto(controller: _cursoController, dica: 'Curso'),
                const SizedBox(height: 8),
                _CampoTexto(controller: _periodoController, dica: 'Período'),
                const SizedBox(height: 8),
                Text('E-mail institucional: ${_dados.email}'),
                const SizedBox(height: 8),
                _CampoTexto(controller: _turnoController, dica: 'Turno'),
                const SizedBox(height: 8),
                _CampoTexto(
                  controller: _interessesController,
                  dica: 'Interesses separados por vírgula',
                  maxLines: 2,
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
                        onPressed: _salvando ? null : _confirmarEdicao,
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
                CardSituacaoPerfil(
                  sessao: _sessao,
                  formatarData: _formatarData,
                  detalhesAbertos: _detalhesCandidaturaAbertos,
                  onVerCandidatura: () => setState(
                    () => _detalhesCandidaturaAbertos =
                        !_detalhesCandidaturaAbertos,
                  ),
                  onAcompanharStatus: () =>
                      _abrir(const StatusCandidaturaPage()),
                  onAbrirPadrinho: () => _abrir(const PadrinhoDefinidoPage()),
                  onCandidatarPadrinho: () => _candidatarPadrinho(context),
                  onCandidatarApadrinhado: () =>
                      _candidatarApadrinhado(context),
                ),
                if (_sessao.ehPadrinhoEmAnalise &&
                    _detalhesCandidaturaAbertos) ...[
                  const SizedBox(height: 12),
                  _DetalhesCandidatura(dados: _sessao.dados),
                ],
                if (participa) ...[
                  const SizedBox(height: 22),
                  SecaoJornada(
                    sessao: _sessao,
                    formatarData: _formatarData,
                    onVerHistorico: () =>
                        _abrir(const HistoricoParticipacaoPage()),
                  ),
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
                const SizedBox(height: 24),
                const _Titulo('Acessos rápidos'),
                const SizedBox(height: 10),
                AcessosRapidos(itens: _acessosRapidos(status)),
                if (status == StatusParticipacao.apadrinhadoAguardandoMatch ||
                    status == StatusParticipacao.apadrinhadoPendente ||
                    status == StatusParticipacao.padrinhoEmAnalise ||
                    status == StatusParticipacao.explorar) ...[
                  const SizedBox(height: 14),
                  CardEnquantoIsso(onTap: () => mostrarAvisoMapa(context)),
                ],
                const SizedBox(height: 28),
                SizedBox(
                  width: double.infinity,
                  child: TextButton.icon(
                    onPressed: () => _sair(context),
                    icon: const Icon(Icons.logout, size: 18),
                    label: const Text('Sair da conta'),
                    style: TextButton.styleFrom(
                      foregroundColor: const Color(0xFFB91C1C),
                      minimumSize: const Size.fromHeight(44),
                      textStyle: const TextStyle(
                        fontFamily: 'Inter',
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
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

  List<ItemAcessoRapido> _acessosRapidos(StatusParticipacao status) => [
    if (status == StatusParticipacao.apadrinhadoAtivo)
      ItemAcessoRapido(
        Icons.person_search_outlined,
        'Meu padrinho',
        () => _abrir(const PadrinhoDefinidoPage()),
      ),
    if (status.candidatura)
      ItemAcessoRapido(
        Icons.fact_check_outlined,
        'Status da candidatura',
        () => _abrir(const StatusCandidaturaPage()),
      ),
    ItemAcessoRapido(
      Icons.chat_bubble_outline,
      'Feed do campus',
      () => _abrir(const FeedPage()),
    ),
    ItemAcessoRapido(
      Icons.map_outlined,
      'Explorar mapa',
      () => mostrarAvisoMapa(context),
    ),
    ItemAcessoRapido(
      Icons.bar_chart_rounded,
      'Histórico de participação',
      () => _abrir(const HistoricoParticipacaoPage()),
    ),
    ItemAcessoRapido(
      Icons.settings_outlined,
      'Configurações da conta',
      () => _abrir(const ConfiguracoesPage()),
    ),
    ItemAcessoRapido(
      Icons.help_outline,
      'Ajuda e suporte',
      () => _abrir(const SuporteConfigPage()),
    ),
  ];

  void _candidatarPadrinho(BuildContext context) {
    final dados = _sessao.dados;
    if (dados == null || !_sessao.podeCandidatarPadrinho) return;
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => CadastroPadrinhoPage(dados: dados)),
    );
  }

  void _candidatarApadrinhado(BuildContext context) {
    final dados = _sessao.dados;
    if (dados == null) return;
    Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => PerfilCadastroPage(dados: dados)));
  }

  void _sair(BuildContext context) => encerrarSessao(context);
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

class _Identidade extends StatelessWidget {
  const _Identidade({
    required this.dados,
    required this.editando,
    required this.nomeController,
    required this.onEditar,
    this.interesses = const [],
  });

  final _DadosPerfil dados;
  final bool editando;
  final TextEditingController nomeController;
  final VoidCallback? onEditar;
  final List<String> interesses;

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
            border: Border.all(
              color: AppColors.primary.withValues(alpha: 0.35),
              width: 1.5,
            ),
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
                    const _XpGlobal(),
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
                    if (interesses.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      ChipsInteresses(interesses: interesses),
                    ],
                  ],
                ),
        ),
      ],
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
      style:
          textStyle ??
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

/// XP global do aluno (`GET /me/xp`), igual para qualquer ciclo. Some sem
/// sessão ou sem resposta (ex.: coordenação, que não acumula XP).
class _XpGlobal extends StatefulWidget {
  const _XpGlobal();

  @override
  State<_XpGlobal> createState() => _XpGlobalState();
}

class _XpGlobalState extends State<_XpGlobal> {
  @override
  void initState() {
    super.initState();
    SessaoUsuario.atual.atualizarXp();
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<int?>(
      valueListenable: SessaoUsuario.atual.xp,
      builder: (context, saldo, _) {
        if (saldo == null) return const SizedBox.shrink();
        return Padding(
          key: const Key('perfil-xp'),
          padding: const EdgeInsets.only(top: 6),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.star_rounded,
                size: 18,
                color: Color(0xFFF59E0B),
              ),
              const SizedBox(width: 4),
              Text(
                '${formatarXp(saldo)} XP',
                style: const TextStyle(
                  fontFamily: 'Inter',
                  color: AppColors.ink,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
