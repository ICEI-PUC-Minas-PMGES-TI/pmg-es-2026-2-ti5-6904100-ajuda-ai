import 'package:flutter/material.dart';

import '../services/coordenacao_api.dart';
import '../theme/colors.dart';
import 'componentes_coord.dart';

/// Pool de participantes para vínculos manuais, disponível após liberar matching.
class TelaMatchingCoord extends StatefulWidget {
  const TelaMatchingCoord({
    super.key,
    required this.api,
    required this.programa,
  });

  final CoordenacaoApi api;
  final String programa;

  @override
  State<TelaMatchingCoord> createState() => _TelaMatchingCoordState();
}

class _TelaMatchingCoordState extends State<TelaMatchingCoord> {
  Map<String, dynamic>? _programa;
  List<Map<String, dynamic>> _padrinhos = const [];
  List<Map<String, dynamic>> _apadrinhados = const [];
  bool _carregando = true;
  String? _erro;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _erro = null;
    });
    try {
      final programas = await widget.api.programas();
      final encontrados = programas.where(
        (item) => item['codigo'] == widget.programa,
      );
      if (encontrados.isEmpty) {
        throw Exception('Programa ${widget.programa} não encontrado.');
      }
      final programa = encontrados.first;
      if (programa['matchingLiberado'] != true) {
        if (!mounted) return;
        setState(() {
          _programa = programa;
          _padrinhos = const [];
          _apadrinhados = const [];
          _carregando = false;
        });
        return;
      }
      final pool = await widget.api.matching(programa: widget.programa);
      if (!mounted) return;
      setState(() {
        _programa = programa;
        _padrinhos = (pool['padrinhos'] as List? ?? const [])
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList();
        _apadrinhados = (pool['apadrinhados'] as List? ?? const [])
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList();
        _carregando = false;
      });
    } catch (erro) {
      if (!mounted) return;
      setState(() {
        _erro = mensagemDeErro(erro);
        _carregando = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final liberado = _programa?['matchingLiberado'] == true;
    return Scaffold(
      backgroundColor: corFundoCoord,
      appBar: AppBar(
        title: Text('Matching · ${widget.programa}'),
        backgroundColor: Colors.white,
        foregroundColor: AppColors.ink,
      ),
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: _carregar,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
          children: [
            if (_carregando)
              const Padding(
                padding: EdgeInsets.all(40),
                child: Center(
                  child: CircularProgressIndicator(color: AppColors.primary),
                ),
              )
            else if (_erro != null)
              Column(
                children: [
                  Text(_erro!, textAlign: TextAlign.center),
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: _carregar,
                    child: const Text('Tentar novamente'),
                  ),
                ],
              )
            else if (!liberado)
              _EstadoBloqueado(programa: widget.programa)
            else ...[
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Wrap(
                    spacing: 10,
                    runSpacing: 8,
                    children: [
                      _ContagemPool(
                        valor: _padrinhos.length,
                        rotulo: 'padrinhos elegíveis',
                      ),
                      _ContagemPool(
                        valor: _apadrinhados.length,
                        rotulo: 'apadrinhados',
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'Apadrinhados',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontFamily: 'Poppins',
                  fontWeight: FontWeight.w800,
                  color: AppColors.ink,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'Associe manualmente cada apadrinhado a um padrinho aprovado.',
                style: TextStyle(color: corTextoSecundarioCoord),
              ),
              const SizedBox(height: 10),
              if (_apadrinhados.isEmpty)
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(16),
                    child: Text('Não há apadrinhados aptos para vinculação.'),
                  ),
                ),
              for (final pessoa in _apadrinhados)
                _CartaoApadrinhado(
                  key: ValueKey(pessoa['id']),
                  api: widget.api,
                  programa: widget.programa,
                  pessoa: pessoa,
                  padrinhos: _padrinhos,
                  onVinculado: _carregar,
                ),
              const SizedBox(height: 18),
              Text(
                'Padrinhos aprovados',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontFamily: 'Poppins',
                  fontWeight: FontWeight.w800,
                  color: AppColors.ink,
                ),
              ),
              const SizedBox(height: 10),
              if (_padrinhos.isEmpty)
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(16),
                    child: Text('Não há padrinhos aprovados neste programa.'),
                  ),
                ),
              for (final padrinho in _padrinhos)
                _CartaoPadrinho(pessoa: padrinho),
            ],
          ],
        ),
      ),
    );
  }
}

class _EstadoBloqueado extends StatelessWidget {
  const _EstadoBloqueado({required this.programa});
  final String programa;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.lock_outline, color: AppColors.primary, size: 28),
          const SizedBox(height: 10),
          Text(
            'Matching ainda não liberado',
            style: Theme.of(context).textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.w800, color: AppColors.ink),
          ),
          const SizedBox(height: 6),
          const Text(
            'Encerre as inscrições, decida todas as candidaturas e prepare ao menos um padrinho aprovado. Esta tela não gera sugestões ou vínculos automaticamente.',
            style: TextStyle(height: 1.4, color: corTextoSecundarioCoord),
          ),
          const SizedBox(height: 10),
          Text('Programa $programa'),
        ],
      ),
    ),
  );
}

class _ContagemPool extends StatelessWidget {
  const _ContagemPool({required this.valor, required this.rotulo});
  final int valor;
  final String rotulo;

  @override
  Widget build(BuildContext context) => Chip(
    avatar: CircleAvatar(
      backgroundColor: const Color(0xFFEBE4FF),
      child: Text(
        '$valor',
        style: const TextStyle(
          color: AppColors.primary,
          fontWeight: FontWeight.w800,
        ),
      ),
    ),
    label: Text(rotulo),
  );
}

class _CartaoPadrinho extends StatelessWidget {
  const _CartaoPadrinho({required this.pessoa});
  final Map<String, dynamic> pessoa;

  @override
  Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.only(bottom: 8),
    child: ListTile(
      leading: _AvatarParticipante(pessoa: pessoa),
      title: Text('${pessoa['nome'] ?? 'Padrinho'}'),
      subtitle: Text(
        [
          if (pessoa['curso'] != null) '${pessoa['curso']}',
          if (pessoa['periodo'] != null) '${pessoa['periodo']}º período',
          '${pessoa['apadrinhados'] ?? 0} apadrinhado(s)',
          '${pessoa['grupo'] ?? 'Sem grupo'}',
        ].join(' · '),
      ),
    ),
  );
}

class _CartaoApadrinhado extends StatefulWidget {
  const _CartaoApadrinhado({
    super.key,
    required this.api,
    required this.programa,
    required this.pessoa,
    required this.padrinhos,
    required this.onVinculado,
  });

  final CoordenacaoApi api;
  final String programa;
  final Map<String, dynamic> pessoa;
  final List<Map<String, dynamic>> padrinhos;
  final Future<void> Function() onVinculado;

  @override
  State<_CartaoApadrinhado> createState() => _CartaoApadrinhadoState();
}

class _CartaoApadrinhadoState extends State<_CartaoApadrinhado> {
  int? _padrinhoId;
  bool _salvando = false;

  Future<void> _vincular() async {
    final apadrinhadoId = idDe(widget.pessoa);
    final padrinhoId = _padrinhoId;
    if (apadrinhadoId == null || padrinhoId == null || _salvando) return;
    final padrinho = widget.padrinhos.firstWhere(
      (item) => idDe(item) == padrinhoId,
    );
    final confirmou = await confirmarAcaoCoord(
      context,
      titulo: 'Definir padrinho?',
      mensagem:
          '${padrinho['nome']} será associado a ${widget.pessoa['nome']}. '
          'O vínculo pertence ao programa ${widget.programa}.',
      confirmar: 'Definir padrinho',
    );
    if (!confirmou || !mounted) return;
    setState(() => _salvando = true);
    try {
      await widget.api.criarVinculo(
        apadrinhadoId: apadrinhadoId,
        padrinhoId: padrinhoId,
      );
      if (!mounted) return;
      mostrarMensagemCoord(
        context,
        'Vínculo definido para ${padrinho['nome']}.',
      );
      await widget.onVinculado();
    } catch (erro) {
      if (mounted) mostrarMensagemCoord(context, mensagemDeErro(erro));
    } finally {
      if (mounted) setState(() => _salvando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final vinculado = widget.pessoa['vinculado'] == true;
    final ids = widget.padrinhos.map(idDe).whereType<int>().toSet();
    final padrinhoSelecionado = ids.contains(_padrinhoId) ? _padrinhoId : null;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                _AvatarParticipante(pessoa: widget.pessoa),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${widget.pessoa['nome'] ?? 'Apadrinhado'}',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      Text(
                        [
                          if (widget.pessoa['curso'] != null)
                            '${widget.pessoa['curso']}',
                          if (widget.pessoa['periodo'] != null)
                            '${widget.pessoa['periodo']}º período',
                        ].join(' · '),
                        style: const TextStyle(
                          fontSize: 12,
                          color: corTextoSecundarioCoord,
                        ),
                      ),
                    ],
                  ),
                ),
                if (vinculado)
                  const Chip(
                    label: Text('Com vínculo'),
                    visualDensity: VisualDensity.compact,
                  ),
              ],
            ),
            if (!vinculado) ...[
              const SizedBox(height: 10),
              DropdownButtonFormField<int>(
                initialValue: padrinhoSelecionado,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Padrinho aprovado',
                  border: OutlineInputBorder(),
                ),
                items: [
                  for (final padrinho in widget.padrinhos)
                    if (idDe(padrinho) case final int id)
                      DropdownMenuItem(
                        value: id,
                        child: Text(
                          '${padrinho['nome']} · ${padrinho['grupo'] ?? 'Sem grupo'}',
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                ],
                onChanged: _salvando
                    ? null
                    : (valor) => setState(() => _padrinhoId = valor),
              ),
              const SizedBox(height: 8),
              FilledButton.icon(
                onPressed: _salvando || _padrinhoId == null ? null : _vincular,
                icon: const Icon(Icons.link),
                label: Text(_salvando ? 'Salvando…' : 'Definir padrinho'),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _AvatarParticipante extends StatelessWidget {
  const _AvatarParticipante({required this.pessoa});
  final Map<String, dynamic> pessoa;

  @override
  Widget build(BuildContext context) {
    final foto = pessoa['fotoUrl'];
    final nome = '${pessoa['nome'] ?? ''}'.trim();
    final iniciais = nome
        .split(RegExp(r'\s+'))
        .where((parte) => parte.isNotEmpty)
        .take(2)
        .map((parte) => parte[0].toUpperCase())
        .join();
    return CircleAvatar(
      backgroundColor: const Color(0xFFEBE4FF),
      foregroundImage: foto is String && foto.isNotEmpty
          ? NetworkImage(foto)
          : null,
      child: Text(iniciais),
    );
  }
}
