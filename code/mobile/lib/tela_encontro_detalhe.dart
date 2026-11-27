import 'dart:async';

import 'package:campus_map/campus_map.dart';
import 'package:flutter/material.dart';

import 'services/api_config.dart';
import 'services/encontros_api.dart';
import 'sessao_usuario.dart';
import 'tela_encontro_novo.dart';
import 'tela_encontros.dart';

class TelaEncontroDetalhe extends StatefulWidget {
  const TelaEncontroDetalhe({
    super.key,
    required this.id,
    this.api,
    this.localizacao,
  });

  final String id;
  final EncontrosApi? api;
  final CampusLocationService? localizacao;

  @override
  State<TelaEncontroDetalhe> createState() => _TelaEncontroDetalheState();
}

class _TelaEncontroDetalheState extends State<TelaEncontroDetalhe> {
  late final _api = widget.api ?? EncontrosApi();
  late final _localizacao =
      widget.localizacao ?? GeolocatorCampusLocationService();
  late Future<Encontro> _detalhe;
  late final Timer _relogio;
  bool _ocupado = false;
  String? _mensagem;
  String? _erro;

  String get _token =>
      SessaoUsuario.atual.accessToken ??
      (throw const ApiException('Sua sessão expirou.'));

  @override
  void initState() {
    super.initState();
    _detalhe = _carregar();
    _relogio = Timer.periodic(const Duration(seconds: 15), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _relogio.cancel();
    super.dispose();
  }

  Future<Encontro> _carregar() async => _api.detalhe(_token, widget.id);

  Future<void> _agir(Future<String?> Function() acao) async {
    if (_ocupado) return;
    setState(() {
      _ocupado = true;
      _erro = null;
      _mensagem = null;
    });
    try {
      final mensagem = await acao();
      if (mounted) {
        setState(() {
          _mensagem = mensagem;
          _detalhe = _carregar();
        });
      }
    } on ApiException catch (erro) {
      if (mounted) {
        setState(() {
          _erro = erro.mensagem;
          if (erro.statusCode == 409 || erro.motivo == 'fora-da-janela') {
            _detalhe = _carregar();
          }
        });
      }
    } catch (erro) {
      if (mounted) setState(() => _erro = erro.toString());
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  Future<String?> _confirmar() async {
    final leitura = await _localizacao.locate();
    final xp = await _api.confirmar(_token, widget.id, leitura.location);
    unawaited(SessaoUsuario.atual.atualizarXp());
    return xp > 0
        ? 'Presença confirmada. Você ganhou $xp XP.'
        : 'Presença confirmada.';
  }

  Future<void> _cancelar() async {
    final sim = await showDialog<bool>(
      context: context,
      builder: (dialogo) => AlertDialog(
        title: const Text('Cancelar encontro?'),
        content: const Text('Os convidados serão avisados.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogo, false),
            child: const Text('Voltar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogo, true),
            child: const Text('Cancelar encontro'),
          ),
        ],
      ),
    );
    if (sim != true || !mounted) return;
    await _agir(() async {
      await _api.cancelar(_token, widget.id);
      return 'Encontro cancelado.';
    });
  }

  Future<void> _editar(Encontro encontro) async {
    final salvou = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => TelaEncontroNovo(api: _api, encontro: encontro),
      ),
    );
    if (mounted && salvou == true) setState(() => _detalhe = _carregar());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Detalhe do encontro'),
        actions: [
          IconButton(
            tooltip: 'Atualizar encontro',
            onPressed: _ocupado
                ? null
                : () => setState(() => _detalhe = _carregar()),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: FutureBuilder<Encontro>(
        future: _detalhe,
        builder: (context, snapshot) {
          final encontro = snapshot.data;
          if (snapshot.hasError) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(snapshot.error.toString(), textAlign: TextAlign.center),
                  TextButton(
                    onPressed: () => setState(() => _detalhe = _carregar()),
                    child: const Text('Tentar novamente'),
                  ),
                ],
              ),
            );
          }
          if (encontro == null) {
            return const Center(child: CircularProgressIndicator());
          }
          return _conteudo(encontro);
        },
      ),
    );
  }

  Widget _conteudo(Encontro encontro) {
    final agora = DateTime.now();
    final janela = encontro.janelaAberta(agora);
    final resposta = encontro.meuConvite?.resposta;
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(encontro.local, style: Theme.of(context).textTheme.headlineSmall),
        if (!encontro.localAtivo) const Text('Este PucStop foi desativado.'),
        Text('Início: ${horarioEncontro(context, encontro.inicio)}'),
        Text('Fim: ${horarioEncontro(context, encontro.fim)}'),
        Text('Organizador: ${encontro.organizador}'),
        if (encontro.descricao?.isNotEmpty == true) Text(encontro.descricao!),
        if (encontro.cancelado)
          const Text('Encontro cancelado.')
        else if (encontro.realizado)
          const Text('Encontro realizado.'),
        if (encontro.souOrganizador)
          for (final convite in encontro.convites)
            ListTile(
              title: Text(convite.nome),
              trailing: Text(convite.presente ? 'Presente' : convite.rotulo),
            ),
        if (encontro.meuConvite != null)
          Text('Convite: ${encontro.meuConvite!.rotulo}'),
        if (encontro.podeResponder)
          Wrap(
            spacing: 8,
            children: [
              if (resposta != 'aceito')
                OutlinedButton(
                  onPressed: _ocupado
                      ? null
                      : () => _agir(() async {
                          await _api.responder(_token, encontro.id, 'aceito');
                          return 'Convite aceito.';
                        }),
                  child: const Text('Aceitar convite'),
                ),
              if (resposta != 'recusado')
                OutlinedButton(
                  onPressed: _ocupado
                      ? null
                      : () => _agir(() async {
                          await _api.responder(_token, encontro.id, 'recusado');
                          return 'Convite recusado.';
                        }),
                  child: const Text('Recusar convite'),
                ),
            ],
          ),
        if (encontro.presente)
          const Text('Sua presença está confirmada.')
        else if (!encontro.cancelado) ...[
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _ocupado || !encontro.podeConfirmar || !janela
                ? null
                : () => _agir(_confirmar),
            child: const Text('Confirmar presença'),
          ),
          if (!encontro.podeConfirmar)
            const Text('Aceite o convite para confirmar presença.')
          else if (!janela)
            Text(
              agora.isBefore(encontro.checkinAbre)
                  ? 'Confirmação disponível a partir de ${horarioEncontro(context, encontro.checkinAbre)}.'
                  : 'A janela de confirmação terminou.',
            ),
        ],
        if (encontro.souOrganizador && !encontro.cancelado) ...[
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: _ocupado ? null : () => _editar(encontro),
            child: const Text('Editar encontro'),
          ),
          TextButton(
            onPressed: _ocupado ? null : _cancelar,
            child: const Text('Cancelar encontro'),
          ),
        ],
        if (_ocupado) const LinearProgressIndicator(),
        if (_mensagem != null) Text(_mensagem!),
        if (_erro != null)
          Text(
            _erro!,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
      ],
    );
  }
}
