import 'package:flutter/material.dart';

import '../services/coordenacao_api.dart';
import '../theme/colors.dart';

class TelaCandidaturasCoord extends StatefulWidget {
  const TelaCandidaturasCoord({
    super.key,
    required this.api,
    required this.programa,
    this.status,
  });

  final CoordenacaoApi api;
  final String? programa;
  final String? status;

  @override
  State<TelaCandidaturasCoord> createState() => _TelaCandidaturasCoordState();
}

class _TelaCandidaturasCoordState extends State<TelaCandidaturasCoord> {
  List<Map<String, dynamic>> _itens = const [];
  String? _erro;
  bool _carregando = true;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  @override
  void didUpdateWidget(covariant TelaCandidaturasCoord oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.programa != widget.programa || oldWidget.status != widget.status) {
      _carregar();
    }
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _erro = null;
    });
    try {
      final lista = await widget.api.candidaturas(
        programa: widget.programa,
        status: widget.status,
      );
      if (!mounted) return;
      setState(() {
        _itens = lista;
        _carregando = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _erro = e.toString().replaceFirst('Exception: ', '');
        _carregando = false;
      });
    }
  }

  void _detalhe(Map<String, dynamic> item) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${item['nome'] ?? ''}',
                style: const TextStyle(
                  fontFamily: 'Poppins',
                  fontWeight: FontWeight.w800,
                  fontSize: 18,
                ),
              ),
              const SizedBox(height: 8),
              Text('${item['curso'] ?? ''}'),
              Text('E-mail: ${item['usuarioId'] ?? ''}'),
              Text('Status: ${item['statusRotulo'] ?? item['status'] ?? ''}'),
              Text('Programa: ${item['programa'] ?? ''}'),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Fechar'),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final filtro = widget.status;
    return SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Candidaturas',
                  style: TextStyle(
                    fontFamily: 'Poppins',
                    fontWeight: FontWeight.w800,
                    fontSize: 22,
                    color: AppColors.ink,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  [
                    if (widget.programa != null) 'Programa ${widget.programa}',
                    if (filtro != null && filtro.isNotEmpty) 'filtro: $filtro',
                  ].join(' · ').ifEmpty('Candidaturas a padrinho'),
                  style: const TextStyle(color: AppColors.muted, fontSize: 13),
                ),
              ],
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              color: AppColors.primary,
              onRefresh: _carregar,
              child: _carregando
                  ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
                  : _erro != null
                      ? ListView(
                          children: [
                            Padding(
                              padding: const EdgeInsets.all(24),
                              child: Column(
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
                              ),
                            ),
                          ],
                        )
                      : _itens.isEmpty
                          ? ListView(
                              children: const [
                                SizedBox(height: 80),
                                Center(
                                  child: Text(
                                    'Nenhuma candidatura encontrada.',
                                    style: TextStyle(color: AppColors.muted),
                                  ),
                                ),
                              ],
                            )
                          : ListView.separated(
                              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                              itemCount: _itens.length,
                              separatorBuilder: (_, _) => const SizedBox(height: 8),
                              itemBuilder: (context, index) {
                                final item = _itens[index];
                                return Material(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(14),
                                  child: InkWell(
                                    borderRadius: BorderRadius.circular(14),
                                    onTap: () => _detalhe(item),
                                    child: Container(
                                      padding: const EdgeInsets.all(12),
                                      decoration: BoxDecoration(
                                        borderRadius: BorderRadius.circular(14),
                                        border: Border.all(color: AppAccents.cardBorder),
                                      ),
                                      child: Row(
                                        children: [
                                          CircleAvatar(
                                            backgroundColor: const Color(0xFFEBE4FF),
                                            foregroundColor: AppColors.primary,
                                            child: Text(
                                              '${item['iniciais'] ?? '?'}',
                                              style: const TextStyle(
                                                fontWeight: FontWeight.w700,
                                                fontSize: 12,
                                              ),
                                            ),
                                          ),
                                          const SizedBox(width: 12),
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment: CrossAxisAlignment.start,
                                              children: [
                                                Text(
                                                  '${item['nome'] ?? ''}',
                                                  style: const TextStyle(
                                                    fontWeight: FontWeight.w700,
                                                    fontSize: 14,
                                                  ),
                                                ),
                                                Text(
                                                  '${item['curso'] ?? ''}'
                                                  '${item['periodo'] != null ? ' · ${item['periodo']}º período' : ''}',
                                                  style: const TextStyle(
                                                    color: AppColors.muted,
                                                    fontSize: 12,
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                          Container(
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 8,
                                              vertical: 4,
                                            ),
                                            decoration: BoxDecoration(
                                              color: AppColors.lavender,
                                              borderRadius: BorderRadius.circular(20),
                                            ),
                                            child: Text(
                                              '${item['statusRotulo'] ?? item['status'] ?? ''}',
                                              style: const TextStyle(
                                                fontSize: 11,
                                                fontWeight: FontWeight.w700,
                                                color: AppColors.primary,
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                );
                              },
                            ),
            ),
          ),
        ],
      ),
    );
  }
}

extension on String {
  String ifEmpty(String fallback) => isEmpty ? fallback : this;
}
