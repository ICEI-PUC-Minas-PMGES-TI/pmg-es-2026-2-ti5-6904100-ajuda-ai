import 'package:flutter/material.dart';

import '../models/resumo_gamificacao.dart';
import '../sessao_usuario.dart';
import '../theme/colors.dart';

String _milhar(int valor) {
  final texto = valor.toString();
  final buffer = StringBuffer();
  for (var i = 0; i < texto.length; i++) {
    if (i > 0 && (texto.length - i) % 3 == 0) buffer.write('.');
    buffer.write(texto[i]);
  }
  return buffer.toString();
}

/// PNG do nível (1–10) em `assets/gamificacao`. Fora da faixa não há asset.
String? assetEmblemaNivel(int numero) {
  if (numero < 1 || numero > 10) return null;
  final id = numero.toString().padLeft(2, '0');
  return 'assets/gamificacao/nivel_$id.png';
}

/// Emblema definitivo em pixel art. A arte já traz moldura e número;
/// o widget só escolhe o arquivo do nível e o desenha inteiro.
class EmblemaNivel extends StatelessWidget {
  const EmblemaNivel({
    super.key,
    required this.numero,
    this.nome,
    this.tamanho = 104,
  });

  final int numero;

  /// Nome da conquista, só na semântica. O texto visível fica fora da imagem.
  final String? nome;
  final double tamanho;

  @override
  Widget build(BuildContext context) {
    final asset = assetEmblemaNivel(numero);
    final conquista = nome?.trim();
    final rotulo = conquista == null || conquista.isEmpty
        ? 'Emblema do nível $numero'
        : 'Emblema do nível $numero, $conquista';
    return Semantics(
      label: rotulo,
      image: asset != null,
      child: SizedBox.square(
        key: ValueKey('emblema-nivel-$numero'),
        dimension: tamanho,
        child: asset == null
            ? _EmblemaFallback(numero: numero, tamanho: tamanho)
            : Image.asset(
                asset,
                width: tamanho,
                height: tamanho,
                fit: BoxFit.contain,
                alignment: Alignment.center,
                // Vizinho mais próximo: preserva o traço da pixel art
                // ao reduzir os PNGs de 448 px.
                filterQuality: FilterQuality.none,
                gaplessPlayback: true,
                excludeFromSemantics: true,
                errorBuilder: (_, _, _) =>
                    _EmblemaFallback(numero: numero, tamanho: tamanho),
              ),
      ),
    );
  }
}

class _EmblemaFallback extends StatelessWidget {
  const _EmblemaFallback({required this.numero, required this.tamanho});

  final int numero;
  final double tamanho;

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(
      child: Center(
        child: Text(
          '$numero',
          style: TextStyle(
            color: AppColors.primary,
            fontSize: tamanho * 0.28,
            fontWeight: FontWeight.w800,
            height: 1,
          ),
        ),
      ),
    );
  }
}

/// Moedas da lojinha, com ícone e texto (não só cor).
class SaldoMoedas extends StatelessWidget {
  const SaldoMoedas({super.key, required this.moedas, this.tamanhoFonte = 14});

  final int moedas;
  final double tamanhoFonte;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          Icons.toll_rounded,
          size: tamanhoFonte + 4,
          color: AppAccents.iconeLaranja,
        ),
        const SizedBox(width: 4),
        Text(
          '${_milhar(moedas)} ${moedas == 1 ? 'moeda' : 'moedas'}',
          key: const Key('saldo-moedas'),
          style: TextStyle(
            fontFamily: 'Inter',
            color: AppColors.ink,
            fontSize: tamanhoFonte,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

/// Barra de progresso do nível (valores do servidor).
class BarraNivel extends StatelessWidget {
  const BarraNivel({super.key, required this.nivel});

  final NivelGamificacao nivel;

  @override
  Widget build(BuildContext context) {
    final legenda = nivel.maximo
        ? 'Nível máximo alcançado'
        : 'Faltam ${_milhar(nivel.xpRestante)} XP para ${nivel.proximoNome ?? 'o próximo nível'}';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(
          label: nivel.maximo
              ? 'Nível máximo alcançado'
              : 'Progresso no nível: ${nivel.progresso} por cento',
          child: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: TweenAnimationBuilder<double>(
              tween: Tween(end: nivel.progresso / 100),
              duration: const Duration(milliseconds: 500),
              curve: Curves.easeOutCubic,
              builder: (context, valor, _) => LinearProgressIndicator(
                key: const Key('barra-nivel'),
                value: valor,
                minHeight: 10,
                backgroundColor: AppColors.lavender,
                color: AppColors.primary,
              ),
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          legenda,
          style: const TextStyle(
            fontFamily: 'Inter',
            color: AppColors.muted,
            fontSize: 12.5,
          ),
        ),
      ],
    );
  }
}

/// Cartão de progresso (Home): emblema, nível, XP acumulado, barra e moedas.
///
/// Estados: carregando (sem valor ainda), dados (inclusive revalidando: o
/// último valor fica na tela), falha sem nenhum dado (com nova tentativa).
/// Nunca mostra "0 XP" no lugar de uma falha.
class CartaoProgresso extends StatelessWidget {
  const CartaoProgresso({super.key, this.onLojinha});

  /// Abre a lojinha (só passado quando o usuário pode resgatar).
  final VoidCallback? onLojinha;

  @override
  Widget build(BuildContext context) {
    final sessao = SessaoUsuario.atual;
    return ListenableBuilder(
      listenable: Listenable.merge([
        sessao.gamificacao,
        sessao.gamificacaoFalhou,
      ]),
      builder: (context, _) {
        final resumo = sessao.gamificacao.value;
        if (resumo == null) {
          final falhou = sessao.gamificacaoFalhou.value;
          return _Moldura(
            onTap: falhou ? sessao.atualizarXp : null,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Seu progresso',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.muted,
                    fontSize: 15,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  falhou
                      ? 'Não foi possível carregar seu progresso. Toque para tentar de novo.'
                      : 'Carregando seu progresso…',
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.muted,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          );
        }
        final nivel = resumo.nivel;
        return _Moldura(
          key: const Key('cartao-progresso'),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  EmblemaNivel(numero: nivel.numero, nome: nivel.nome),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Nível ${nivel.numero} · ${nivel.nome}',
                          style: const TextStyle(
                            color: AppColors.ink,
                            fontSize: 17,
                            height: 1.2,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${_milhar(resumo.xpAcumulado)} XP acumulado',
                          style: const TextStyle(
                            fontFamily: 'Inter',
                            color: AppColors.muted,
                            fontSize: 13,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              BarraNivel(nivel: nivel),
              const SizedBox(height: 12),
              Row(
                children: [
                  SaldoMoedas(moedas: resumo.moedas),
                  const Spacer(),
                  if (onLojinha != null)
                    TextButton.icon(
                      onPressed: onLojinha,
                      icon: const Icon(Icons.redeem_rounded, size: 18),
                      label: const Text('Lojinha'),
                      style: TextButton.styleFrom(
                        foregroundColor: AppColors.primary,
                        minimumSize: const Size(48, 44),
                      ),
                    ),
                ],
              ),
              if (sessao.gamificacaoFalhou.value)
                const Padding(
                  padding: EdgeInsets.only(top: 6),
                  child: Text(
                    'Mostrando o último valor carregado.',
                    style: TextStyle(
                      fontFamily: 'Inter',
                      color: AppColors.muted,
                      fontSize: 11.5,
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

/// Linha compacta do Perfil: emblema, nível, XP e moedas. Ex-participantes
/// também veem (só consulta).
class ResumoProgressoCompacto extends StatelessWidget {
  const ResumoProgressoCompacto({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<ResumoGamificacao?>(
      valueListenable: SessaoUsuario.atual.gamificacao,
      builder: (context, resumo, _) {
        if (resumo == null) return const SizedBox.shrink();
        final nivel = resumo.nivel;
        return Padding(
          key: const Key('perfil-progresso'),
          padding: const EdgeInsets.only(top: 16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              EmblemaNivel(
                numero: nivel.numero,
                nome: nivel.nome,
                tamanho: 88,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Nível ${nivel.numero} · ${nivel.nome}',
                      style: const TextStyle(
                        fontFamily: 'Inter',
                        color: AppColors.ink,
                        fontSize: 15,
                        height: 1.2,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${_milhar(resumo.xpAcumulado)} XP acumulado',
                      style: const TextStyle(
                        fontFamily: 'Inter',
                        color: AppColors.muted,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 8),
                    BarraNivel(nivel: nivel),
                    const SizedBox(height: 4),
                    SaldoMoedas(moedas: resumo.moedas, tamanhoFonte: 12.5),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _Moldura extends StatelessWidget {
  const _Moldura({super.key, required this.child, this.onTap});

  final Widget child;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppAccents.cardBg,
      borderRadius: BorderRadius.circular(22),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(22),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: AppAccents.cardBorder),
          ),
          child: child,
        ),
      ),
    );
  }
}
