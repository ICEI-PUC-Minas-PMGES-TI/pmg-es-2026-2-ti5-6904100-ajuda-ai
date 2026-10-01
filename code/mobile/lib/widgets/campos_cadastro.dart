import 'package:flutter/material.dart';

import '../theme/colors.dart';
import 'indicador_passo.dart';

abstract final class EstiloCampo {
  static const valor = TextStyle(
    fontFamily: 'Inter',
    color: AppColors.ink,
    fontSize: 14,
  );

  static const dica = TextStyle(
    fontFamily: 'Inter',
    color: AppColors.muted,
    fontSize: 13,
  );

  static const corErro = Color(0xFFDC2626);

  static BoxDecoration decoracao({bool bloqueado = false, bool erro = false}) =>
      BoxDecoration(
        color: bloqueado ? AppColors.lavender : Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: erro ? corErro : AppAccents.cardBorder,
          width: erro ? 1.5 : 1.2,
        ),
      );
}

class EstruturaCadastro extends StatelessWidget {
  const EstruturaCadastro({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final estreita = MediaQuery.sizeOf(context).width < 720;
    final formulario = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: children,
    );
    final aviso = const Text(
      'Seus dados são usados apenas para melhorar sua '
      'experiência no programa.',
      textAlign: TextAlign.center,
      style: TextStyle(
        fontFamily: 'Inter',
        color: AppColors.muted,
        fontSize: 13,
        height: 1.4,
      ),
    );

    return Scaffold(
      backgroundColor: estreita ? Colors.white : AppColors.lavender,
      body: SafeArea(
        child: Column(
          children: [
            const _BarraLogos(),
            Expanded(
              child: Align(
                alignment: Alignment.topCenter,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 560),
                  child: SingleChildScrollView(
                    padding: EdgeInsets.fromLTRB(
                      estreita ? 20 : 16,
                      estreita ? 8 : 16,
                      estreita ? 20 : 16,
                      24,
                    ),
                    child: Column(
                      children: [
                        if (estreita)
                          formulario
                        else
                          Container(
                            padding: const EdgeInsets.fromLTRB(18, 22, 18, 18),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(20),
                              boxShadow: [
                                BoxShadow(
                                  color: AppColors.primary.withValues(
                                    alpha: 0.06,
                                  ),
                                  blurRadius: 24,
                                  offset: const Offset(0, 8),
                                ),
                              ],
                            ),
                            child: formulario,
                          ),
                        const SizedBox(height: 18),
                        aviso,
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BarraLogos extends StatelessWidget {
  const _BarraLogos();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(bottom: BorderSide(color: AppAccents.cardBorder)),
      ),
      child: Row(
        children: [
          Image.asset('assets/images/logo.png', height: 28),
          Container(
            width: 1,
            height: 24,
            margin: const EdgeInsets.symmetric(horizontal: 10),
            color: AppColors.muted.withValues(alpha: 0.35),
          ),
          Image.asset('assets/images/puclogo.png', height: 32),
        ],
      ),
    );
  }
}

class TituloPasso extends StatelessWidget {
  const TituloPasso({
    super.key,
    required this.passo,
    required this.total,
    required this.titulo,
    required this.subtitulo,
  });

  final int passo;
  final int total;
  final String titulo;
  final String subtitulo;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (Navigator.of(context).canPop())
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Tooltip(
              message: 'Voltar',
              child: InkResponse(
                onTap: () => Navigator.of(context).maybePop(),
                radius: 20,
                child: const Icon(
                  Icons.arrow_back_ios_new,
                  size: 18,
                  color: AppColors.primary,
                ),
              ),
            ),
          ),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(
                titulo,
                style: const TextStyle(
                  color: AppColors.ink,
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.4,
                  height: 1.1,
                ),
              ),
            ),
            const SizedBox(width: 12),
            IndicadorPasso(passo: passo, total: total),
          ],
        ),
        const SizedBox(height: 10),
        Text(
          subtitulo,
          style: const TextStyle(
            fontFamily: 'Inter',
            color: AppColors.muted,
            fontSize: 13,
            height: 1.4,
          ),
        ),
      ],
    );
  }
}

class RotuloCampo extends StatelessWidget {
  const RotuloCampo(this.texto, {super.key});

  final String texto;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 14, bottom: 6),
      child: Text(
        texto,
        style: const TextStyle(
          fontFamily: 'Inter',
          color: AppColors.ink,
          fontSize: 13,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class CampoTexto extends StatelessWidget {
  const CampoTexto({
    super.key,
    required this.icone,
    required this.child,
    this.bloqueado = false,
  });

  final IconData icone;
  final Widget child;
  final bool bloqueado;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 48,
      padding: const EdgeInsets.symmetric(horizontal: 14),
      decoration: EstiloCampo.decoracao(bloqueado: bloqueado),
      child: Row(
        children: [
          Icon(icone, size: 20, color: AppColors.muted),
          const SizedBox(width: 12),
          Expanded(child: child),
        ],
      ),
    );
  }
}

class MensagemErroCampo extends StatelessWidget {
  const MensagemErroCampo(this.texto, {super.key});

  final String texto;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.error_outline, size: 14, color: EstiloCampo.corErro),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              texto,
              style: const TextStyle(
                fontFamily: 'Inter',
                color: EstiloCampo.corErro,
                fontSize: 12,
                height: 1.3,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class LinhaCamposResponsiva extends StatelessWidget {
  const LinhaCamposResponsiva({
    super.key,
    required this.esquerda,
    required this.direita,
    this.larguraMinimaColuna = 360,
  });

  final Widget esquerda;
  final Widget direita;
  final double larguraMinimaColuna;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final ladoALado = constraints.maxWidth >= larguraMinimaColuna;
        if (!ladoALado) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [esquerda, direita],
          );
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: esquerda),
            const SizedBox(width: 10),
            Expanded(child: direita),
          ],
        );
      },
    );
  }
}

class CampoTextoLongo extends StatelessWidget {
  const CampoTextoLongo({
    super.key,
    required this.controller,
    required this.dica,
    required this.limite,
    this.erro = false,
    this.mensagemErro,
  });

  final TextEditingController controller;
  final String dica;
  final int limite;
  final bool erro;
  final String? mensagemErro;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          constraints: const BoxConstraints(minHeight: 48),
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
          decoration: EstiloCampo.decoracao(erro: erro),
          child: TextField(
            controller: controller,
            minLines: 2,
            maxLines: 4,
            maxLength: limite,
            style: EstiloCampo.valor,
            decoration: InputDecoration(
              hintText: dica,
              hintStyle: EstiloCampo.dica,
              border: InputBorder.none,
              isDense: true,
              contentPadding: EdgeInsets.zero,
              counterStyle: const TextStyle(
                fontFamily: 'Inter',
                color: AppColors.muted,
                fontSize: 11,
              ),
            ),
          ),
        ),
        if (erro && mensagemErro != null) MensagemErroCampo(mensagemErro!),
      ],
    );
  }
}

class CampoSelecao<T> extends StatelessWidget {
  const CampoSelecao({
    super.key,
    required this.icone,
    required this.valor,
    required this.opcoes,
    required this.onChanged,
    this.dica,
    this.erro = false,
    this.mensagemErro,
    this.rotuloSemantico,
  });

  final IconData icone;
  final T? valor;
  final Map<T, String> opcoes;
  final ValueChanged<T> onChanged;
  final String? dica;
  final bool erro;
  final String? mensagemErro;
  final String? rotuloSemantico;

  @override
  Widget build(BuildContext context) {
    final tela = MediaQuery.sizeOf(context);
    final menuMaxHeight = (tela.height * 0.4).clamp(160.0, 280.0);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          constraints: const BoxConstraints(minHeight: 48),
          padding: const EdgeInsets.only(left: 14, right: 8),
          decoration: EstiloCampo.decoracao(erro: erro),
          child: Row(
            children: [
              Icon(icone, size: 20, color: AppColors.primary),
              const SizedBox(width: 10),
              Expanded(
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<T>(
                    value: valor,
                    hint: dica == null
                        ? null
                        : Text(
                            dica!,
                            overflow: TextOverflow.ellipsis,
                            style: EstiloCampo.dica,
                          ),
                    isExpanded: true,
                    borderRadius: BorderRadius.circular(12),
                    dropdownColor: Colors.white,
                    menuMaxHeight: menuMaxHeight,
                    style: EstiloCampo.valor,
                    icon: const Icon(
                      Icons.keyboard_arrow_down_rounded,
                      color: AppColors.ink,
                    ),
                    items: [
                      for (final MapEntry(:key, :value) in opcoes.entries)
                        DropdownMenuItem(
                          value: key,
                          child: Text(value, overflow: TextOverflow.ellipsis),
                        ),
                    ],
                    onChanged: (novo) {
                      if (novo != null) onChanged(novo);
                    },
                  ),
                ),
              ),
            ],
          ),
        ),
        if (erro && mensagemErro != null) MensagemErroCampo(mensagemErro!),
      ],
    );
  }
}

class CampoMultiSelecao extends StatelessWidget {
  const CampoMultiSelecao({
    super.key,
    required this.selecionados,
    required this.opcoes,
    required this.dica,
    required this.onAdicionar,
    required this.onRemover,
    this.erro = false,
    this.mensagemErro,
    this.icone = Icons.sell_outlined,
    this.maxChipsVisiveis = 3,
    this.rotuloSemantico,
  });

  final List<String> selecionados;
  final List<String> opcoes;
  final String dica;
  final ValueChanged<String> onAdicionar;
  final ValueChanged<String> onRemover;
  final bool erro;
  final String? mensagemErro;
  final IconData icone;
  final int maxChipsVisiveis;
  final String? rotuloSemantico;

  @override
  Widget build(BuildContext context) {
    final disponiveis = opcoes
        .where((opcao) => !selecionados.contains(opcao))
        .toList();
    final chipsVisiveis = selecionados.take(maxChipsVisiveis).toList();
    final extras = selecionados.length - chipsVisiveis.length;
    final tela = MediaQuery.sizeOf(context);
    final menuMaxHeight = (tela.height * 0.4).clamp(160.0, 280.0);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: double.infinity,
          constraints: const BoxConstraints(minHeight: 48),
          padding: EdgeInsets.fromLTRB(
            12,
            selecionados.isEmpty ? 4 : 12,
            8,
            4,
          ),
          decoration: EstiloCampo.decoracao(erro: erro),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (selecionados.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final item in chipsVisiveis)
                        _Chip(
                          texto: item,
                          onRemover: () => onRemover(item),
                        ),
                      if (extras > 0)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: AppAccents.tileLilas,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            '+$extras',
                            style: const TextStyle(
                              fontFamily: 'Inter',
                              color: AppColors.primary,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              PopupMenuButton<String>(
                enabled: disponiveis.isNotEmpty,
                tooltip: rotuloSemantico ?? dica,
                offset: const Offset(0, 8),
                constraints: BoxConstraints(
                  maxWidth: tela.width - 40,
                  maxHeight: menuMaxHeight,
                ),
                onSelected: onAdicionar,
                color: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                itemBuilder: (_) => [
                  for (final item in disponiveis)
                    PopupMenuItem(
                      value: item,
                      child: Text(item, style: EstiloCampo.valor),
                    ),
                ],
                child: SizedBox(
                  height: 44,
                  child: Row(
                    children: [
                      Icon(icone, size: 18, color: AppColors.muted),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          selecionados.isEmpty
                              ? dica
                              : '${selecionados.length} selecionado(s)',
                          style: selecionados.isEmpty
                              ? EstiloCampo.dica
                              : EstiloCampo.valor,
                        ),
                      ),
                      const Icon(
                        Icons.keyboard_arrow_down_rounded,
                        color: AppColors.ink,
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
        if (erro && mensagemErro != null) MensagemErroCampo(mensagemErro!),
      ],
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.texto, required this.onRemover});

  final String texto;
  final VoidCallback onRemover;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.only(left: 12, right: 6, top: 6, bottom: 6),
      decoration: BoxDecoration(
        color: AppAccents.tileLilas,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            texto,
            style: const TextStyle(
              fontFamily: 'Inter',
              color: AppColors.primary,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(width: 4),
          InkWell(
            onTap: onRemover,
            customBorder: const CircleBorder(),
            child: const Icon(Icons.close, size: 16, color: AppColors.primary),
          ),
        ],
      ),
    );
  }
}

class AvisoCadastro extends StatelessWidget {
  const AvisoCadastro({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.lavender,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.info, size: 20, color: AppColors.primary),
          const SizedBox(width: 10),
          Expanded(child: child),
        ],
      ),
    );
  }
}

class BotaoCadastro extends StatelessWidget {
  const BotaoCadastro({
    super.key,
    required this.texto,
    required this.onPressed,
  });

  final String texto;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final raio = BorderRadius.circular(16);

    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: raio,
        gradient: const LinearGradient(
          colors: [AppColors.primary, Color(0xFF6A3DE8)],
        ),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withValues(alpha: 0.30),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onPressed,
          borderRadius: raio,
          child: SizedBox(
            width: double.infinity,
            height: 54,
            child: Stack(
              alignment: Alignment.center,
              children: [
                Text(
                  texto,
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const Positioned(
                  right: 20,
                  child: Icon(Icons.arrow_forward, color: Colors.white),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
