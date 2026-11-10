import 'package:flutter/material.dart';

import 'services/api_config.dart';
import 'services/lojinha_api.dart';
import 'sessao_usuario.dart';
import 'tela_resgates.dart';
import 'theme/colors.dart';

abstract final class CoresLojinha {
  static const Color cartao = Color(0xFFF3EFFC);
  static const Color cartaoForte = Color(0xFFEDE6FB);
  static const Color divisor = Color(0xFFE2DAF5);
  static const Color perigo = Color(0xFFDC2626);
  static const Color perigoFundo = Color(0xFFFDE2E2);
}

class ItemResgate {
  const ItemResgate({
    required this.id,
    required this.nome,
    required this.descricao,
    required this.custoXp,
    this.versao = 1,
    this.estoque,
    this.condicoesRetirada = '',
    this.imagemUrl,
    this.limitePorAluno,
    this.resgatesDoAluno = 0,
    this.disponivelAte,
    this.motivoIndisponivel,
  });

  final Object id;
  final String nome;
  final String descricao;
  final int custoXp;

  /// Versão da recompensa exibida; o resgate é recusado se ela mudar.
  final int versao;
  final int? estoque;
  final String condicoesRetirada;
  final String? imagemUrl;
  final int? limitePorAluno;
  final int resgatesDoAluno;
  final DateTime? disponivelAte;
  final String? motivoIndisponivel;

  factory ItemResgate.fromJson(Map<String, dynamic> json) => ItemResgate(
    id: json['id'] as String,
    nome: json['nome'] as String,
    descricao: json['descricao'] as String,
    custoXp: json['custoXp'] as int,
    versao: json['versao'] as int? ?? 1,
    estoque: json['estoque'] as int?,
    condicoesRetirada: json['condicoesRetirada'] as String? ?? '',
    imagemUrl: json['imagemUrl'] as String?,
    limitePorAluno: json['limitePorAluno'] as int?,
    resgatesDoAluno: json['resgatesFeitos'] as int? ?? 0,
    disponivelAte: json['disponivelAte'] == null
        ? null
        : DateTime.tryParse(json['disponivelAte'] as String)?.toLocal(),
    motivoIndisponivel: json['motivoIndisponivel'] as String?,
  );

  bool get esgotado => estoque != null && estoque! <= 0;
  bool get limiteAtingido =>
      limitePorAluno != null && resgatesDoAluno >= limitePorAluno!;

  String? motivo(int saldo) {
    if (esgotado || motivoIndisponivel == 'esgotada') return 'esgotada';
    if (limiteAtingido || motivoIndisponivel == 'limite') return 'limite';
    if (custoXp > saldo) return 'saldo';
    return null;
  }

  bool podeResgatar(int saldo) => motivo(saldo) == null;

  String status(int saldo) => switch (motivo(saldo)) {
    'esgotada' => 'Esgotado',
    'limite' => 'Limite atingido',
    'saldo' => 'Faltam ${formatarXp(custoXp - saldo)} XP',
    _ => estoque == null ? 'Estoque ilimitado' : '$estoque em estoque',
  };

  String get textoEstoque => estoque == null
      ? 'Ilimitado'
      : '$estoque ${estoque == 1 ? 'unidade' : 'unidades'}';
}

String formatarXp(int valor) {
  final texto = valor.abs().toString().replaceAllMapped(
    RegExp(r'(\d)(?=(\d{3})+$)'),
    (encontrado) => '${encontrado[1]}.',
  );
  return valor < 0 ? '-$texto' : texto;
}

String formatarDataHora(DateTime data) {
  final d = data.toLocal();
  String dois(int n) => n.toString().padLeft(2, '0');
  return '${dois(d.day)}/${dois(d.month)}/${d.year} ${dois(d.hour)}:${dois(d.minute)}';
}

String mensagemErroLojinha(Object erro) {
  if (erro is ApiException) {
    if (erro.statusCode == 401) return 'Sua sessão expirou. Entre novamente.';
    if (erro.statusCode == 403) {
      return 'A lojinha está disponível só para participantes do programa.';
    }
  }
  return '$erro';
}

class EstruturaLojinha extends StatelessWidget {
  const EstruturaLojinha({
    super.key,
    required this.titulo,
    this.subtitulo,
    required this.corpo,
    this.rodape,
  });

  final String titulo;
  final String? subtitulo;
  final Widget corpo;
  final Widget? rodape;

  @override
  Widget build(BuildContext context) {
    final podeVoltar = Navigator.of(context).canPop();
    return Scaffold(
      backgroundColor: AppColors.primary,
      body: Column(
        children: [
          Container(
            width: double.infinity,
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [AppAccents.headerTop, AppColors.primary],
              ),
            ),
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(8, 4, 20, 36),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      height: 44,
                      child: podeVoltar
                          ? const BackButton(color: Colors.white)
                          : null,
                    ),
                    Padding(
                      padding: const EdgeInsets.only(left: 12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            titulo,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 26,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.3,
                            ),
                          ),
                          if (subtitulo != null) ...[
                            const SizedBox(height: 6),
                            Text(
                              subtitulo!,
                              style: const TextStyle(
                                fontFamily: 'Inter',
                                color: Color(0xFFE4DAF7),
                                fontSize: 14,
                                height: 1.35,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          Expanded(
            child: Transform.translate(
              offset: const Offset(0, -20),
              child: Container(
                width: double.infinity,
                decoration: const BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
                ),
                clipBehavior: Clip.antiAlias,
                child: Column(
                  children: [
                    Expanded(child: corpo),
                    if (rodape != null)
                      SafeArea(
                        top: false,
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
                          child: rodape,
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class CartaoLojinha extends StatelessWidget {
  const CartaoLojinha({
    super.key,
    required this.child,
    this.onTap,
    this.padding = const EdgeInsets.all(16),
    this.cor = CoresLojinha.cartao,
  });

  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsets padding;
  final Color cor;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: cor,
      borderRadius: BorderRadius.circular(18),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(padding: padding, child: child),
      ),
    );
  }
}

class SeloSituacao extends StatelessWidget {
  const SeloSituacao({super.key, required this.item, required this.saldo});

  final ItemResgate item;
  final int saldo;

  @override
  Widget build(BuildContext context) {
    final disponivel = item.podeResgatar(saldo);
    return Text(
      item.status(saldo),
      style: TextStyle(
        fontFamily: 'Inter',
        color: disponivel ? AppColors.muted : CoresLojinha.perigo,
        fontSize: 13,
        fontWeight: disponivel ? FontWeight.w500 : FontWeight.w600,
      ),
    );
  }
}

class ImagemRecompensa extends StatelessWidget {
  const ImagemRecompensa({
    super.key,
    required this.url,
    this.largura = 96,
    this.altura,
    this.raio = 14,
  });

  final String? url;
  final double largura;
  final double? altura;
  final double raio;

  @override
  Widget build(BuildContext context) {
    final h = altura ?? largura;
    final menor = h < largura ? h : largura;
    final reserva = Container(
      width: largura,
      height: h,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: CoresLojinha.cartaoForte,
        borderRadius: BorderRadius.circular(raio),
      ),
      child: Icon(
        Icons.card_giftcard_rounded,
        size: menor * 0.42,
        color: AppColors.primary,
      ),
    );
    if (url == null) return reserva;
    return ClipRRect(
      borderRadius: BorderRadius.circular(raio),
      child: Image.network(
        url!,
        width: largura,
        height: h,
        fit: BoxFit.cover,
        filterQuality: FilterQuality.medium,
        webHtmlElementStrategy: WebHtmlElementStrategy.fallback,
        errorBuilder: (_, _, _) => reserva,
      ),
    );
  }
}

class EstadoErro extends StatelessWidget {
  const EstadoErro({super.key, required this.mensagem, this.onTentar});

  final String mensagem;
  final VoidCallback? onTentar;

  @override
  Widget build(BuildContext context) {
    return CartaoLojinha(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          const Icon(Icons.error_outline_rounded, color: AppColors.primary),
          const SizedBox(height: 8),
          Text(
            mensagem,
            textAlign: TextAlign.center,
            style: const TextStyle(fontFamily: 'Inter', color: AppColors.ink),
          ),
          if (onTentar != null)
            TextButton(
              onPressed: onTentar,
              child: const Text('Tentar novamente'),
            ),
        ],
      ),
    );
  }
}

class BlocoCondicoes extends StatelessWidget {
  const BlocoCondicoes({super.key, required this.texto, this.compacto = false});

  final String texto;
  final bool compacto;

  @override
  Widget build(BuildContext context) {
    final linhas = texto
        .split('\n')
        .map((l) => l.trim())
        .where((l) => l.isNotEmpty)
        .toList();
    final estiloTexto = TextStyle(
      fontFamily: 'Inter',
      color: AppColors.ink,
      fontSize: compacto ? 15 : 14,
      fontWeight: compacto ? FontWeight.w700 : FontWeight.w400,
      height: 1.4,
    );
    return CartaoLojinha(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.only(top: 1),
            child: Icon(
              Icons.place_outlined,
              color: AppColors.primary,
              size: 24,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Condições de retirada',
                  style: compacto
                      ? const TextStyle(
                          fontFamily: 'Inter',
                          color: AppColors.muted,
                          fontSize: 13,
                        )
                      : const TextStyle(
                          color: AppColors.ink,
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                        ),
                ),
                SizedBox(height: compacto ? 2 : 6),
                if (linhas.isEmpty)
                  Text('Consulte a coordenação.', style: estiloTexto)
                else
                  for (final linha in linhas)
                    Text(
                      linhas.length > 1 ? '•  $linha' : linha,
                      style: estiloTexto,
                    ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class BotaoLojinha extends StatelessWidget {
  const BotaoLojinha({
    super.key,
    required this.texto,
    required this.onPressed,
    this.contorno = false,
    this.icone,
  });

  final String texto;
  final VoidCallback? onPressed;
  final bool contorno;
  final IconData? icone;

  @override
  Widget build(BuildContext context) {
    final forma = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(14),
    );
    final conteudo = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          texto,
          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
        ),
        if (icone != null) ...[const SizedBox(width: 8), Icon(icone, size: 20)],
      ],
    );
    if (contorno) {
      return OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.primary,
          minimumSize: const Size.fromHeight(54),
          side: const BorderSide(color: AppColors.primary, width: 1.5),
          shape: forma,
        ),
        child: conteudo,
      );
    }
    return FilledButton(
      onPressed: onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.primary,
        disabledBackgroundColor: const Color(0xFFD9D2EA),
        minimumSize: const Size.fromHeight(54),
        shape: forma,
      ),
      child: conteudo,
    );
  }
}

class LinhaMenuLojinha extends StatelessWidget {
  const LinhaMenuLojinha({
    super.key,
    required this.icone,
    required this.texto,
    required this.onTap,
  });

  final IconData icone;
  final String texto;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return CartaoLojinha(
      onTap: onTap,
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
      child: Row(
        children: [
          Icon(icone, color: AppColors.primary),
          const SizedBox(width: 14),
          Expanded(
            child: Text(
              texto,
              style: const TextStyle(
                color: AppColors.ink,
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const Icon(Icons.chevron_right_rounded, color: AppColors.ink),
        ],
      ),
    );
  }
}

class CartaoSaldo extends StatelessWidget {
  const CartaoSaldo({
    super.key,
    required this.saldoXp,
    this.rotulo = 'Saldo disponível',
  });

  final int saldoXp;
  final String rotulo;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppAccents.headerTop, AppAccents.headerBottom],
        ),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: [
          const Icon(Icons.star_rounded, size: 34, color: AppAccents.star),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  rotulo,
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    color: Color(0xFFD9CCEC),
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${formatarXp(saldoXp)} XP',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class ResgatarPage extends StatefulWidget {
  const ResgatarPage({super.key, required this.saldoXp, this.itens, this.api});

  final int saldoXp;
  final List<ItemResgate>? itens;
  final LojinhaApi? api;

  @override
  State<ResgatarPage> createState() => _ResgatarPageState();
}

class _ResgatarPageState extends State<ResgatarPage> {
  late final LojinhaApi _api = widget.api ?? LojinhaApi();
  List<ItemResgate> _itens = const [];
  bool _carregando = false;
  String? _erro;
  late int _saldoXp = widget.saldoXp;

  @override
  void initState() {
    super.initState();
    _itens = widget.itens ?? const [];
    if (widget.itens == null && SessaoUsuario.atual.accessToken != null) {
      _carregar();
    }
  }

  Future<void> _carregar() async {
    final token = SessaoUsuario.atual.accessToken;
    if (token == null) return;
    setState(() {
      _carregando = true;
      _erro = null;
    });
    try {
      final corpo = await _api.listar(token);
      if (!mounted || SessaoUsuario.atual.accessToken != token) return;
      final saldo = corpo['saldo'] as int;
      SessaoUsuario.atual.xp.value = saldo;
      setState(() {
        _saldoXp = saldo;
        _itens = (corpo['recompensas'] as List)
            .map(
              (e) => ItemResgate.fromJson(Map<String, dynamic>.from(e as Map)),
            )
            .toList();
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

  Future<void> _detalhe(ItemResgate item) async {
    final resgate = await Navigator.of(context).push<Map<String, dynamic>>(
      MaterialPageRoute(
        builder: (_) =>
            TelaDetalheRecompensa(item: item, saldoXp: _saldoXp, api: _api),
      ),
    );
    if (!mounted || resgate == null) return;
    final saldo = resgate['saldoAtual'];
    if (saldo is int) setState(() => _saldoXp = saldo);
    await _carregar();
  }

  void _ir(Widget tela) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => tela));

  @override
  Widget build(BuildContext context) {
    return EstruturaLojinha(
      titulo: 'Lojinha',
      subtitulo: 'Troque seus XP por itens exclusivos do Ajuda-aí.',
      corpo: RefreshIndicator(
        onRefresh: _carregar,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
          children: [
            CartaoSaldo(saldoXp: _saldoXp),
            const SizedBox(height: 24),
            const Text(
              'Itens disponíveis',
              style: TextStyle(
                color: AppColors.ink,
                fontSize: 20,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 12),
            if (_carregando)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_erro != null)
              EstadoErro(mensagem: _erro!, onTentar: _carregar)
            else if (_itens.isEmpty)
              const _SemItens()
            else
              for (final item in _itens) ...[
                _CardItem(item: item, saldoXp: _saldoXp, onAbrir: _detalhe),
                const SizedBox(height: 12),
              ],
            const SizedBox(height: 12),
            LinhaMenuLojinha(
              icone: Icons.inventory_2_outlined,
              texto: 'Meus resgates',
              onTap: () => _ir(TelaMeusResgates(api: _api)),
            ),
            const SizedBox(height: 12),
            LinhaMenuLojinha(
              icone: Icons.receipt_long_outlined,
              texto: 'Extrato de XP',
              onTap: () => _ir(TelaExtratoXp(api: _api)),
            ),
          ],
        ),
      ),
    );
  }
}

class _SemItens extends StatelessWidget {
  const _SemItens();

  @override
  Widget build(BuildContext context) {
    return const CartaoLojinha(
      padding: EdgeInsets.symmetric(horizontal: 20, vertical: 28),
      child: Column(
        children: [
          Icon(Icons.card_giftcard_rounded, size: 36, color: AppColors.primary),
          SizedBox(height: 12),
          Text(
            'Nenhum item disponível ainda',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: AppColors.ink,
              fontSize: 16,
              fontWeight: FontWeight.w800,
            ),
          ),
          SizedBox(height: 6),
          Text(
            'A coordenação vai cadastrar os itens em breve. Continue acumulando XP!',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontFamily: 'Inter',
              color: AppColors.muted,
              fontSize: 13,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }
}

class _CardItem extends StatelessWidget {
  const _CardItem({
    required this.item,
    required this.saldoXp,
    required this.onAbrir,
  });

  final ItemResgate item;
  final int saldoXp;
  final void Function(ItemResgate) onAbrir;

  @override
  Widget build(BuildContext context) {
    return CartaoLojinha(
      onTap: () => onAbrir(item),
      padding: const EdgeInsets.fromLTRB(10, 10, 12, 10),
      child: Row(
        children: [
          ImagemRecompensa(url: item.imagemUrl, largura: 104, altura: 96),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.nome,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.ink,
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${formatarXp(item.custoXp)} XP',
                  style: const TextStyle(
                    color: AppColors.primary,
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 6),
                SeloSituacao(item: item, saldo: saldoXp),
              ],
            ),
          ),
          const Icon(Icons.chevron_right_rounded, color: AppColors.ink),
        ],
      ),
    );
  }
}

class _Indicador extends StatelessWidget {
  const _Indicador({
    required this.icone,
    required this.rotulo,
    required this.valor,
    this.destaque = false,
  });

  final IconData icone;
  final String rotulo;
  final String valor;
  final bool destaque;

  @override
  Widget build(BuildContext context) {
    return CartaoLojinha(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          Icon(icone, color: AppColors.primary, size: 28),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  rotulo,
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.ink,
                    fontSize: 13,
                  ),
                ),
                Text(
                  valor,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: destaque ? AppColors.primary : AppColors.ink,
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class TelaDetalheRecompensa extends StatelessWidget {
  const TelaDetalheRecompensa({
    super.key,
    required this.item,
    required this.saldoXp,
    required this.api,
  });

  final ItemResgate item;
  final int saldoXp;
  final LojinhaApi api;

  Future<void> _revisar(BuildContext context) async {
    final navegador = Navigator.of(context);
    final resgate = await navegador.push<Map<String, dynamic>>(
      MaterialPageRoute(
        builder: (_) =>
            TelaRevisaoResgate(item: item, saldoXp: saldoXp, api: api),
      ),
    );
    if (resgate == null) return;
    navegador.pushReplacement(
      MaterialPageRoute(
        builder: (_) => TelaComprovante(
          resgate: {'imagemUrl': item.imagemUrl, ...resgate},
          api: api,
        ),
      ),
      result: resgate,
    );
  }

  @override
  Widget build(BuildContext context) {
    final disponivel = item.podeResgatar(saldoXp);
    final indicadores = <Widget>[
      _Indicador(
        icone: Icons.toll_outlined,
        rotulo: 'Custo',
        valor: '${formatarXp(item.custoXp)} XP',
        destaque: true,
      ),
      _Indicador(
        icone: Icons.inventory_2_outlined,
        rotulo: 'Estoque',
        valor: item.textoEstoque,
      ),
      if (item.limitePorAluno != null)
        _Indicador(
          icone: Icons.person_outline_rounded,
          rotulo: 'Seus resgates',
          valor: '${item.resgatesDoAluno} de ${item.limitePorAluno}',
        ),
      if (item.disponivelAte != null)
        _Indicador(
          icone: Icons.event_outlined,
          rotulo: 'Disponível até',
          valor: formatarDataHora(item.disponivelAte!).substring(0, 10),
        ),
    ];
    return EstruturaLojinha(
      titulo: 'Detalhe da recompensa',
      corpo: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
        children: [
          Container(
            height: 220,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: CoresLojinha.cartao,
              borderRadius: BorderRadius.circular(18),
            ),
            child: ImagemRecompensa(
              url: item.imagemUrl,
              largura: 188,
              raio: 16,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            item.nome,
            style: const TextStyle(
              color: AppColors.ink,
              fontSize: 26,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.3,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            item.descricao,
            style: const TextStyle(
              fontFamily: 'Inter',
              color: AppColors.ink,
              fontSize: 15,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 16),
          LayoutBuilder(
            builder: (context, c) {
              final largura = (c.maxWidth - 12) / 2;
              return Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  for (final i in indicadores)
                    SizedBox(width: largura, child: i),
                ],
              );
            },
          ),
          const SizedBox(height: 12),
          BlocoCondicoes(texto: item.condicoesRetirada),
          if (!disponivel) ...[
            const SizedBox(height: 14),
            Center(
              child: SeloSituacao(item: item, saldo: saldoXp),
            ),
          ],
        ],
      ),
      rodape: BotaoLojinha(
        texto: 'Resgatar',
        onPressed: disponivel ? () => _revisar(context) : null,
      ),
    );
  }
}

class TelaRevisaoResgate extends StatefulWidget {
  const TelaRevisaoResgate({
    super.key,
    required this.item,
    required this.saldoXp,
    required this.api,
  });

  final ItemResgate item;
  final int saldoXp;
  final LojinhaApi api;

  @override
  State<TelaRevisaoResgate> createState() => _TelaRevisaoResgateState();
}

class _TelaRevisaoResgateState extends State<TelaRevisaoResgate> {
  final String _chave = LojinhaApi.novaChave();
  bool _enviando = false;
  String? _erro;

  Future<void> _confirmar() async {
    if (_enviando) return;
    final token = SessaoUsuario.atual.accessToken;
    if (token == null) {
      setState(() => _erro = 'Entre na sua conta para resgatar.');
      return;
    }
    setState(() {
      _enviando = true;
      _erro = null;
    });
    try {
      final resgate = await widget.api.resgatar(
        token,
        widget.item.id.toString(),
        _chave,
        versao: widget.item.versao,
        custoXp: widget.item.custoXp,
      );
      if (!mounted || SessaoUsuario.atual.accessToken != token) return;
      final saldo = resgate['saldoAtual'];
      if (saldo is int) SessaoUsuario.atual.xp.value = saldo;
      Navigator.of(context).pop(resgate);
    } catch (erro) {
      if (!mounted) return;
      setState(() {
        _enviando = false;
        _erro = mensagemErroLojinha(erro);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final depois = widget.saldoXp - item.custoXp;
    return PopScope(
      canPop: !_enviando,
      child: EstruturaLojinha(
        titulo: 'Revisar resgate',
        subtitulo: 'Confira os dados da troca antes de confirmar.',
        corpo: ListView(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
          children: [
            CartaoLojinha(
              padding: const EdgeInsets.all(10),
              child: Row(
                children: [
                  ImagemRecompensa(url: item.imagemUrl, largura: 100),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.nome,
                          style: const TextStyle(
                            color: AppColors.ink,
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          item.descricao,
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontFamily: 'Inter',
                            color: AppColors.ink,
                            fontSize: 13,
                            height: 1.35,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            CartaoLojinha(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Column(
                children: [
                  _LinhaValor(
                    icone: Icons.toll_outlined,
                    rotulo: 'Custo do resgate',
                    valor: '${formatarXp(item.custoXp)} XP',
                  ),
                  const Divider(height: 1, color: CoresLojinha.divisor),
                  _LinhaValor(
                    icone: Icons.account_balance_wallet_outlined,
                    rotulo: 'Seu saldo atual',
                    valor: '${formatarXp(widget.saldoXp)} XP',
                  ),
                  const Divider(height: 1, color: CoresLojinha.divisor),
                  _LinhaValor(
                    icone: Icons.savings_outlined,
                    rotulo: 'Seu saldo após a troca',
                    valor: '${formatarXp(depois)} XP',
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            BlocoCondicoes(texto: item.condicoesRetirada),
            const SizedBox(height: 12),
            const Text(
              'O XP é debitado na confirmação e a troca não pode ser desfeita pelo app.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontFamily: 'Inter',
                color: AppColors.muted,
                fontSize: 12,
              ),
            ),
            if (_erro != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: CoresLojinha.perigoFundo,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  _erro!,
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    color: Color(0xFFB91C1C),
                  ),
                ),
              ),
            ],
          ],
        ),
        rodape: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            BotaoLojinha(
              texto: _enviando ? 'Confirmando…' : 'Confirmar resgate',
              onPressed: _enviando || depois < 0 ? null : _confirmar,
            ),
            const SizedBox(height: 12),
            BotaoLojinha(
              texto: 'Cancelar',
              contorno: true,
              onPressed: _enviando ? null : () => Navigator.of(context).pop(),
            ),
          ],
        ),
      ),
    );
  }
}

class _LinhaValor extends StatelessWidget {
  const _LinhaValor({
    required this.icone,
    required this.rotulo,
    required this.valor,
  });

  final IconData icone;
  final String rotulo;
  final String valor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 14),
      child: Row(
        children: [
          Icon(icone, color: AppColors.primary, size: 24),
          const SizedBox(width: 14),
          Expanded(
            child: Text(
              rotulo,
              style: const TextStyle(
                fontFamily: 'Inter',
                color: AppColors.ink,
                fontSize: 15,
              ),
            ),
          ),
          Text(
            valor,
            style: const TextStyle(
              color: AppColors.primary,
              fontSize: 18,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}
