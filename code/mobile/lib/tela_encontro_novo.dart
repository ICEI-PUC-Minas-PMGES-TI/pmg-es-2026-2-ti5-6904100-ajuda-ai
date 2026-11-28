import 'package:campus_map/campus_map.dart';
import 'package:flutter/material.dart';

import 'services/encontros_api.dart';
import 'services/pucstops_api.dart';
import 'sessao_usuario.dart';
import 'tela_encontros.dart';

class TelaEncontroNovo extends StatefulWidget {
  const TelaEncontroNovo({super.key, required this.api, this.encontro});

  final EncontrosApi api;
  final Encontro? encontro;

  @override
  State<TelaEncontroNovo> createState() => _TelaEncontroNovoState();
}

class _TelaEncontroNovoState extends State<TelaEncontroNovo> {
  late final _descricao = TextEditingController(
    text: widget.encontro?.descricao,
  );
  late DateTime _inicio =
      widget.encontro?.inicio.toLocal() ??
      DateTime.now().add(const Duration(hours: 1));
  late DateTime _fim =
      widget.encontro?.fim.toLocal() ?? _inicio.add(const Duration(hours: 1));
  late String? _localId = widget.encontro?.localId;
  final _selecionados = <int>{};
  late Future<void> _opcoes;
  List<CampusPucStop> _locais = [];
  List<({int id, String nome})> _alunos = [];
  bool _ocupado = false;
  String? _erro;

  bool get _mudancaDeAgenda => widget.encontro?.podeRemarcar ?? true;

  @override
  void initState() {
    super.initState();
    _opcoes = _carregar();
  }

  Future<void> _carregar() async {
    final token = SessaoUsuario.atual.accessToken;
    if (token == null) throw const FormatException('Sua sessão expirou.');
    if (_mudancaDeAgenda) {
      _locais = await MapaApiPucStopService(accessToken: () => token).list();
    }
    if (widget.encontro == null) _alunos = await widget.api.apadrinhados(token);
  }

  @override
  void dispose() {
    _descricao.dispose();
    super.dispose();
  }

  Future<void> _escolherData(bool inicio) async {
    final atual = inicio ? _inicio : _fim;
    final data = await showDatePicker(
      context: context,
      initialDate: atual,
      firstDate: DateTime(atual.year - 1),
      lastDate: DateTime(atual.year + 2),
    );
    if (data == null || !mounted) return;
    final hora = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(atual),
    );
    if (hora == null || !mounted) return;
    final nova = DateTime(
      data.year,
      data.month,
      data.day,
      hora.hour,
      hora.minute,
    );
    setState(() {
      if (inicio) {
        _inicio = nova;
      } else {
        _fim = nova;
      }
    });
  }

  Future<void> _salvar() async {
    final anterior = widget.encontro;
    if (_localId == null ||
        !_fim.isAfter(_inicio) ||
        (anterior == null && _selecionados.isEmpty)) {
      setState(
        () => _erro =
            'Escolha o local e os convidados. O fim deve ser depois do início.',
      );
      return;
    }
    final local =
        _locais.where((item) => item.id == _localId).firstOrNull?.name ??
        anterior?.local;
    final novos = _alunos
        .where((aluno) => _selecionados.contains(aluno.id))
        .map((aluno) => aluno.nome);
    final mudouAgenda =
        anterior != null &&
        (_localId != anterior.localId ||
            !_inicio.isAtSameMomentAs(anterior.inicio) ||
            !_fim.isAtSameMomentAs(anterior.fim));
    setState(() {
      _ocupado = true;
      _erro = null;
    });
    try {
      final confirmou = await showDialog<bool>(
        context: context,
        builder: (dialogo) => AlertDialog(
          title: const Text('Revisar encontro'),
          content: SingleChildScrollView(
            child: Text(
              [
                ?local,
                'Início: ${horarioEncontro(context, _inicio)}',
                'Fim: ${horarioEncontro(context, _fim)}',
                if (_descricao.text.trim().isNotEmpty) _descricao.text.trim(),
                if (novos.isNotEmpty) 'Convidados: ${novos.join(', ')}',
                if (mudouAgenda)
                  'Os convidados precisarão responder novamente.',
              ].join('\n'),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogo, false),
              child: const Text('Voltar'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialogo, true),
              child: Text(
                anterior == null ? 'Enviar convites' : 'Salvar alterações',
              ),
            ),
          ],
        ),
      );
      if (confirmou != true || !mounted) return;
      final token = SessaoUsuario.atual.accessToken;
      if (token == null) throw const FormatException('Sua sessão expirou.');
      await widget.api.salvar(token, {
        if (anterior == null || anterior.localId != _localId)
          'pucstopId': _localId,
        if (anterior == null || !_inicio.isAtSameMomentAs(anterior.inicio))
          'inicio': _inicio.toUtc().toIso8601String(),
        if (anterior == null || !_fim.isAtSameMomentAs(anterior.fim))
          'fim': _fim.toUtc().toIso8601String(),
        'descricao': _descricao.text.trim(),
        if (anterior == null) 'apadrinhadoIds': _selecionados.toList(),
      }, id: anterior?.id);
      if (mounted) Navigator.pop(context, true);
    } catch (erro) {
      if (mounted) setState(() => _erro = erro.toString());
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final anterior = widget.encontro;
    final localAnterior = anterior?.localId;
    return Scaffold(
      appBar: AppBar(
        title: Text(anterior == null ? 'Marcar encontro' : 'Editar encontro'),
      ),
      body: FutureBuilder<void>(
        future: _opcoes,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(snapshot.error.toString()),
                  TextButton(
                    onPressed: () => setState(() => _opcoes = _carregar()),
                    child: const Text('Tentar novamente'),
                  ),
                ],
              ),
            );
          }
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (_mudancaDeAgenda) ...[
                DropdownButtonFormField<String>(
                  initialValue: _localId,
                  decoration: const InputDecoration(labelText: 'PucStop'),
                  items: [
                    if (localAnterior != null &&
                        !_locais.any((item) => item.id == localAnterior))
                      DropdownMenuItem(
                        value: localAnterior,
                        child: Text(anterior!.local),
                      ),
                    for (final local in _locais)
                      DropdownMenuItem(
                        value: local.id,
                        child: Text(local.name),
                      ),
                  ],
                  onChanged: _ocupado
                      ? null
                      : (valor) => setState(() => _localId = valor),
                ),
                ListTile(
                  title: const Text('Início'),
                  subtitle: Text(horarioEncontro(context, _inicio)),
                  onTap: _ocupado ? null : () => _escolherData(true),
                ),
                ListTile(
                  title: const Text('Fim'),
                  subtitle: Text(horarioEncontro(context, _fim)),
                  onTap: _ocupado ? null : () => _escolherData(false),
                ),
              ],
              TextField(
                controller: _descricao,
                enabled: !_ocupado,
                maxLines: 3,
                maxLength: 1000,
                decoration: const InputDecoration(labelText: 'Descrição'),
              ),
              if (anterior == null) ...[
                Text(
                  'Apadrinhados',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                if (_alunos.isEmpty)
                  const Text(
                    'Você não tem apadrinhados vinculados neste ciclo.',
                  ),
                for (final aluno in _alunos)
                  CheckboxListTile(
                    title: Text(aluno.nome),
                    value: _selecionados.contains(aluno.id),
                    onChanged: _ocupado
                        ? null
                        : (marcado) => setState(() {
                            if (marcado == true) {
                              _selecionados.add(aluno.id);
                            } else {
                              _selecionados.remove(aluno.id);
                            }
                          }),
                  ),
              ],
              if (_erro != null)
                Text(
                  _erro!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _ocupado ? null : _salvar,
                child: const Text('Revisar'),
              ),
            ],
          );
        },
      ),
    );
  }
}
