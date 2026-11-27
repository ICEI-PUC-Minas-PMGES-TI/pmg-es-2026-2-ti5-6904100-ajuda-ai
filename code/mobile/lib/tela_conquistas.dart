import 'package:flutter/material.dart';

import 'models/conquista.dart';
import 'services/api_config.dart';
import 'services/conquistas_api.dart';
import 'sessao_usuario.dart';
import 'theme/colors.dart';

/// Mensagem amigável para a falha ao carregar as conquistas.
String mensagemErroConquistas(Object erro) {
  if (erro is ApiException && erro.statusCode == 401) {
    return 'Sua sessão expirou. Entre novamente.';
  }
  return 'Não foi possível carregar suas conquistas. Verifique a conexão e tente de novo.';
}

/// Coleção de conquistas do aluno (F32): as obtidas e as que faltam, com o
/// critério de cada uma e o progresso. Abrir a tela já faz o servidor
/// conferir e desbloquear o que estiver cumprido.
class TelaConquistas extends StatefulWidget {
  const TelaConquistas({super.key, this.api});

  final ConquistasApi? api;

  @override
  State<TelaConquistas> createState() => _TelaConquistasState();
}

class _TelaConquistasState extends State<TelaConquistas> {
  late final ConquistasApi _api = widget.api ?? ConquistasApi();
  ColecaoConquistas? _colecao;
  String? _erro;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  Future<void> _carregar() async {
    final token = SessaoUsuario.atual.accessToken;
    if (token == null) {
      setState(() => _erro = 'Entre na sua conta para ver suas conquistas.');
      return;
    }
    setState(() => _erro = null);
    try {
      final colecao = await _api.listar(token);
      if (!mounted) return;
      setState(() => _colecao = colecao);
      final aviso = colecao.avisoNovas;
      if (aviso != null) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(aviso)));
      }
    } catch (erro) {
      if (mounted) setState(() => _erro = mensagemErroConquistas(erro));
    }
  }

  @override
  Widget build(BuildContext context) {
    final colecao = _colecao;
    final Widget corpo;
    if (_erro != null && colecao == null) {
      corpo = ListView(
        padding: const EdgeInsets.all(20),
        children: [_Erro(mensagem: _erro!, onTentar: _carregar)],
      );
    } else if (colecao == null) {
      corpo = const Center(child: CircularProgressIndicator());
    } else {
      corpo = RefreshIndicator(
        onRefresh: _carregar,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
          children: [
            _Secao(
              titulo: 'Minha coleção',
              detalhe: colecao.obtidas.length == 1
                  ? '1 conquista'
                  : '${colecao.obtidas.length} conquistas',
            ),
            if (colecao.obtidas.isEmpty)
              const _Vazio(
                'Nenhuma conquista ainda. Cumpra um dos critérios abaixo para desbloquear a primeira.',
              )
            else
              for (final o in colecao.obtidas)
                _CartaoObtida(conquista: o, nova: colecao.ehNova(o)),
            const SizedBox(height: 18),
            const _Secao(titulo: 'Para desbloquear'),
            if (colecao.disponiveis.isEmpty)
              _Vazio(
                colecao.obtidas.isEmpty
                    ? 'Nenhuma conquista disponível para você neste semestre.'
                    : 'Você já tem todas as conquistas disponíveis agora.',
              )
            else
              for (final d in colecao.disponiveis)
                _CartaoDisponivel(conquista: d),
          ],
        ),
      );
    }
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text('Conquistas'),
        backgroundColor: Colors.white,
        foregroundColor: AppColors.ink,
        elevation: 0,
      ),
      body: corpo,
    );
  }
}

class _Secao extends StatelessWidget {
  const _Secao({required this.titulo, this.detalhe});

  final String titulo;
  final String? detalhe;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Expanded(
            child: Text(
              titulo,
              style: const TextStyle(
                color: AppColors.ink,
                fontSize: 18,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          if (detalhe != null)
            Text(
              detalhe!,
              style: const TextStyle(
                fontFamily: 'Inter',
                color: AppColors.muted,
              ),
            ),
        ],
      ),
    );
  }
}

class _Medalha extends StatelessWidget {
  const _Medalha({this.imagemUrl, this.bloqueada = false});

  final String? imagemUrl;
  final bool bloqueada;

  @override
  Widget build(BuildContext context) {
    final icone = Icon(
      bloqueada ? Icons.lock_outline_rounded : Icons.emoji_events_rounded,
      color: bloqueada ? AppColors.muted : AppColors.primary,
      size: 28,
    );
    final url = imagemUrl;
    return Container(
      width: 56,
      height: 56,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: bloqueada ? const Color(0xFFF3F2F8) : AppAccents.tileLilas,
        border: Border.all(
          color: bloqueada ? const Color(0xFFE2E0EE) : const Color(0xFFCDBDF8),
          width: 2,
        ),
      ),
      child: url == null || url.isEmpty
          ? icone
          : Opacity(
              opacity: bloqueada ? 0.5 : 1,
              child: Image.network(
                url,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => icone,
              ),
            ),
    );
  }
}

class _Cartao extends StatelessWidget {
  const _Cartao({required this.child, this.destaque = false});

  final Widget child;
  final bool destaque;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppAccents.cardBg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: destaque ? const Color(0xFFB9A6F7) : AppAccents.cardBorder,
          width: destaque ? 2 : 1,
        ),
      ),
      child: child,
    );
  }
}

const _estiloNome = TextStyle(
  color: AppColors.ink,
  fontSize: 16,
  fontWeight: FontWeight.w800,
);
const _estiloTexto = TextStyle(
  fontFamily: 'Inter',
  color: AppColors.ink,
  fontSize: 14,
);
const _estiloDetalhe = TextStyle(
  fontFamily: 'Inter',
  color: AppColors.muted,
  fontSize: 13,
);

String _data(DateTime? d) => d == null
    ? ''
    : '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';

class _CartaoObtida extends StatelessWidget {
  const _CartaoObtida({required this.conquista, required this.nova});

  final ConquistaObtida conquista;
  final bool nova;

  @override
  Widget build(BuildContext context) {
    final c = conquista;
    return _Cartao(
      destaque: nova,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Medalha(imagemUrl: c.imagemUrl),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(child: Text(c.nome, style: _estiloNome)),
                    if (nova)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: AppAccents.successBg,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: const Text(
                          'Nova!',
                          style: TextStyle(
                            color: AppAccents.success,
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                          ),
                        ),
                      ),
                  ],
                ),
                if (c.descricao.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(c.descricao, style: _estiloTexto),
                ],
                const SizedBox(height: 4),
                Text(c.criterioTexto, style: _estiloDetalhe),
                Text(
                  '${c.rotuloContexto} · ${_data(c.desbloqueadaEm)}'
                  '${c.xpCreditado > 0 ? ' · +${c.xpCreditado} XP' : ''}',
                  style: _estiloDetalhe,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CartaoDisponivel extends StatelessWidget {
  const _CartaoDisponivel({required this.conquista});

  final ConquistaDisponivel conquista;

  @override
  Widget build(BuildContext context) {
    final c = conquista;
    return _Cartao(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Medalha(imagemUrl: c.imagemUrl, bloqueada: true),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(c.nome, style: _estiloNome),
                if (c.descricao.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(c.descricao, style: _estiloTexto),
                ],
                const SizedBox(height: 4),
                Text(
                  '${c.criterioTexto}${c.xp > 0 ? ' Vale +${c.xp} XP.' : ''}',
                  style: _estiloDetalhe,
                ),
                const SizedBox(height: 8),
                Semantics(
                  label: 'Progresso em ${c.nome}: ${c.atual} de ${c.meta}',
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: LinearProgressIndicator(
                      value: c.fracao,
                      minHeight: 8,
                      backgroundColor: AppColors.lavender,
                      color: AppColors.primary,
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                Text('${c.atual} de ${c.meta}', style: _estiloDetalhe),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Vazio extends StatelessWidget {
  const _Vazio(this.texto);

  final String texto;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Text(texto, style: _estiloDetalhe),
    );
  }
}

class _Erro extends StatelessWidget {
  const _Erro({required this.mensagem, required this.onTentar});

  final String mensagem;
  final VoidCallback onTentar;

  @override
  Widget build(BuildContext context) {
    return _Cartao(
      child: Column(
        children: [
          const Icon(Icons.error_outline_rounded, color: AppColors.primary),
          const SizedBox(height: 8),
          Text(mensagem, textAlign: TextAlign.center, style: _estiloTexto),
          TextButton(
            onPressed: onTentar,
            child: const Text('Tentar novamente'),
          ),
        ],
      ),
    );
  }
}
