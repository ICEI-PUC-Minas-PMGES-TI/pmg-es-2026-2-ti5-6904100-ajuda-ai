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

/// Emblema do nível, desenhado em código (roxo institucional + estrela). O
/// BL-55 troca pelos assets finais; aqui nada depende de imagem externa.
class EmblemaNivel extends StatelessWidget {
  const EmblemaNivel({super.key, required this.numero, this.tamanho = 56});

  final int numero;
  final double tamanho;

  @override
  Widget build(BuildContext context) {
    // Tons sobem com o nível, sem depender só de cor (o número aparece).
    final t = ((numero - 1) / 9).clamp(0.0, 1.0);
    final topo = Color.lerp(
      const Color(0xFF8B5CF6),
      const Color(0xFFF59E0B),
      t,
    )!;
    return Semantics(
      label: 'Emblema do nível $numero',
      child: SizedBox.square(
        dimension: tamanho,
        child: Stack(
          alignment: Alignment.center,
          children: [
            Container(
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [topo, AppColors.primary],
                ),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x33420594),
                    blurRadius: 8,
                    offset: Offset(0, 3),
                  ),
                ],
                border: Border.all(color: Colors.white, width: 2),
              ),
            ),
            Icon(
              Icons.star_rounded,
              size: tamanho * 0.78,
              color: Colors.white.withValues(alpha: 0.18),
            ),
            ExcludeSemantics(
              child: Text(
                '$numero',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: tamanho * 0.38,
                  fontWeight: FontWeight.w800,
                  height: 1,
                ),
              ),
            ),
          ],
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
                children: [
                  EmblemaNivel(numero: nivel.numero),
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
          padding: const EdgeInsets.only(top: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  EmblemaNivel(numero: nivel.numero, tamanho: 28),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(
                      'Nível ${nivel.numero} · ${nivel.nome} · ${_milhar(resumo.xpAcumulado)} XP',
                      style: const TextStyle(
                        fontFamily: 'Inter',
                        color: AppColors.ink,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              SizedBox(width: 220, child: BarraNivel(nivel: nivel)),
              const SizedBox(height: 4),
              SaldoMoedas(moedas: resumo.moedas, tamanhoFonte: 12.5),
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
