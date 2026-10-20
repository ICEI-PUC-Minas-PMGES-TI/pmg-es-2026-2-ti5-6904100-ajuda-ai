import 'package:flutter/material.dart';

import '../services/api_config.dart';
import '../services/coordenacao_api.dart';
import '../theme/colors.dart';

const corFundoCoord = Color(0xFFF6F5FB);
const corTextoSecundarioCoord = Color(0xFF5C5678);
const corErroCoord = Color(0xFFB91C1C);

String mensagemDeErro(Object erro) => switch (erro) {
  ApiException(:final mensagem) => mensagem,
  ApiIndisponivelException() =>
    'Não foi possível conectar à API. Verifique se o backend está rodando.',
  _ => erro.toString().replaceFirst('Exception: ', ''),
};

void mostrarMensagemCoord(BuildContext context, String texto) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(texto)));
}

Future<bool> confirmarAcaoCoord(
  BuildContext context, {
  required String titulo,
  required String mensagem,
  required String confirmar,
  bool destrutiva = false,
}) async {
  final resposta = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(titulo),
      content: Text(mensagem),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, true),
          style: FilledButton.styleFrom(
            backgroundColor: destrutiva ? corErroCoord : AppColors.primary,
          ),
          child: Text(confirmar),
        ),
      ],
    ),
  );
  return resposta == true;
}

const _meses = [
  'jan.',
  'fev.',
  'mar.',
  'abr.',
  'mai.',
  'jun.',
  'jul.',
  'ago.',
  'set.',
  'out.',
  'nov.',
  'dez.',
];

/// "2026-03-12T..." → "12 mar. 2026".
String formatarDataCoord(Object? iso) {
  final data = DateTime.tryParse('${iso ?? ''}')?.toLocal();
  if (data == null) return '';
  return '${data.day} ${_meses[data.month - 1]} ${data.year}';
}

int? idDe(Map<String, dynamic> item) =>
    item['id'] is int ? item['id'] as int : int.tryParse('${item['id'] ?? ''}');

/// Cabeçalho das telas da coordenação.
class CabecalhoCoord extends StatelessWidget {
  const CabecalhoCoord({
    super.key,
    required this.titulo,
    this.subtitulo,
    this.voltar = false,
    this.acao,
  });

  final String titulo;
  final String? subtitulo;
  final bool voltar;
  final Widget? acao;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (voltar)
            Padding(
              padding: const EdgeInsets.only(right: 4),
              child: IconButton(
                tooltip: 'Voltar',
                onPressed: () => Navigator.of(context).maybePop(),
                icon: const Icon(
                  Icons.arrow_back_ios_new,
                  size: 18,
                  color: AppColors.primary,
                ),
              ),
            ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  titulo,
                  style: const TextStyle(
                    fontFamily: 'Poppins',
                    fontWeight: FontWeight.w800,
                    fontSize: 22,
                    color: AppColors.ink,
                    height: 1.15,
                  ),
                ),
                if (subtitulo != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    subtitulo!,
                    style: const TextStyle(
                      fontFamily: 'Inter',
                      color: corTextoSecundarioCoord,
                      fontSize: 13,
                    ),
                  ),
                ],
              ],
            ),
          ),
          ?acao,
        ],
      ),
    );
  }
}

/// Requisitos do ciclo com a declaração do candidato (foto do envio).
/// Registros antigos, sem a foto, mostram a declaração única (legado).
class RequisitosDeclaradosCoord extends StatelessWidget {
  const RequisitosDeclaradosCoord({
    super.key,
    required this.requisitos,
    required this.respondidos,
    required this.legado,
    this.periodo,
  });

  final List<dynamic>? requisitos;
  final bool respondidos;
  final bool legado;
  final int? periodo;

  @override
  Widget build(BuildContext context) {
    final lista = (requisitos ?? const []).whereType<Map>().toList();
    Widget linha(IconData icone, Color cor, String texto) => Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icone, size: 16, color: cor),
          const SizedBox(width: 6),
          Expanded(child: Text(texto, style: const TextStyle(fontSize: 13))),
        ],
      ),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        linha(
          (periodo ?? 0) > 1 ? Icons.check : Icons.warning_amber,
          (periodo ?? 0) > 1 ? AppAccents.success : corErroCoord,
          '${periodo == null ? 'Período não informado' : 'Está no $periodoº período'} (mínimo: 2º)',
        ),
        for (final r in lista)
          linha(
            !respondidos
                ? Icons.info_outline
                : r['cumpre'] == true
                ? Icons.check
                : Icons.close,
            !respondidos
                ? AppColors.primary
                : r['cumpre'] == true
                ? AppAccents.success
                : corErroCoord,
            '${r['descricao']}${r['obrigatorio'] == false ? ' (desejável)' : ''}'
            '${!respondidos
                ? ''
                : r['cumpre'] == true
                ? ' — declarou que cumpre'
                : ' — declarou que NÃO cumpre'}',
          ),
        if (!respondidos)
          Text(
            legado
                ? 'Candidatura anterior aos requisitos por ciclo: declarou '
                      'cumprir os pré-requisitos da época.'
                : 'Candidatura anterior aos requisitos por ciclo: não '
                      'declarou os pré-requisitos.',
            style: const TextStyle(
              fontSize: 12,
              color: corTextoSecundarioCoord,
            ),
          ),
        if (respondidos && lista.isEmpty)
          const Text(
            'O ciclo não exigia disciplinas.',
            style: TextStyle(fontSize: 12, color: corTextoSecundarioCoord),
          ),
        const Text(
          'Declaração do próprio aluno; não há verificação automática do '
          'histórico acadêmico.',
          style: TextStyle(fontSize: 11, color: corTextoSecundarioCoord),
        ),
      ],
    );
  }
}

/// Selo colorido do status de uma participação.
class SeloStatusCoord extends StatelessWidget {
  const SeloStatusCoord({super.key, required this.item});

  final Map<String, dynamic> item;

  @override
  Widget build(BuildContext context) {
    final status = '${item['status'] ?? ''}';
    final papel = '${item['papel'] ?? ''}';
    final (cor, fundo) = switch (status) {
      'nao_aprovado' => (corErroCoord, const Color(0xFFFDECEC)),
      'em_andamento' || 'concluido' when papel != 'candidato' => (
        AppAccents.success,
        AppAccents.successBg,
      ),
      'em_analise' => (AppAccents.iconeLaranja, AppAccents.tileLaranja),
      _ => (AppColors.primary, AppColors.lavender),
    };
    final rotulo = papel == 'apadrinhado' && item['grupo'] == null
        ? 'Sem vínculo'
        : '${item['statusRotulo'] ?? status}';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: fundo,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        rotulo,
        style: TextStyle(
          fontFamily: 'Inter',
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: cor,
        ),
      ),
    );
  }
}

class AvatarCoord extends StatelessWidget {
  const AvatarCoord({super.key, required this.item, this.raio = 20});

  final Map<String, dynamic> item;
  final double raio;

  @override
  Widget build(BuildContext context) {
    return CircleAvatar(
      radius: raio,
      backgroundColor: const Color(0xFFEBE4FF),
      foregroundColor: AppColors.primary,
      child: Text(
        '${item['iniciais'] ?? '?'}',
        style: TextStyle(fontWeight: FontWeight.w700, fontSize: raio * 0.6),
      ),
    );
  }
}

/// Lista os padrinhos do programa e cria o vínculo com o apadrinhado.
/// Retorna `true` se o vínculo foi criado.
Future<bool> definirPadrinhoCoord(
  BuildContext context, {
  required CoordenacaoApi api,
  required int apadrinhadoId,
  required String nomeApadrinhado,
  String? programa,
}) async {
  final escolhido = await showModalBottomSheet<Map<String, dynamic>>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    backgroundColor: Colors.white,
    builder: (_) => _SeletorPadrinho(api: api, programa: programa),
  );
  if (escolhido == null || !context.mounted) return false;
  final padrinhoId = idDe(escolhido);
  if (padrinhoId == null) return false;

  final ok = await confirmarAcaoCoord(
    context,
    titulo: 'Definir padrinho',
    mensagem:
        '${escolhido['nome']} será o padrinho de $nomeApadrinhado. '
        'Se ainda não tiver grupo, um novo grupo será criado.',
    confirmar: 'Definir',
  );
  if (!ok || !context.mounted) return false;

  try {
    final resultado = await api.criarVinculo(
      apadrinhadoId: apadrinhadoId,
      padrinhoId: padrinhoId,
    );
    if (!context.mounted) return true;
    final grupo =
        (resultado['apadrinhado'] as Map?)?['grupo'] ??
        (resultado['padrinho'] as Map?)?['grupo'];
    mostrarMensagemCoord(
      context,
      'Padrinho definido: ${escolhido['nome']}'
      '${grupo == null ? '' : ' ($grupo)'}.',
    );
    return true;
  } catch (erro) {
    if (context.mounted) mostrarMensagemCoord(context, mensagemDeErro(erro));
    return false;
  }
}

class _SeletorPadrinho extends StatefulWidget {
  const _SeletorPadrinho({required this.api, this.programa});

  final CoordenacaoApi api;
  final String? programa;

  @override
  State<_SeletorPadrinho> createState() => _SeletorPadrinhoState();
}

class _SeletorPadrinhoState extends State<_SeletorPadrinho> {
  late final Future<List<Map<String, dynamic>>> _padrinhos = widget.api
      .usuarios(programa: widget.programa)
      .then(
        (usuarios) => usuarios
            .where(
              (u) =>
                  u['situacao'] == 'candidatura_aprovada_aguardando_matching' ||
                  u['situacao'] == 'padrinho_ativo',
            )
            .toList(),
      );

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.7,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Text(
                'Escolha o padrinho',
                style: TextStyle(
                  fontFamily: 'Poppins',
                  fontWeight: FontWeight.w800,
                  fontSize: 18,
                  color: AppColors.ink,
                ),
              ),
            ),
            Flexible(
              child: FutureBuilder<List<Map<String, dynamic>>>(
                future: _padrinhos,
                builder: (context, snapshot) {
                  if (snapshot.hasError) {
                    return Padding(
                      padding: const EdgeInsets.all(20),
                      child: Text(mensagemDeErro(snapshot.error!)),
                    );
                  }
                  if (!snapshot.hasData) {
                    return const Padding(
                      padding: EdgeInsets.all(32),
                      child: Center(
                        child: CircularProgressIndicator(
                          color: AppColors.primary,
                        ),
                      ),
                    );
                  }
                  final padrinhos = snapshot.data!;
                  if (padrinhos.isEmpty) {
                    return const Padding(
                      padding: EdgeInsets.all(20),
                      child: Text(
                        'Nenhum padrinho aprovado neste programa.',
                        style: TextStyle(color: AppColors.muted),
                      ),
                    );
                  }
                  return ListView(
                    shrinkWrap: true,
                    children: [
                      for (final padrinho in padrinhos)
                        ListTile(
                          leading: AvatarCoord(item: padrinho),
                          title: Text('${padrinho['nome'] ?? ''}'),
                          subtitle: Text(
                            [
                              '${padrinho['grupo'] ?? 'Sem grupo'}',
                              '${padrinho['apadrinhados'] ?? 0} apadrinhado(s)',
                            ].join(' · '),
                          ),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () => Navigator.pop(context, padrinho),
                        ),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

Future<String?> solicitarJustificativaCoord(BuildContext context) async {
  var justificativa = '';
  final resultado = await showDialog<String>(
    context: context,
    builder: (context) => StatefulBuilder(
      builder: (context, setState) => AlertDialog(
        title: const Text('Justificativa da rejeição'),
        content: TextField(
          maxLength: 1000,
          maxLines: 3,
          decoration: const InputDecoration(
            labelText: 'Justificativa visível ao candidato',
          ),
          onChanged: (valor) => setState(() => justificativa = valor),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: justificativa.trim().isEmpty
                ? null
                : () => Navigator.pop(context, justificativa.trim()),
            child: const Text('Rejeitar'),
          ),
        ],
      ),
    ),
  );
  return resultado;
}
