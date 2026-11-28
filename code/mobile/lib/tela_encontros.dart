import 'package:flutter/material.dart';

import 'services/encontros_api.dart';
import 'sessao_usuario.dart';
import 'tela_encontro_detalhe.dart';
import 'tela_encontro_novo.dart';

String horarioEncontro(BuildContext context, DateTime data) {
  final local = data.toLocal();
  final formato = MaterialLocalizations.of(context);
  return '${formato.formatShortDate(local)} · ${formato.formatTimeOfDay(TimeOfDay.fromDateTime(local))}';
}

class TelaEncontros extends StatefulWidget {
  const TelaEncontros({super.key});

  @override
  State<TelaEncontros> createState() => _TelaEncontrosState();
}

class _TelaEncontrosState extends State<TelaEncontros> {
  final _api = EncontrosApi();
  bool _anteriores = false;
  late Future<List<Encontro>> _lista;

  @override
  void initState() {
    super.initState();
    _lista = _carregar();
  }

  Future<List<Encontro>> _carregar() {
    final token = SessaoUsuario.atual.accessToken;
    if (token == null) return Future.error('Sua sessão expirou.');
    return _api.listar(token, anteriores: _anteriores);
  }

  Future<void> _atualizar() async {
    setState(() => _lista = _carregar());
    try {
      await _lista;
    } catch (_) {}
  }

  Future<void> _abrir(Widget tela) async {
    await Navigator.of(context)
        .push(MaterialPageRoute<void>(builder: (_) => tela));
    if (mounted) await _atualizar();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Encontros')),
      floatingActionButton: SessaoUsuario.atual.ehPadrinhoAtivo
          ? FloatingActionButton.extended(
              onPressed: () => _abrir(TelaEncontroNovo(api: _api)),
              icon: const Icon(Icons.add),
              label: const Text('Marcar encontro'),
            )
          : null,
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: SegmentedButton<bool>(
              segments: const [
                ButtonSegment(value: false, label: Text('Futuros')),
                ButtonSegment(value: true, label: Text('Anteriores')),
              ],
              selected: {_anteriores},
              onSelectionChanged: (valor) {
                _anteriores = valor.single;
                _atualizar();
              },
            ),
          ),
          Expanded(
            child: FutureBuilder<List<Encontro>>(
              future: _lista,
              builder: (context, snapshot) {
                if (snapshot.connectionState != ConnectionState.done) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snapshot.hasError) {
                  return Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          snapshot.error.toString(),
                          textAlign: TextAlign.center,
                        ),
                        TextButton(
                          onPressed: _atualizar,
                          child: const Text('Tentar novamente'),
                        ),
                      ],
                    ),
                  );
                }
                final encontros = snapshot.data ?? [];
                return RefreshIndicator(
                  onRefresh: _atualizar,
                  child: ListView(
                    padding: const EdgeInsets.only(bottom: 88),
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: [
                      if (encontros.isEmpty)
                        const Center(
                          child: Padding(
                            padding: EdgeInsets.all(24),
                            child: Text('Nenhum encontro neste período.'),
                          ),
                        ),
                      for (final encontro in encontros)
                        ListTile(
                          leading: const Icon(Icons.event_outlined),
                          title: Text(encontro.local),
                          subtitle: Text(
                            [
                              horarioEncontro(context, encontro.inicio),
                              if (encontro.cancelado)
                                'Cancelado'
                              else if (encontro.realizado)
                                'Realizado'
                              else if (encontro.meuConvite != null)
                                encontro.meuConvite!.rotulo,
                            ].join('\n'),
                          ),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () => _abrir(
                            TelaEncontroDetalhe(id: encontro.id, api: _api),
                          ),
                        ),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
