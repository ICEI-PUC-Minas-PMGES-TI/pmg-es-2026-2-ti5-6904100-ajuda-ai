import 'package:flutter/material.dart';

import '../models/preferencia_genero.dart';

import '../services/coordenacao_api.dart';
import '../theme/colors.dart';
import 'componentes_coord.dart';

const _rotuloStatus = {
  'pendente': 'Aguardando análise',
  'aprovado': 'Aprovado',
  'rejeitado': 'Rejeitado',
};

const _rotuloTipo = {'padrinho': 'Padrinho', 'apadrinhado': 'Apadrinhado'};

const _filtros = <(String?, String)>[
  ('pendente', 'Pendentes'),
  ('aprovado', 'Aprovados'),
  ('rejeitado', 'Rejeitados'),
  (null, 'Todos'),
];

/// Solicitações de cadastro (padrinhos e apadrinhados) — mesmos endpoints do
/// web: `GET /coordenacao/cadastros`, `.../:id`, `.../aprovar`, `.../rejeitar`.
class TelaCadastrosCoord extends StatefulWidget {
  const TelaCadastrosCoord({
    super.key,
    required this.api,
    this.status,
    this.programa,
  });

  final CoordenacaoApi api;
  final String? status;
  final String? programa;

  @override
  State<TelaCadastrosCoord> createState() => _TelaCadastrosCoordState();
}

class _TelaCadastrosCoordState extends State<TelaCadastrosCoord> {
  late String? _status = widget.status ?? 'pendente';
  List<Map<String, dynamic>>? _itens;
  String? _erro;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  Future<void> _carregar() async {
    setState(() {
      _itens = null;
      _erro = null;
    });
    try {
      final lista = await widget.api.cadastros(
        status: _status,
        programa: widget.programa,
      );
      if (mounted) setState(() => _itens = lista);
    } catch (erro) {
      if (mounted) setState(() => _erro = mensagemDeErro(erro));
    }
  }

  Future<void> _abrir(Map<String, dynamic> item) async {
    final alterado = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => TelaDetalheCadastroCoord(
          api: widget.api,
          programa: widget.programa,
          id: (item['id'] as num).toInt(),
        ),
      ),
    );
    if (alterado == true) _carregar();
  }

  @override
  Widget build(BuildContext context) {
    final itens = _itens;
    return Scaffold(
      backgroundColor: corFundoCoord,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _carregar,
          child: ListView(
            padding: const EdgeInsets.only(bottom: 24),
            children: [
              const CabecalhoCoord(
                titulo: 'Cadastros',
                subtitulo:
                    'Solicitações de padrinhos e apadrinhados. Só cadastros '
                    'aprovados acessam os recursos do programa.',
                voltar: true,
              ),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  children: [
                    for (final (valor, rotulo) in _filtros)
                      Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: ChoiceChip(
                          label: Text(rotulo),
                          selected: _status == valor,
                          onSelected: (_) {
                            setState(() => _status = valor);
                            _carregar();
                          },
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              if (_erro != null)
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(
                    _erro!,
                    style: const TextStyle(color: corErroCoord),
                  ),
                ),
              if (itens == null && _erro == null)
                const Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(child: CircularProgressIndicator()),
                ),
              if (itens != null && itens.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(24),
                  child: Text('Nenhum cadastro encontrado para este filtro.'),
                ),
              for (final item in itens ?? const <Map<String, dynamic>>[])
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                  child: Material(
                    color: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                      side: const BorderSide(color: AppAccents.cardBorder),
                    ),
                    child: ListTile(
                      onTap: () => _abrir(item),
                      leading: AvatarCoord(item: item),
                      title: Text(
                        '${item['nome'] ?? ''}',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      subtitle: Text(
                        '${_rotuloTipo[item['tipoParticipacao']] ?? ''} · '
                        '${item['curso'] ?? ''} · ${item['periodo']}º período\n'
                        'Enviado em ${formatarDataCoord(item['criadoEm'])}',
                      ),
                      isThreeLine: true,
                      trailing: _SeloCadastro(
                        status: '${item['statusCadastro']}',
                      ),
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

class _SeloCadastro extends StatelessWidget {
  const _SeloCadastro({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final (cor, fundo) = switch (status) {
      'aprovado' => (AppAccents.success, AppAccents.successBg),
      'rejeitado' => (corErroCoord, const Color(0xFFFFF1F2)),
      _ => (AppColors.primary, AppColors.lavender),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: fundo,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        _rotuloStatus[status] ?? status,
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: cor),
      ),
    );
  }
}

/// Detalhe de um cadastro: dados enviados, requisitos (padrinho) e decisão.
/// Fecha com `true` se aprovou/rejeitou.
class TelaDetalheCadastroCoord extends StatefulWidget {
  const TelaDetalheCadastroCoord({
    super.key,
    required this.api,
    required this.id,
    this.programa,
  });

  final CoordenacaoApi api;
  final int id;
  final String? programa;

  @override
  State<TelaDetalheCadastroCoord> createState() =>
      _TelaDetalheCadastroCoordState();
}

class _TelaDetalheCadastroCoordState extends State<TelaDetalheCadastroCoord> {
  Map<String, dynamic>? _detalhe;
  String? _erro;
  bool _processando = false;
  bool _alterado = false;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  Future<void> _carregar() async {
    try {
      final dados = await widget.api.cadastro(
        widget.id,
        programa: widget.programa,
      );
      if (mounted) setState(() => _detalhe = dados);
    } catch (erro) {
      if (mounted) setState(() => _erro = mensagemDeErro(erro));
    }
  }

  Future<void> _decidir(Future<Map<String, dynamic>> Function() acao) async {
    setState(() {
      _processando = true;
      _erro = null;
    });
    try {
      final dados = await acao();
      if (!mounted) return;
      setState(() {
        _detalhe = dados;
        _alterado = true;
      });
    } catch (erro) {
      if (mounted) setState(() => _erro = mensagemDeErro(erro));
    } finally {
      if (mounted) setState(() => _processando = false);
    }
  }

  Future<void> _rejeitar() async {
    final justificativa = await solicitarJustificativaCoord(context);
    if (justificativa == null || !mounted) return;
    await _decidir(
      () => widget.api.rejeitarCadastro(
        widget.id,
        motivo: justificativa,
        programa: widget.programa,
      ),
    );
  }

  Widget _linha(String titulo, String? valor) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          titulo,
          style: const TextStyle(
            fontWeight: FontWeight.w700,
            color: AppColors.ink,
            fontSize: 13,
          ),
        ),
        Text(
          (valor == null || valor.isEmpty) ? 'Não informado' : valor,
          style: const TextStyle(color: corTextoSecundarioCoord),
        ),
      ],
    ),
  );

  static String _lista(Object? valor) => valor is List ? valor.join(', ') : '';

  static String _simNao(Object? valor) => switch (valor) {
    true => 'Sim',
    false => 'Não',
    _ => 'Não informado',
  };

  @override
  Widget build(BuildContext context) {
    final d = _detalhe;
    final r = d?['respostas'] is Map
        ? Map<String, dynamic>.from(d!['respostas'] as Map)
        : const <String, dynamic>{};
    final ehPadrinho = d?['tipoParticipacao'] == 'padrinho';
    final status = '${d?['statusCadastro'] ?? ''}';

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(_alterado);
      },
      child: Scaffold(
        backgroundColor: corFundoCoord,
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(0, 0, 0, 24),
            children: [
              CabecalhoCoord(
                titulo: '${d?['nome'] ?? 'Cadastro'}',
                subtitulo: d == null
                    ? null
                    : '${_rotuloTipo[d['tipoParticipacao']]} · '
                          '${d['curso']} · ${d['periodo']}º período',
                voltar: true,
                acao: d == null ? null : _SeloCadastro(status: status),
              ),
              if (d == null && _erro == null)
                const LinearProgressIndicator(color: AppColors.primary),
              if (_erro != null)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Text(
                    _erro!,
                    style: const TextStyle(color: corErroCoord),
                  ),
                ),
              if (d != null)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _linha('E-mail', '${d['email']}'),
                      _linha('Enviado em', formatarDataCoord(d['criadoEm'])),
                      if (ehPadrinho) ...[
                        const Text(
                          'Requisitos do ciclo e declaração do candidato',
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: AppColors.ink,
                          ),
                        ),
                        const SizedBox(height: 4),
                        RequisitosDeclaradosCoord(
                          requisitos: r['requisitos'] as List?,
                          respondidos: r['requisitos'] is List,
                          legado: r['declaraPreRequisitos'] == true,
                          periodo: (d['periodo'] as num?)?.toInt(),
                        ),
                        const SizedBox(height: 10),
                        _linha('Motivação', r['motivacao'] as String?),
                        _linha('Experiências', r['experiencias'] as String?),
                      ] else ...[
                        _linha(
                          'O que espera do padrinho',
                          r['expectativa'] as String?,
                        ),
                        _linha(
                          'Outras informações',
                          r['outrasInformacoes'] as String?,
                        ),
                      ],
                      _linha('Áreas', _lista(r['areas'])),
                      _linha('Disponibilidade', _lista(r['disponibilidade'])),
                      _linha('Gênero', r['genero'] as String?),
                      _linha(
                        'Preferência de gênero',
                        PreferenciaGenero.fromJson(r['preferenciaGenero'])
                                ?.descricao ??
                            'Não informado',
                      ),
                      _linha('Bolsista ProUni', _simNao(r['bolsistaProuni'])),
                      _linha('De outra cidade', _simNao(r['deOutraCidade'])),
                      _linha('Interesses', _lista(d['interesses'])),
                      if (status != 'pendente')
                        _linha(
                          'Decisão',
                          '${status == 'aprovado' ? 'Aprovado' : 'Rejeitado'}'
                              ' em ${formatarDataCoord(d['analisadoEm'])}'
                              '${d['analisadoPor'] == null ? '' : ' por ${d['analisadoPor']}'}',
                        ),
                      if (status == 'rejeitado' && d['motivoRejeicao'] != null)
                        _linha(
                          'Motivo informado ao aluno',
                          '${d['motivoRejeicao']}',
                        ),
                      if (status == 'pendente' || status == 'rejeitado') ...[
                        const SizedBox(height: 8),
                        if (status != 'aprovado')
                          FilledButton.icon(
                            onPressed: _processando
                                ? null
                                : () => _decidir(
                                    () => widget.api.aprovarCadastro(
                                      widget.id,
                                      programa: widget.programa,
                                    ),
                                  ),
                            icon: const Icon(Icons.check),
                            label: Text(
                              status == 'rejeitado'
                                  ? 'Rever e aprovar'
                                  : 'Aprovar',
                            ),
                          ),
                        if (status == 'pendente')
                          OutlinedButton.icon(
                            onPressed: _processando ? null : _rejeitar,
                            style: OutlinedButton.styleFrom(
                              foregroundColor: corErroCoord,
                            ),
                            icon: const Icon(Icons.close),
                            label: const Text('Rejeitar'),
                          ),
                        if (status == 'pendente') ...[
                          const SizedBox(height: 6),
                          Text(
                            ehPadrinho
                                ? 'Aprovar também aprova a candidatura a padrinho '
                                      'deste ciclo.'
                                : 'Após a aprovação, o apadrinhado entra na fila '
                                      'de matching.',
                            style: const TextStyle(
                              fontSize: 12,
                              color: corTextoSecundarioCoord,
                            ),
                          ),
                        ],
                      ],
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
