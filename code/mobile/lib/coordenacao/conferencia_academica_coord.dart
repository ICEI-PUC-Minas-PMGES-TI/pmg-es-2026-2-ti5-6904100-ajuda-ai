import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../services/coordenacao_api.dart';
import '../theme/colors.dart';
import 'componentes_coord.dart';
import 'painel_coord.dart';

bool conferenciaLiberaAprovacaoCoord(Map<String, dynamic>? conferencia) =>
    (conferencia?['verificacao'] as Map?)?['resultado'] ==
    'requisitos_atendidos';

List<Map<String, dynamic>> _lista(Object? valor) => valor is List
    ? valor.whereType<Map>().map((v) => Map<String, dynamic>.from(v)).toList()
    : [];

String _resultado(Object? valor) => valor == 'requisitos_atendidos'
    ? 'Requisitos atendidos'
    : valor == 'requisitos_nao_atendidos'
    ? 'Requisitos não atendidos'
    : 'Não conferida';

class ConferenciaAcademicaCoord extends StatefulWidget {
  const ConferenciaAcademicaCoord({
    super.key,
    required this.api,
    required this.participacaoId,
    required this.conferencia,
    required this.onRegistrada,
  });
  final CoordenacaoApi api;
  final int participacaoId;
  final Map<String, dynamic> conferencia;
  final ValueChanged<Map<String, dynamic>> onRegistrada;
  @override
  State<ConferenciaAcademicaCoord> createState() =>
      _ConferenciaAcademicaCoordState();
}

class _ConferenciaAcademicaCoordState extends State<ConferenciaAcademicaCoord>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;
  final _observacoes = TextEditingController();
  final Map<String, bool> _marcacoes = {};
  bool _salvando = false;
  String? _erro;
  @override
  void initState() {
    super.initState();
    _iniciar();
  }

  @override
  void didUpdateWidget(covariant ConferenciaAcademicaCoord oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.participacaoId != widget.participacaoId ||
        oldWidget.conferencia['verificacao'] !=
            widget.conferencia['verificacao'] ||
        oldWidget.conferencia['itens'] != widget.conferencia['itens']) {
      _iniciar();
    }
  }

  void _iniciar() {
    _marcacoes.clear();
    for (final item in _lista(
      (widget.conferencia['verificacao'] as Map?)?['itens'],
    )) {
      if (item['atende'] is bool) {
        _marcacoes['${item['id']}'] = item['atende'] as bool;
      }
    }
  }

  @override
  void dispose() {
    _observacoes.dispose();
    super.dispose();
  }

  Future<void> _registrar() async {
    final itens = _lista(widget.conferencia['itens']);
    if (_salvando ||
        itens.isEmpty ||
        itens.any((i) => !_marcacoes.containsKey('${i['id']}'))) {
      return;
    }
    setState(() {
      _salvando = true;
      _erro = null;
    });
    try {
      final atualizado = await widget.api.registrarVerificacao(
        widget.participacaoId,
        itens: [
          for (final i in itens)
            {'id': i['id'], 'atende': _marcacoes['${i['id']}']},
        ],
        observacoes: _observacoes.text.trim(),
      );
      if (!mounted) return;
      _observacoes.clear();
      widget.onRegistrada(atualizado);
    } catch (erro) {
      if (mounted) setState(() => _erro = mensagemDeErro(erro));
    } finally {
      if (mounted) setState(() => _salvando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final conferencia = widget.conferencia;
    final itens = _lista(conferencia['itens']);
    final registro = conferencia['verificacao'] as Map?;
    final dados = conferencia['dadosParaConsulta'] as Map?;
    final podeRegistrar = conferencia['podeRegistrar'] == true;
    final conferidos = itens
        .where((i) => _marcacoes.containsKey('${i['id']}'))
        .length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const TituloPainelCoord(
          titulo: 'Conferência acadêmica',
          descricao: 'Consulte os dados acadêmicos e registre o resultado de cada requisito.',
        ),
        SeloPainelCoord(
          _resultado(registro?['resultado']),
          verde: registro?['resultado'] == 'requisitos_atendidos',
        ),
        if (dados != null) ...[
          const SizedBox(height: 18),
          ExpansionTile(
            tilePadding: EdgeInsets.zero,
            leading: const Icon(Icons.badge_outlined, color: AppColors.primary),
            title: const Text(
              'Dados para consulta',
              style: TextStyle(
                color: AppColors.primary,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
            subtitle: const Text(
              'Nome, contato e dados acadêmicos',
              style: TextStyle(color: corTextoSecundarioCoord, fontSize: 11),
            ),
            children: [
              for (final campo in [
                ('Nome', dados['nome']),
                ('E-mail institucional', dados['email']),
                (
                  'Curso / período',
                  '${dados['curso'] ?? '—'}${dados['periodo'] == null ? '' : ' · ${dados['periodo']}º período'}',
                ),
                (
                  'Papel',
                  '${dados['papel'] ?? '—'} · ${dados['programa'] ?? ''}',
                ),
              ])
                Container(
                  width: double.infinity,
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.lavender,
                    borderRadius: BorderRadius.circular(9),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        campo.$1,
                        style: const TextStyle(
                          fontSize: 11,
                          color: corTextoSecundarioCoord,
                        ),
                      ),
                      const SizedBox(height: 5),
                      SelectableText(
                        '${campo.$2 ?? '—'}',
                        style: const TextStyle(
                          fontSize: 13,
                          color: AppColors.ink,
                          height: 1.5,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
          OutlinedButton.icon(
            onPressed: () async {
              await Clipboard.setData(
                ClipboardData(
                  text:
                      'Nome: ${dados['nome']}\nE-mail institucional: ${dados['email']}\nCurso: ${dados['curso']}\nPeríodo: ${dados['periodo'] ?? 'não informado'}\nPapel: ${dados['papel']} · Programa ${dados['programa']}',
                ),
              );
              if (context.mounted) {
                mostrarMensagemCoord(context, 'Dados copiados.');
              }
            },
            icon: const Icon(Icons.copy_outlined, size: 16),
            label: const Text('Copiar dados'),
          ),
        ],
        if (podeRegistrar) ...[
          const SizedBox(height: 20),
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Verificação dos requisitos',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink,
                  ),
                ),
              ),
              Text(
                '$conferidos de ${itens.length}',
                style: const TextStyle(fontSize: 12, color: AppColors.primary),
              ),
            ],
          ),
          const SizedBox(height: 10),
          LinearProgressIndicator(
            value: itens.isEmpty ? 0 : conferidos / itens.length,
            color: AppColors.primary,
            backgroundColor: const Color(0xFFEDE5FA),
            borderRadius: BorderRadius.circular(5),
            minHeight: 5,
            semanticsLabel: 'Requisitos conferidos',
          ),
          const SizedBox(height: 16),
          for (var n = 0; n < itens.length; n++) _requisito(itens[n], n),
          const SizedBox(height: 12),
          TextField(
            controller: _observacoes,
            enabled: !_salvando,
            minLines: 2,
            maxLines: 4,
            maxLength: 1000,
            decoration: const InputDecoration(
              labelText: 'Observações da conferência (opcional)',
              hintText: 'Ex.: matrícula ativa e histórico conferidos no SGA.',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed:
                  _salvando || itens.isEmpty || conferidos != itens.length
                  ? null
                  : _registrar,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
              ),
              icon: const Icon(Icons.verified_outlined, size: 18),
              label: Text(
                _salvando
                    ? 'Registrando…'
                    : registro == null
                    ? 'Registrar conferência'
                    : 'Registrar nova conferência',
              ),
            ),
          ),
          if (conferidos != itens.length)
            const Padding(
              padding: EdgeInsets.only(top: 8),
              child: Text(
                'Marque todos os itens para registrar a conferência.',
                style: TextStyle(fontSize: 12, color: corTextoSecundarioCoord),
              ),
            ),
        ],
        if (registro != null) ...[
          const SizedBox(height: 22),
          const TituloPainelCoord(titulo: 'Registro da conferência'),
          Text(
            '${_resultado(registro['resultado'])} · ${formatarDataCoord(registro['em'])}\nResponsável: ${registro['por'] ?? '—'}',
            style: const TextStyle(
              fontSize: 12,
              color: corTextoSecundarioCoord,
              height: 1.6,
            ),
          ),
          if (!podeRegistrar)
            for (final item in _lista(registro['itens']))
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  item['atende'] == true
                      ? Icons.check_circle_outline
                      : Icons.cancel_outlined,
                  color: item['atende'] == true
                      ? const Color(0xFF176C4B)
                      : corErroCoord,
                ),
                title: Text(
                  '${item['descricao']}',
                  style: const TextStyle(fontSize: 13, color: AppColors.ink),
                ),
              ),
          if ('${registro['observacoes'] ?? ''}'.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(
                '${registro['observacoes']}',
                style: const TextStyle(fontSize: 12, color: AppColors.ink),
              ),
            ),
        ],
        if (_lista(conferencia['anteriores']).isNotEmpty)
          ExpansionTile(
            tilePadding: EdgeInsets.zero,
            title: const Text(
              'Conferências anteriores',
              style: TextStyle(fontSize: 13, color: AppColors.primary),
            ),
            children: [
              for (final anterior in _lista(conferencia['anteriores']))
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(
                    _resultado(anterior['resultado']),
                    style: const TextStyle(fontSize: 13),
                  ),
                  subtitle: Text(
                    '${formatarDataCoord(anterior['em'])} · ${anterior['por'] ?? '—'}\n${anterior['observacoes'] ?? ''}',
                  ),
                ),
            ],
          ),
        if (!podeRegistrar && registro == null)
          const Padding(
            padding: EdgeInsets.only(top: 16),
            child: Text(
              'Decidida sem conferência registrada (registro anterior a esta etapa).',
              style: TextStyle(fontSize: 12, color: corTextoSecundarioCoord),
            ),
          ),
        if (_erro != null)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(_erro!, style: const TextStyle(color: corErroCoord)),
          ),
        const SizedBox(height: 18),
        const Text(
          'Consulte o sistema da faculdade e registre aqui o que foi conferido. Visível só para a coordenação.',
          style: TextStyle(
            fontSize: 11,
            color: corTextoSecundarioCoord,
            height: 1.6,
          ),
        ),
      ],
    );
  }

  Widget _requisito(Map<String, dynamic> item, int indice) => Container(
    key: ValueKey('conferencia-item-${item['id']}'),
    margin: const EdgeInsets.only(bottom: 10),
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      border: Border.all(
        color:
            _marcacoes['${item['id']}'] == false && item['obrigatorio'] == true
            ? const Color(0xFFE5AABD)
            : const Color(0xFFE4DFF0),
      ),
      borderRadius: BorderRadius.circular(10),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SeloPainelCoord('${indice + 1}'),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${item['descricao']}',
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                      color: AppColors.ink,
                      height: 1.5,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    '${item['origem'] == 'programa' ? 'Critério do programa' : 'Requisito do papel'}${item['obrigatorio'] == true ? '' : ' · opcional'}',
                    style: const TextStyle(
                      fontSize: 11,
                      color: corTextoSecundarioCoord,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final escolha in [true, false])
              Semantics(
                label:
                    '${escolha ? 'Atende' : 'Não atende'}: ${item['descricao']}',
                child: ChoiceChip(
                  label: Text(escolha ? 'Atende' : 'Não atende'),
                  selected: _marcacoes['${item['id']}'] == escolha,
                  selectedColor: escolha
                      ? const Color(0xFFE8F6EF)
                      : const Color(0xFFFFEAF0),
                  labelStyle: TextStyle(
                    fontSize: 12,
                    color: escolha ? const Color(0xFF176C4B) : corErroCoord,
                  ),
                  onSelected: _salvando
                      ? null
                      : (_) => setState(
                          () => _marcacoes['${item['id']}'] = escolha,
                        ),
                ),
              ),
          ],
        ),
      ],
    ),
  );
}
