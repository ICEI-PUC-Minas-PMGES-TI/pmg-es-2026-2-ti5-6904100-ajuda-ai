import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'services/lojinha_api.dart';
import 'sessao_usuario.dart';
import 'tela_resgatar.dart';
import 'theme/colors.dart';

DateTime? _data(Object? valor) =>
    valor is String ? DateTime.tryParse(valor)?.toLocal() : null;

class _ParInfo extends StatelessWidget {
  const _ParInfo({
    required this.icone,
    required this.rotulo,
    required this.valor,
    required this.rotuloDireita,
    required this.valorDireita,
  });

  final IconData icone;
  final String rotulo;
  final String valor;
  final String rotuloDireita;
  final String valorDireita;

  @override
  Widget build(BuildContext context) {
    const estiloRotulo = TextStyle(
      fontFamily: 'Inter',
      color: AppColors.muted,
      fontSize: 13,
    );
    const estiloValor = TextStyle(
      color: AppColors.ink,
      fontSize: 17,
      fontWeight: FontWeight.w800,
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: CoresLojinha.cartao,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icone, color: AppColors.primary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(rotulo, style: estiloRotulo),
                Text(valor, style: estiloValor),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(rotuloDireita, style: estiloRotulo),
              Text(valorDireita, style: estiloValor),
            ],
          ),
        ],
      ),
    );
  }
}

class TelaComprovante extends StatelessWidget {
  const TelaComprovante({super.key, required this.resgate, this.api});

  final Map<String, dynamic> resgate;
  final LojinhaApi? api;

  @override
  Widget build(BuildContext context) {
    final criadoEm = _data(resgate['criadoEm']);
    final codigo = '${resgate['codigo'] ?? resgate['id']}';
    final saldo = resgate['saldoAtual'] ?? resgate['saldoApos'];
    return EstruturaLojinha(
      titulo: 'Comprovante',
      corpo: ListView(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
        children: [
          Center(
            child: Container(
              width: 64,
              height: 64,
              decoration: const BoxDecoration(
                color: AppAccents.successBg,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.check_rounded,
                size: 40,
                color: AppAccents.success,
              ),
            ),
          ),
          const SizedBox(height: 12),
          const Text(
            'Resgate realizado com sucesso!',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: AppColors.ink,
              fontSize: 24,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Seu resgate foi registrado. Veja os detalhes abaixo.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontFamily: 'Inter',
              color: AppColors.ink,
              fontSize: 15,
            ),
          ),
          const SizedBox(height: 20),
          CartaoLojinha(
            cor: CoresLojinha.cartaoForte,
            padding: const EdgeInsets.fromLTRB(24, 16, 12, 16),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Código de resgate',
                        style: TextStyle(
                          fontFamily: 'Inter',
                          color: AppColors.ink,
                          fontSize: 14,
                        ),
                      ),
                      const SizedBox(height: 4),
                      SelectableText(
                        codigo,
                        style: const TextStyle(
                          color: AppColors.ink,
                          fontSize: 32,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Copiar código',
                  onPressed: () async {
                    await Clipboard.setData(ClipboardData(text: codigo));
                    if (!context.mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Código copiado.')),
                    );
                  },
                  icon: const Icon(
                    Icons.copy_rounded,
                    color: AppColors.primary,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          _ParInfo(
            icone: Icons.card_giftcard_rounded,
            rotulo: 'Recompensa',
            valor: '${resgate['nome']}',
            rotuloDireita: 'Custo',
            valorDireita: '${formatarXp(resgate['custoXp'] as int? ?? 0)} XP',
          ),
          const Divider(height: 1, color: CoresLojinha.divisor),
          _ParInfo(
            icone: Icons.event_outlined,
            rotulo: 'Data do resgate',
            valor: criadoEm == null ? '-' : formatarDataHora(criadoEm),
            rotuloDireita: resgate['saldoAtual'] is int
                ? 'Saldo atual'
                : 'Saldo após a troca',
            valorDireita: saldo is int ? '${formatarXp(saldo)} XP' : '-',
          ),
          const SizedBox(height: 8),
          BlocoCondicoes(
            texto: resgate['condicoesRetirada'] as String? ?? '',
            compacto: true,
          ),
          const SizedBox(height: 12),
          const CartaoLojinha(
            padding: EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Row(
              children: [
                Icon(Icons.info_outline_rounded, color: AppColors.primary),
                SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Apresente este código na retirada.',
                    style: TextStyle(
                      fontFamily: 'Inter',
                      color: AppColors.ink,
                      fontSize: 15,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      rodape: api == null
          ? null
          : BotaoLojinha(
              texto: 'Ver meus resgates',
              onPressed: () => Navigator.of(context).pushReplacement(
                MaterialPageRoute(builder: (_) => TelaMeusResgates(api: api!)),
              ),
            ),
    );
  }
}

class TelaMeusResgates extends StatefulWidget {
  const TelaMeusResgates({super.key, required this.api});

  final LojinhaApi api;

  @override
  State<TelaMeusResgates> createState() => _TelaMeusResgatesState();
}

class _TelaMeusResgatesState extends State<TelaMeusResgates> {
  List<Map<String, dynamic>>? _resgates;
  String? _erro;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  Future<void> _carregar() async {
    final token = SessaoUsuario.atual.accessToken;
    if (token == null) {
      setState(() => _erro = 'Entre na sua conta para ver seus resgates.');
      return;
    }
    setState(() {
      _erro = null;
      _resgates = null;
    });
    try {
      final lista = await widget.api.historico(token);
      if (mounted) setState(() => _resgates = lista);
    } catch (erro) {
      if (mounted) setState(() => _erro = mensagemErroLojinha(erro));
    }
  }

  @override
  Widget build(BuildContext context) {
    final Widget corpo;
    if (_erro != null) {
      corpo = ListView(
        padding: const EdgeInsets.all(20),
        children: [EstadoErro(mensagem: _erro!, onTentar: _carregar)],
      );
    } else if (_resgates == null) {
      corpo = const Center(child: CircularProgressIndicator());
    } else if (_resgates!.isEmpty) {
      corpo = const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'Você ainda não resgatou nenhum item.',
            textAlign: TextAlign.center,
            style: TextStyle(fontFamily: 'Inter', color: AppColors.muted),
          ),
        ),
      );
    } else {
      corpo = RefreshIndicator(
        onRefresh: _carregar,
        child: ListView.separated(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
          itemCount: _resgates!.length,
          separatorBuilder: (_, _) => const SizedBox(height: 14),
          itemBuilder: (context, i) => _CartaoResgate(resgate: _resgates![i]),
        ),
      );
    }
    return EstruturaLojinha(titulo: 'Meus resgates', corpo: corpo);
  }
}

class _CartaoResgate extends StatelessWidget {
  const _CartaoResgate({required this.resgate});

  final Map<String, dynamic> resgate;

  @override
  Widget build(BuildContext context) {
    final data = _data(resgate['criadoEm']);
    return CartaoLojinha(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => TelaComprovante(resgate: resgate)),
      ),
      padding: const EdgeInsets.fromLTRB(10, 10, 12, 10),
      child: Row(
        children: [
          ImagemRecompensa(url: resgate['imagemUrl'] as String?, largura: 96),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${resgate['nome']}',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.ink,
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Código: ${resgate['codigo'] ?? ''}',
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.ink,
                    fontSize: 14,
                  ),
                ),
                if (data != null)
                  Text(
                    formatarDataHora(data),
                    style: const TextStyle(
                      fontFamily: 'Inter',
                      color: AppColors.ink,
                      fontSize: 14,
                    ),
                  ),
              ],
            ),
          ),
          Text(
            '${formatarXp(resgate['custoXp'] as int? ?? 0)} XP',
            style: const TextStyle(
              color: AppColors.primary,
              fontSize: 16,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(width: 4),
          const Icon(Icons.chevron_right_rounded, color: AppColors.ink),
        ],
      ),
    );
  }
}

class TelaExtratoXp extends StatefulWidget {
  const TelaExtratoXp({super.key, required this.api});

  final LojinhaApi api;

  @override
  State<TelaExtratoXp> createState() => _TelaExtratoXpState();
}

class _TelaExtratoXpState extends State<TelaExtratoXp> {
  static const _pagina = 30;
  final List<Map<String, dynamic>> _itens = [];
  bool _carregando = false;
  bool _fim = false;
  String? _erro;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  Future<void> _carregar() async {
    if (_carregando || _fim) return;
    final token = SessaoUsuario.atual.accessToken;
    if (token == null) {
      setState(() => _erro = 'Entre na sua conta para ver o extrato.');
      return;
    }
    setState(() {
      _carregando = true;
      _erro = null;
    });
    try {
      final novos = await widget.api.extrato(
        token,
        limite: _pagina,
        antes: _itens.isEmpty ? null : '${_itens.last['id']}',
      );
      if (!mounted) return;
      setState(() {
        _itens.addAll(novos);
        _fim = novos.length < _pagina;
        _carregando = false;
      });
    } catch (erro) {
      if (!mounted) return;
      setState(() {
        _erro = mensagemErroLojinha(erro);
        _carregando = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final saldo = _itens.isNotEmpty
        ? _itens.first['saldoApos'] as int? ?? 0
        : SessaoUsuario.atual.xp.value ?? 0;
    return EstruturaLojinha(
      titulo: 'Extrato de XP',
      corpo: ListView(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
        children: [
          CartaoSaldo(saldoXp: saldo, rotulo: 'Saldo atual'),
          const SizedBox(height: 20),
          const Text(
            'Movimentações',
            style: TextStyle(
              color: AppColors.ink,
              fontSize: 20,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 12),
          if (_itens.isEmpty && !_carregando && _erro == null)
            const Padding(
              padding: EdgeInsets.all(24),
              child: Text(
                'Nenhuma movimentação de XP ainda.',
                textAlign: TextAlign.center,
                style: TextStyle(fontFamily: 'Inter', color: AppColors.muted),
              ),
            ),
          for (final m in _itens) ...[
            _LinhaExtrato(movimentacao: m),
            const SizedBox(height: 10),
          ],
          if (_erro != null) EstadoErro(mensagem: _erro!, onTentar: _carregar),
          if (_carregando)
            const Padding(
              padding: EdgeInsets.all(16),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (!_fim && _erro == null && _itens.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: BotaoLojinha(
                texto: 'Carregar mais',
                icone: Icons.expand_more_rounded,
                onPressed: _carregar,
              ),
            ),
        ],
      ),
    );
  }
}

class _LinhaExtrato extends StatelessWidget {
  const _LinhaExtrato({required this.movimentacao});

  final Map<String, dynamic> movimentacao;

  @override
  Widget build(BuildContext context) {
    final quantidade = movimentacao['quantidade'] as int? ?? 0;
    final data = _data(movimentacao['criadoEm']);
    final credito = quantidade > 0;
    final referencia = movimentacao['referencia'];
    final resgate = referencia is Map && referencia['tipo'] == 'RESGATE';
    return CartaoLojinha(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          Icon(
            resgate
                ? Icons.card_giftcard_rounded
                : credito
                ? Icons.check_box_outlined
                : Icons.remove_circle_outline,
            color: AppColors.primary,
            size: 28,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${movimentacao['descricao'] ?? ''}',
                  style: const TextStyle(
                    color: AppColors.ink,
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                if (data != null)
                  Text(
                    formatarDataHora(data),
                    style: const TextStyle(
                      fontFamily: 'Inter',
                      color: AppColors.ink,
                      fontSize: 13,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${credito ? '+' : ''}${formatarXp(quantidade)} XP',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                  color: credito ? AppAccents.success : CoresLojinha.perigo,
                ),
              ),
              Text(
                'Saldo: ${formatarXp(movimentacao['saldoApos'] as int? ?? 0)} XP',
                style: const TextStyle(
                  fontFamily: 'Inter',
                  color: AppColors.ink,
                  fontSize: 13,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
