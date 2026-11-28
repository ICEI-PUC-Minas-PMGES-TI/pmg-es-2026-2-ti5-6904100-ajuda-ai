import 'dart:async';

import 'package:flutter/material.dart';

import 'models/resumo_gamificacao.dart';
import 'services/api_config.dart';
import 'services/sons_conquista.dart';
import 'sessao_usuario.dart';
import 'theme/colors.dart';
import 'widgets/celebracao_nivel.dart';
import 'widgets/progresso_gamificacao.dart';

String _milhar(int valor) {
  final texto = valor.toString();
  final buffer = StringBuffer();
  for (var i = 0; i < texto.length; i++) {
    if (i > 0 && (texto.length - i) % 3 == 0) buffer.write('.');
    buffer.write(texto[i]);
  }
  return buffer.toString();
}

/// Painel de testes da gamificação (QA), igual ao da web: escolher qualquer
/// nível da tabela REAL, ver o emblema e o perfil simulado, reproduzir a
/// animação quantas vezes quiser e reiniciar. Acesso decidido pela API
/// (`/qa/gamificacao`); sem liberação a tela fecha. Nada aqui grava: a
/// simulação é calculada pelo servidor e a animação não confirma conquista.
class TelaQaGamificacao extends StatefulWidget {
  const TelaQaGamificacao({super.key});

  @override
  State<TelaQaGamificacao> createState() => _TelaQaGamificacaoState();
}

class _TelaQaGamificacaoState extends State<TelaQaGamificacao> {
  final _sessao = SessaoUsuario.atual;
  List<NivelTabela>? _niveis;
  String? _erro;
  int? _nivel;
  int? _comparar;
  int _progresso = 50;
  int _saltos = 1;
  bool _simulando = false;
  final Map<int, ResumoGamificacao> _simulacoes = {};
  Timer? _espera;
  int _consulta = 0;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  @override
  void dispose() {
    _espera?.cancel();
    super.dispose();
  }

  Future<void> _carregar() async {
    final token = _sessao.accessToken;
    if (token == null) return _negado();
    setState(() => _erro = null);
    try {
      final niveis = await _sessao.xpApi.qaAcesso(token);
      if (!mounted) return;
      final real = _sessao.gamificacao.value?.nivel.numero;
      setState(() {
        _niveis = niveis;
        _nivel = niveis.any((n) => n.numero == real)
            ? real
            : niveis.first.numero;
      });
      _simular();
    } on Object catch (e) {
      if (!mounted) return;
      final codigo = e is ApiException ? e.statusCode : null;
      if (codigo == 403 || codigo == 404) return _negado();
      setState(() => _erro = 'Não foi possível abrir o painel de testes.');
    }
  }

  void _negado() {
    _sessao.qaGamificacao.value = false;
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Painel de testes indisponível para esta conta.'),
      ),
    );
    Navigator.of(context).maybePop();
  }

  /// Perfil simulado pelo servidor (com espera curta enquanto o controle
  /// desliza). Respostas atrasadas de consultas antigas são ignoradas.
  void _simular() {
    _espera?.cancel();
    _espera = Timer(const Duration(milliseconds: 180), () async {
      final token = _sessao.accessToken;
      final alvos = [_nivel, _comparar].whereType<int>().toList();
      if (token == null || alvos.isEmpty) return;
      final consulta = ++_consulta;
      setState(() => _simulando = true);
      try {
        final lista = await Future.wait(
          alvos.map(
            (n) => _sessao.xpApi.qaSimulacao(token, n, progresso: _progresso),
          ),
        );
        if (!mounted || consulta != _consulta) return;
        setState(() {
          _simulacoes
            ..clear()
            ..addEntries(lista.map((s) => MapEntry(s.nivel.numero, s)));
          _simulando = false;
        });
      } on Object catch (e) {
        if (!mounted || consulta != _consulta) return;
        final codigo = e is ApiException ? e.statusCode : null;
        if (codigo == 403 || codigo == 404) return _negado();
        setState(() => _simulando = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Não foi possível simular o nível.')),
        );
      }
    });
  }

  void _escolher(int numero) {
    final indice = _niveis!.indexWhere((n) => n.numero == numero);
    setState(() {
      _nivel = numero;
      if (_comparar == numero) _comparar = null;
      _saltos = _saltos.clamp(1, indice < 1 ? 1 : indice);
    });
    _simular();
  }

  Future<void> _reproduzir(NivelTabela nivel, int saltos) =>
      mostrarCelebracaoNivel(
        context,
        numero: nivel.numero,
        nome: nivel.nome,
        niveisAvancados: saltos,
        teste: true,
      );

  /// Volta à visualização original: nível real, sem comparação, barra no
  /// meio. Apaga todo o estado temporário da simulação.
  void _reiniciar() {
    final real = _sessao.gamificacao.value?.nivel.numero;
    setState(() {
      _simulacoes.clear();
      _comparar = null;
      _progresso = 50;
      _saltos = 1;
      _nivel = _niveis!.any((n) => n.numero == real)
          ? real
          : _niveis!.first.numero;
    });
    _simular();
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('Simulação reiniciada.')));
  }

  @override
  Widget build(BuildContext context) {
    final niveis = _niveis;
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text('Testes de gamificação'),
        actions: [
          ValueListenableBuilder<bool>(
            valueListenable: SonsConquista.silenciado,
            builder: (context, mudo, _) => IconButton(
              tooltip: mudo ? 'Ativar sons' : 'Silenciar sons',
              onPressed: () => SonsConquista.silenciado.value = !mudo,
              icon: Icon(
                mudo ? Icons.volume_off_rounded : Icons.volume_up_rounded,
              ),
            ),
          ),
        ],
      ),
      body: _erro != null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(_erro!, textAlign: TextAlign.center),
                    const SizedBox(height: 12),
                    OutlinedButton(
                      onPressed: _carregar,
                      child: const Text('Tentar novamente'),
                    ),
                  ],
                ),
              ),
            )
          : niveis == null || _nivel == null
          ? const Center(child: CircularProgressIndicator())
          : _conteudo(niveis),
    );
  }

  Widget _conteudo(List<NivelTabela> niveis) {
    final indice = niveis.indexWhere((n) => n.numero == _nivel);
    final atual = niveis[indice];
    final proximo = indice + 1 < niveis.length ? niveis[indice + 1] : null;
    final simulado = _simulacoes[_nivel];
    final comparado = _comparar == null ? null : _simulacoes[_comparar];
    final real = _sessao.gamificacao.value;
    final maxSaltos = indice < 1 ? 1 : indice;

    return ListView(
      key: const Key('qa-gamificacao'),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFFFAF5FF),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFE9D5FF)),
          ),
          child: const Text(
            'Modo de teste: valores calculados pelo servidor, sem gravação. '
            'A animação manual não concede XP nem recompensas.',
            style: TextStyle(
              fontFamily: 'Inter',
              color: Color(0xFF4C1D95),
              fontSize: 13,
            ),
          ),
        ),
        const SizedBox(height: 16),
        Text(
          'Níveis cadastrados (${niveis.length})',
          style: const TextStyle(
            color: AppColors.ink,
            fontSize: 16,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 8),
        SizedBox(
          height: 124,
          child: ListView.separated(
            key: const Key('qa-niveis'),
            scrollDirection: Axis.horizontal,
            itemCount: niveis.length,
            separatorBuilder: (_, _) => const SizedBox(width: 8),
            itemBuilder: (context, i) {
              final n = niveis[i];
              final ativo = n.numero == _nivel;
              return Semantics(
                selected: ativo,
                button: true,
                label: 'Nível ${n.numero}, ${n.nome}',
                child: InkWell(
                  key: Key('qa-nivel-${n.numero}'),
                  onTap: () => _escolher(n.numero),
                  borderRadius: BorderRadius.circular(14),
                  child: Container(
                    width: 92,
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: ativo
                            ? AppColors.primary
                            : n.numero == _comparar
                            ? const Color(0xFFA78BFA)
                            : AppAccents.cardBorder,
                        width: ativo ? 2 : 1.5,
                      ),
                    ),
                    // Escala para caber mesmo com fonte ampliada.
                    child: ExcludeSemantics(
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            EmblemaNivel(numero: n.numero, tamanho: 56),
                            const SizedBox(height: 4),
                            Text(
                              'Nível ${n.numero}',
                              style: const TextStyle(
                                fontSize: 12.5,
                                fontWeight: FontWeight.w800,
                                color: AppColors.ink,
                              ),
                            ),
                            Text(
                              '${_milhar(n.xpMinimo)} XP',
                              style: const TextStyle(
                                fontFamily: 'Inter',
                                fontSize: 11,
                                color: AppColors.muted,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 18),
        Center(
          child: EmblemaNivel(
            numero: atual.numero,
            nome: atual.nome,
            tamanho: 150,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Nível ${atual.numero} · ${atual.nome}',
          key: const Key('qa-nivel-selecionado'),
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: AppColors.ink,
            fontSize: 18,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'XP exigido: ${_milhar(atual.xpMinimo)} XP · '
          '${proximo == null ? 'nível máximo' : 'próximo: ${_milhar(proximo.xpMinimo)} XP (${proximo.nome})'}',
          key: const Key('qa-xp-exigido'),
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontFamily: 'Inter',
            color: AppColors.muted,
            fontSize: 13,
          ),
        ),
        const SizedBox(height: 10),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            TextButton.icon(
              onPressed: indice > 0
                  ? () => _escolher(niveis[indice - 1].numero)
                  : null,
              icon: const Icon(Icons.chevron_left_rounded),
              label: const Text('Anterior'),
            ),
            TextButton.icon(
              onPressed: indice < niveis.length - 1
                  ? () => _escolher(niveis[indice + 1].numero)
                  : null,
              icon: const Icon(Icons.chevron_right_rounded),
              label: const Text('Próximo'),
            ),
          ],
        ),
        Row(
          children: [
            const Text(
              'Simular subida de',
              style: TextStyle(fontFamily: 'Inter', fontSize: 13),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: DropdownButton<int>(
                key: const Key('qa-saltos'),
                isExpanded: true,
                value: _saltos.clamp(1, maxSaltos),
                onChanged: maxSaltos <= 1
                    ? null
                    : (v) => setState(() => _saltos = v ?? 1),
                items: [
                  for (var q = 1; q <= maxSaltos; q++)
                    DropdownMenuItem(
                      value: q,
                      child: Text(
                        q == 1 ? '1 nível' : '$q níveis de uma vez',
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        FilledButton.icon(
          key: const Key('qa-reproduzir'),
          onPressed: () => _reproduzir(atual, _saltos.clamp(1, maxSaltos)),
          icon: const Icon(Icons.auto_awesome_rounded),
          label: const Text('Reproduzir animação'),
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.primary,
            minimumSize: const Size.fromHeight(48),
          ),
        ),
        const SizedBox(height: 22),
        const Text(
          'Como o perfil aparece',
          style: TextStyle(
            color: AppColors.ink,
            fontSize: 16,
            fontWeight: FontWeight.w800,
          ),
        ),
        Text(
          'Posição na barra do nível: $_progresso%',
          style: const TextStyle(fontFamily: 'Inter', fontSize: 13),
        ),
        Slider(
          key: const Key('qa-progresso'),
          value: _progresso.toDouble(),
          max: 100,
          divisions: 20,
          label: '$_progresso%',
          activeColor: AppColors.primary,
          onChanged: (v) {
            setState(() => _progresso = v.round());
            _simular();
          },
        ),
        if (simulado != null)
          CartaoProgressoResumo(
            key: const Key('qa-perfil-simulado'),
            resumo: simulado,
          )
        else if (_simulando)
          const Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: CircularProgressIndicator()),
          ),
        const SizedBox(height: 14),
        Row(
          children: [
            const Text(
              'Comparar com',
              style: TextStyle(fontFamily: 'Inter', fontSize: 13),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: DropdownButton<int?>(
                key: const Key('qa-comparar'),
                isExpanded: true,
                value: _comparar,
                onChanged: (v) {
                  setState(() => _comparar = v);
                  _simular();
                },
                items: [
                  const DropdownMenuItem<int?>(
                    value: null,
                    child: Text('Nenhum nível'),
                  ),
                  for (final n in niveis)
                    if (n.numero != _nivel)
                      DropdownMenuItem<int?>(
                        value: n.numero,
                        child: Text('Nível ${n.numero} · ${n.nome}'),
                      ),
                ],
              ),
            ),
          ],
        ),
        if (comparado != null) ...[
          const SizedBox(height: 8),
          CartaoProgressoResumo(resumo: comparado),
          TextButton.icon(
            onPressed: () =>
                _reproduzir(niveis.firstWhere((n) => n.numero == _comparar), 1),
            icon: const Icon(Icons.replay_rounded),
            label: Text('Reproduzir animação do nível $_comparar'),
          ),
        ],
        const SizedBox(height: 22),
        Row(
          children: [
            const Expanded(
              child: Text(
                'Seu progresso real',
                style: TextStyle(
                  color: AppColors.ink,
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            OutlinedButton.icon(
              key: const Key('qa-reiniciar'),
              onPressed: _reiniciar,
              icon: const Icon(Icons.restart_alt_rounded, size: 18),
              label: const Text('Reiniciar teste'),
            ),
          ],
        ),
        const SizedBox(height: 4),
        const Text(
          'Restaura a visualização original e apaga o estado temporário da simulação.',
          style: TextStyle(
            fontFamily: 'Inter',
            color: AppColors.muted,
            fontSize: 12.5,
          ),
        ),
        const SizedBox(height: 8),
        if (real != null)
          CartaoProgressoResumo(key: const Key('qa-perfil-real'), resumo: real)
        else
          const Text('Progresso real indisponível agora.'),
      ],
    );
  }
}
