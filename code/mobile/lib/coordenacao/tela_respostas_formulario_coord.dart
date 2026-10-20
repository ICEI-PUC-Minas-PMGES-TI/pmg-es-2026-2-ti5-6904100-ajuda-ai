import 'package:flutter/material.dart';

import '../services/coordenacao_api.dart';
import '../theme/colors.dart';
import '../widgets/perguntas_adicionais.dart';
import 'componentes_coord.dart';

/// Consulta de respostas — por aluno ou por pergunta (paridade com a web).
class TelaRespostasFormularioCoord extends StatefulWidget {
  const TelaRespostasFormularioCoord({
    super.key,
    required this.api,
    required this.tipo,
    this.programa,
  });

  final CoordenacaoApi api;
  final String tipo;
  final String? programa;

  @override
  State<TelaRespostasFormularioCoord> createState() =>
      _TelaRespostasFormularioCoordState();
}

class _TelaRespostasFormularioCoordState
    extends State<TelaRespostasFormularioCoord>
    with SingleTickerProviderStateMixin {
  late final TabController _abas;
  Map<String, dynamic>? _porAluno;
  Map<String, dynamic>? _porPergunta;
  bool _carregando = true;
  String? _erro;

  String get _rotulo =>
      widget.tipo == 'padrinho' ? 'Padrinhos' : 'Apadrinhados';

  @override
  void initState() {
    super.initState();
    _abas = TabController(length: 2, vsync: this);
    _carregar();
  }

  @override
  void dispose() {
    _abas.dispose();
    super.dispose();
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _erro = null;
    });
    try {
      final resultados = await Future.wait([
        widget.api.respostasFormulario(
          widget.tipo,
          programa: widget.programa,
        ),
        widget.api.respostasPorPergunta(
          widget.tipo,
          programa: widget.programa,
        ),
      ]);
      if (!mounted) return;
      setState(() {
        _porAluno = resultados[0];
        _porPergunta = resultados[1];
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
    final meta = _porAluno ?? _porPergunta;
    return Scaffold(
      backgroundColor: corFundoCoord,
      body: SafeArea(
        child: Column(
          children: [
            CabecalhoCoord(
              voltar: true,
              titulo: 'Respostas: $_rotulo',
              subtitulo: meta == null
                  ? 'Consulte o que os alunos responderam.'
                  : 'Programa ${meta['programa']} · versão atual '
                        '${meta['versaoAtual'] ?? '—'} · '
                        '${meta['total'] ?? 0} envio(s)',
            ),
            TabBar(
              controller: _abas,
              labelColor: AppColors.primary,
              indicatorColor: AppColors.primary,
              tabs: const [
                Tab(text: 'Por aluno'),
                Tab(text: 'Por pergunta'),
              ],
            ),
            Expanded(
              child: _carregando
                  ? const Center(
                      child: CircularProgressIndicator(
                        color: AppColors.primary,
                      ),
                    )
                  : _erro != null
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(_erro!, textAlign: TextAlign.center),
                            const SizedBox(height: 12),
                            FilledButton(
                              onPressed: _carregar,
                              child: const Text('Tentar novamente'),
                            ),
                          ],
                        ),
                      ),
                    )
                  : TabBarView(
                      controller: _abas,
                      children: [
                        _ListaAlunos(dados: _porAluno!),
                        _ListaPerguntas(dados: _porPergunta!),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ListaAlunos extends StatelessWidget {
  const _ListaAlunos({required this.dados});
  final Map<String, dynamic> dados;

  @override
  Widget build(BuildContext context) {
    final envios = (dados['envios'] as List? ?? const [])
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
    if (envios.isEmpty) {
      return const Center(child: Text('Nenhuma resposta enviada ainda.'));
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      itemCount: envios.length,
      separatorBuilder: (_, _) => const SizedBox(height: 10),
      itemBuilder: (context, i) {
        final envio = envios[i];
        final respostas = (envio['respostas'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
        return Material(
          color: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: const BorderSide(color: AppAccents.cardBorder),
          ),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${envio['nome'] ?? 'Aluno'}',
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                Text(
                  '${envio['email'] ?? ''} · versão ${envio['versao'] ?? '—'}',
                  style: const TextStyle(
                    fontSize: 12,
                    color: corTextoSecundarioCoord,
                  ),
                ),
                const SizedBox(height: 8),
                if (respostas.isEmpty)
                  const Text(
                    'Este envio não tem perguntas adicionais.',
                    style: TextStyle(
                      fontSize: 13,
                      color: corTextoSecundarioCoord,
                    ),
                  )
                else
                  for (final r in respostas) ...[
                    Text(
                      '${r['enunciado'] ?? r['perguntaId']}',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppColors.primary,
                      ),
                    ),
                    Text(
                      r['resposta'] == null
                          ? 'Sem resposta'
                          : PerguntasAdicionais.formatar(r['resposta']),
                      style: TextStyle(
                        fontSize: 13,
                        fontStyle: r['resposta'] == null
                            ? FontStyle.italic
                            : FontStyle.normal,
                        color: r['resposta'] == null
                            ? corTextoSecundarioCoord
                            : AppColors.ink,
                      ),
                    ),
                    const SizedBox(height: 6),
                  ],
              ],
            ),
          ),
        );
      },
    );
  }
}

class _ListaPerguntas extends StatelessWidget {
  const _ListaPerguntas({required this.dados});
  final Map<String, dynamic> dados;

  @override
  Widget build(BuildContext context) {
    final perguntas = (dados['perguntas'] as List? ?? const [])
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
    if (perguntas.isEmpty) {
      return const Center(child: Text('Nenhuma pergunta com respostas.'));
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      itemCount: perguntas.length,
      separatorBuilder: (_, _) => const SizedBox(height: 10),
      itemBuilder: (context, i) {
        final p = perguntas[i];
        final contagemRaw = p['contagem'];
        final contagem = contagemRaw is Map
            ? contagemRaw.entries
                  .map((e) => MapEntry('${e.key}', (e.value as num?)?.toInt() ?? 0))
                  .toList()
            : <MapEntry<String, int>>[];
        contagem.sort((a, b) => b.value.compareTo(a.value));
        final respostas = (p['respostas'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
        final total = (p['total'] as num?)?.toInt() ?? 0;
        return Material(
          color: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: const BorderSide(color: AppAccents.cardBorder),
          ),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${p['enunciado'] ?? p['perguntaId']}',
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                Text(
                  '$total resposta(s)',
                  style: const TextStyle(
                    fontSize: 12,
                    color: corTextoSecundarioCoord,
                  ),
                ),
                if (contagem.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  for (final item in contagem)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Row(
                        children: [
                          Expanded(child: Text(item.key)),
                          Text(
                            '${item.value}',
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ],
                      ),
                    ),
                ] else
                  for (final r in respostas)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(
                        '${r['nome']}: ${PerguntasAdicionais.formatar(r['resposta'])}',
                        style: const TextStyle(fontSize: 13),
                      ),
                    ),
              ],
            ),
          ),
        );
      },
    );
  }
}
