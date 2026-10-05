import 'package:flutter/material.dart';

import '../services/coordenacao_api.dart';
import '../theme/colors.dart';
import 'componentes_coord.dart';
import 'detalhe_candidatura_coord.dart';

const _papeis = <(String?, String)>[
  (null, 'Todos'),
  ('padrinho', 'Padrinhos'),
  ('apadrinhado', 'Apadrinhados'),
  ('candidato', 'Candidatos'),
];

String rotuloSituacaoCoord(String? situacao) => switch (situacao) {
  'candidatura_pendente' => 'Candidatura nova',
  'candidatura_em_analise' => 'Em análise',
  'candidatura_rejeitada' => 'Rejeitada',
  'padrinho_ativo' => 'Padrinho ativo',
  'apadrinhado_aguardando' => 'Sem vínculo',
  'apadrinhado_ativo' => 'Apadrinhado ativo',
  'concluido' => 'Concluído',
  _ => situacao ?? '',
};

/// Usuários do programa: filtros por papel, busca e "Definir padrinho".
class TelaUsuariosCoord extends StatefulWidget {
  const TelaUsuariosCoord({super.key, required this.api, this.programa});

  final CoordenacaoApi api;
  final String? programa;

  @override
  State<TelaUsuariosCoord> createState() => _TelaUsuariosCoordState();
}

class _TelaUsuariosCoordState extends State<TelaUsuariosCoord> {
  List<Map<String, dynamic>> _itens = const [];
  bool _carregando = true;
  String? _erro;
  String? _papel;
  bool _soSemVinculo = false;
  String _busca = '';

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
      final lista = await widget.api.usuarios(
        programa: widget.programa,
        papel: _papel,
      );
      if (!mounted) return;
      setState(() {
        _itens = lista;
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

  bool _semVinculo(Map<String, dynamic> item) =>
      item['papel'] == 'apadrinhado' && item['grupo'] == null;

  List<Map<String, dynamic>> get _visiveis {
    final termo = _busca.trim().toLowerCase();
    return _itens.where((item) {
      if (_soSemVinculo && !_semVinculo(item)) return false;
      if (termo.isEmpty) return true;
      return [
        item['nome'],
        item['email'],
        item['curso'],
        item['grupo'],
      ].join(' ').toLowerCase().contains(termo);
    }).toList();
  }

  Future<void> _abrir(Map<String, dynamic> item) async {
    final id = idDe(item);
    if (id == null) return;
    if (_semVinculo(item)) {
      final ok = await definirPadrinhoCoord(
        context,
        api: widget.api,
        apadrinhadoId: id,
        nomeApadrinhado: '${item['nome'] ?? ''}',
        programa: widget.programa ?? item['programa'] as String?,
      );
      if (ok && mounted) await _carregar();
      return;
    }
    final alterado = await mostrarDetalheCandidatura(
      context,
      api: widget.api,
      item: item,
      programa: widget.programa,
    );
    if (alterado && mounted) await _carregar();
  }

  @override
  Widget build(BuildContext context) {
    final visiveis = _visiveis;
    return Scaffold(
      backgroundColor: corFundoCoord,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CabecalhoCoord(
              voltar: true,
              titulo: 'Usuários',
              subtitulo:
                  'Participantes do programa${widget.programa == null ? '' : ' ${widget.programa}'}.',
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 6),
              child: TextField(
                onChanged: (valor) => setState(() => _busca = valor),
                decoration: InputDecoration(
                  hintText: 'Buscar por nome, curso ou grupo...',
                  prefixIcon: const Icon(Icons.search),
                  isDense: true,
                  filled: true,
                  fillColor: Colors.white,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  for (final (valor, rotulo) in _papeis)
                    Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: ChoiceChip(
                        label: Text(rotulo),
                        selected: _papel == valor,
                        selectedColor: const Color(0xFFEBE4FF),
                        onSelected: (_) {
                          setState(() => _papel = valor);
                          _carregar();
                        },
                      ),
                    ),
                  FilterChip(
                    label: const Text('Sem vínculo'),
                    selected: _soSemVinculo,
                    selectedColor: const Color(0xFFEBE4FF),
                    onSelected: (valor) =>
                        setState(() => _soSemVinculo = valor),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 6),
            Expanded(
              child: RefreshIndicator(
                color: AppColors.primary,
                onRefresh: _carregar,
                child: _carregando
                    ? const Center(
                        child: CircularProgressIndicator(
                          color: AppColors.primary,
                        ),
                      )
                    : _erro != null
                    ? ListView(
                        padding: const EdgeInsets.all(24),
                        children: [
                          Text(_erro!, textAlign: TextAlign.center),
                          const SizedBox(height: 12),
                          FilledButton(
                            onPressed: _carregar,
                            style: FilledButton.styleFrom(
                              backgroundColor: AppColors.primary,
                            ),
                            child: const Text('Tentar novamente'),
                          ),
                        ],
                      )
                    : visiveis.isEmpty
                    ? ListView(
                        children: const [
                          SizedBox(height: 80),
                          Center(
                            child: Text(
                              'Nenhum usuário encontrado.',
                              style: TextStyle(color: AppColors.muted),
                            ),
                          ),
                        ],
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                        itemCount: visiveis.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 8),
                        itemBuilder: (context, index) {
                          final item = visiveis[index];
                          final semVinculo = _semVinculo(item);
                          return Material(
                            color: Colors.white,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                              side: const BorderSide(
                                color: AppAccents.cardBorder,
                              ),
                            ),
                            child: ListTile(
                              onTap: () => _abrir(item),
                              leading: AvatarCoord(item: item),
                              title: Text(
                                '${item['nome'] ?? ''}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              subtitle: Text(
                                [
                                  rotuloSituacaoCoord(
                                    item['situacao'] as String?,
                                  ),
                                  if (item['grupo'] != null) '${item['grupo']}',
                                  if (item['periodo'] != null)
                                    '${item['periodo']}º período',
                                ].where((t) => t.isNotEmpty).join(' · '),
                              ),
                              trailing: semVinculo
                                  ? const Text(
                                      'Definir padrinho',
                                      style: TextStyle(
                                        color: AppColors.primary,
                                        fontWeight: FontWeight.w700,
                                        fontSize: 12,
                                      ),
                                    )
                                  : const Icon(Icons.chevron_right),
                            ),
                          );
                        },
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
