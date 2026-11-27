import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../services/coordenacao_api.dart';
import '../theme/colors.dart';

const placeholderDataHoraRecompensa = 'DD/MM/AAAA às HH:mm';

DateTime? lerDataHoraRecompensa(String? valor) =>
    valor == null ? null : DateTime.tryParse(valor)?.toLocal();

String? dataHoraLocalParaIsoRecompensa(DateTime? data) =>
    data?.toUtc().toIso8601String();

DateTime combinarDataHoraRecompensa(DateTime dia, TimeOfDay hora) =>
    DateTime(dia.year, dia.month, dia.day, hora.hour, hora.minute);

String formatarDataHoraLocalRecompensa(DateTime data) {
  String dois(int n) => n.toString().padLeft(2, '0');
  return '${dois(data.day)}/${dois(data.month)}/${data.year} às ${dois(data.hour)}:${dois(data.minute)}';
}

String mascararDataHoraRecompensa(String valor) {
  final digitos = valor.replaceAll(RegExp(r'\D'), '');
  if (digitos.length <= 2) return digitos;
  if (digitos.length <= 4) {
    return '${digitos.substring(0, 2)}/${digitos.substring(2)}';
  }
  if (digitos.length <= 8) {
    return '${digitos.substring(0, 2)}/${digitos.substring(2, 4)}/${digitos.substring(4)}';
  }
  if (digitos.length <= 10) {
    return '${digitos.substring(0, 2)}/${digitos.substring(2, 4)}/${digitos.substring(4, 8)} às ${digitos.substring(8)}';
  }
  final limitados = digitos.length > 12 ? digitos.substring(0, 12) : digitos;
  return '${limitados.substring(0, 2)}/${limitados.substring(2, 4)}/${limitados.substring(4, 8)} às ${limitados.substring(8, 10)}:${limitados.substring(10)}';
}

class MascaraDataHoraRecompensa extends TextInputFormatter {
  const MascaraDataHoraRecompensa();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final texto = mascararDataHoraRecompensa(newValue.text);
    if (!newValue.selection.isValid) return TextEditingValue(text: texto);

    int digitosAntes(int offset) {
      final limite = offset.clamp(0, newValue.text.length).toInt();
      return RegExp(r'\d')
          .allMatches(newValue.text.substring(0, limite))
          .length;
    }

    int posicaoAposDigitos(int quantidade) {
      if (quantidade <= 0) return 0;
      var encontrados = 0;
      for (var indice = 0; indice < texto.length; indice++) {
        if (RegExp(r'\d').hasMatch(texto[indice]) &&
            ++encontrados == quantidade) {
          return indice + 1;
        }
      }
      return texto.length;
    }

    return TextEditingValue(
      text: texto,
      selection: TextSelection(
        baseOffset: posicaoAposDigitos(
          digitosAntes(newValue.selection.baseOffset),
        ),
        extentOffset: posicaoAposDigitos(
          digitosAntes(newValue.selection.extentOffset),
        ),
      ),
    );
  }
}

DateTime? lerDataHoraDigitadaRecompensa(String? valor) {
  final partes = RegExp(r'^(\d{2})/(\d{2})/(\d{4}) às (\d{2}):(\d{2})$')
      .firstMatch(valor ?? '');
  if (partes == null) return null;
  final dia = int.parse(partes[1]!);
  final mes = int.parse(partes[2]!);
  final ano = int.parse(partes[3]!);
  final hora = int.parse(partes[4]!);
  final minuto = int.parse(partes[5]!);
  final data = DateTime(ano, mes, dia, hora, minuto);
  if (data.year != ano ||
      data.month != mes ||
      data.day != dia ||
      data.hour != hora ||
      data.minute != minuto) {
    return null;
  }
  return data;
}

String? validarDataHoraDigitadaRecompensa(String? valor) {
  if (valor == null || valor.isEmpty) return null;
  return lerDataHoraDigitadaRecompensa(valor) == null
      ? 'Informe uma data e horário válidos.'
      : null;
}

String _rotuloStatus(String status) => switch (status) {
  'rascunho' => 'Rascunho',
  'publicada' => 'Publicada',
  'inativa' => 'Inativa',
  'arquivada' => 'Arquivada',
  _ => status,
};

String _textoEstoque(Map<String, dynamic>? estoque) {
  if (estoque == null || estoque['ilimitado'] == true) return 'Ilimitado';
  return '${estoque['disponivel'] ?? 0} disponíveis de ${estoque['total'] ?? 0}';
}

String _formatarData(dynamic valor) {
  final data = valor is String ? lerDataHoraRecompensa(valor) : null;
  if (data == null) return 'Sem prazo';
  return formatarDataHoraLocalRecompensa(data);
}

String? validarTextoRecompensa(String? valor, String campo, {int? maximo}) {
  final texto = valor?.trim() ?? '';
  if (texto.isEmpty) return 'Informe $campo.';
  if (maximo != null && texto.length > maximo) {
    return 'Use no máximo $maximo caracteres.';
  }
  return null;
}

String? validarCustoMoedasRecompensa(String? valor) {
  final numero = int.tryParse(valor?.trim() ?? '');
  if (numero == null || numero < 1 || numero > 100000) {
    return 'Use um número inteiro entre 1 e 100.000.';
  }
  return null;
}

String? validarUrlImagemRecompensa(String? valor) {
  final texto = valor?.trim() ?? '';
  if (texto.isEmpty) return null;
  final uri = Uri.tryParse(texto);
  if (texto.length > 500 ||
      uri?.scheme != 'https' ||
      uri?.host.isEmpty == true) {
    return 'Informe uma URL https válida (até 500 caracteres).';
  }
  return null;
}

String? validarEstoqueInicialRecompensa(
  String? valor, {
  required bool ilimitado,
}) {
  if (ilimitado) return null;
  final numero = int.tryParse(valor?.trim() ?? '');
  if (numero == null || numero < 0 || numero > 100000) {
    return 'Informe um estoque inteiro entre 0 e 100.000.';
  }
  return null;
}

String? validarLimiteRecompensa(String? valor) {
  final texto = valor?.trim() ?? '';
  if (texto.isEmpty) return null;
  final numero = int.tryParse(texto);
  if (numero == null || numero < 1 || numero > 100) {
    return 'Use um número inteiro entre 1 e 100.';
  }
  return null;
}

String? validarVigenciaRecompensa({
  DateTime? inicio,
  DateTime? fim,
  bool publicar = false,
  bool criando = false,
  DateTime? agora,
}) {
  if (inicio != null && fim != null && !inicio.isBefore(fim)) {
    return 'A data e hora inicial deve ser anterior à final.';
  }
  if (criando &&
      publicar &&
      fim != null &&
      !fim.isAfter(agora ?? DateTime.now())) {
    return 'A vigência já terminou; ajuste a data final antes de publicar.';
  }
  return null;
}

class TelaRecompensasCoord extends StatefulWidget {
  const TelaRecompensasCoord({super.key, required this.api});

  final CoordenacaoApi api;

  @override
  State<TelaRecompensasCoord> createState() => _TelaRecompensasCoordState();
}

class _TelaRecompensasCoordState extends State<TelaRecompensasCoord> {
  List<Map<String, dynamic>>? _recompensas;
  List<Map<String, dynamic>> _programas = const [];
  String? _filtro;
  String? _erro;
  String? _erroProgramas;
  String? _ocupado;
  bool _carregando = true;

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
      final recompensas = await widget.api.recompensas(status: _filtro);
      if (!mounted) return;
      setState(() {
        _recompensas = recompensas;
        _carregando = false;
      });
    } catch (erro) {
      if (!mounted) return;
      setState(() {
        _erro = erro.toString();
        _carregando = false;
      });
    }

    try {
      final programas = await widget.api.programas();
      if (mounted) {
        setState(() {
          _programas = programas;
          _erroProgramas = null;
        });
      }
    } catch (erro) {
      if (mounted) setState(() => _erroProgramas = erro.toString());
    }
  }

  Future<void> _formulario({Map<String, dynamic>? original}) async {
    final salvo = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => FormularioRecompensaCoord(
          api: widget.api,
          programas: _programas,
          original: original,
          erroProgramas: _erroProgramas,
        ),
      ),
    );
    if (salvo == true && mounted) await _carregar();
  }

  Future<bool> _confirmar(String titulo, String texto) async =>
      await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(titulo),
          content: Text(texto),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Continuar'),
            ),
          ],
        ),
      ) ??
      false;

  Future<void> _executar(
    Map<String, dynamic> recompensa,
    Future<Map<String, dynamic>> Function() acao,
  ) async {
    final id = recompensa['id'] as String;
    if (_ocupado != null) return;
    setState(() {
      _ocupado = id;
      _erro = null;
    });
    try {
      await acao();
      if (mounted) await _carregar();
    } catch (erro) {
      if (mounted) {
        setState(() {
          _erro = erro.toString();
          _ocupado = null;
        });
      }
    } finally {
      if (mounted && _ocupado == id) setState(() => _ocupado = null);
    }
  }

  Future<void> _mudarStatus(Map<String, dynamic> recompensa) async {
    final status = recompensa['status'] as String? ?? '';
    final publicar = status != 'publicada';
    final acao = publicar ? 'Publicar' : 'Desativar';
    if (!await _confirmar(
      '$acao recompensa',
      publicar
          ? 'A recompensa ficará visível aos alunos elegíveis quando estiver dentro da vigência.'
          : 'A recompensa deixará de aparecer na lojinha. Os resgates já feitos serão preservados.',
    )) {
      return;
    }
    await _executar(
      recompensa,
      () => publicar
          ? widget.api.publicarRecompensa(recompensa['id'] as String)
          : widget.api.desativarRecompensa(recompensa['id'] as String),
    );
  }

  Future<void> _remover(Map<String, dynamic> recompensa) async {
    final podeExcluir = recompensa['podeExcluir'] == true;
    final verbo = podeExcluir ? 'Excluir' : 'Arquivar';
    if (!await _confirmar(
      '$verbo recompensa',
      podeExcluir
          ? 'A recompensa será excluída permanentemente. Esta ação não pode ser desfeita.'
          : 'A recompensa será arquivada. O histórico de resgates e estoque será preservado.',
    )) {
      return;
    }
    await _executar(
      recompensa,
      () => podeExcluir
          ? widget.api.excluirRecompensa(recompensa['id'] as String)
          : widget.api.arquivarRecompensa(recompensa['id'] as String),
    );
  }

  Future<void> _ajustarEstoque(Map<String, dynamic> recompensa) async {
    final dados = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => _AjusteEstoqueDialog(recompensa: recompensa),
    );
    if (dados == null) return;
    await _executar(
      recompensa,
      () => widget.api.ajustarEstoqueRecompensa(recompensa['id'] as String, {
        ...dados,
        'atualizadoEm': recompensa['atualizadoEm'],
      }),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF6F5FB),
      appBar: AppBar(
        title: const Text('Lojinha'),
        backgroundColor: Colors.white,
        foregroundColor: AppColors.ink,
        actions: [
          IconButton(
            tooltip: 'Atualizar recompensas',
            onPressed: _carregando ? null : _carregar,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _formulario(),
        icon: const Icon(Icons.add),
        label: const Text('Nova recompensa'),
      ),
      body: RefreshIndicator(
        onRefresh: _carregar,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
          children: [
            const Text(
              'Gerencie o catálogo, a disponibilidade e o estoque das recompensas.',
              style: TextStyle(color: AppColors.muted, height: 1.4),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String?>(
              initialValue: _filtro,
              decoration: const InputDecoration(
                labelText: 'Filtrar por status',
                border: OutlineInputBorder(),
                filled: true,
                fillColor: Colors.white,
              ),
              items: const [
                DropdownMenuItem<String?>(value: null, child: Text('Todas')),
                DropdownMenuItem(value: 'publicada', child: Text('Publicadas')),
                DropdownMenuItem(value: 'rascunho', child: Text('Rascunhos')),
                DropdownMenuItem(value: 'inativa', child: Text('Inativas')),
                DropdownMenuItem(value: 'arquivada', child: Text('Arquivadas')),
              ],
              onChanged: (valor) {
                setState(() => _filtro = valor);
                _carregar();
              },
            ),
            if (_erro != null) ...[
              const SizedBox(height: 12),
              _MensagemErro(mensagem: _erro!, onTentar: _carregar),
            ],
            if (_carregando && _recompensas == null)
              const Padding(
                padding: EdgeInsets.all(32),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_recompensas?.isEmpty == true)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 36),
                child: Text(
                  'Nenhuma recompensa neste filtro. Cadastre uma nova para começar.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.muted),
                ),
              )
            else
              for (final recompensa
                  in _recompensas ?? const <Map<String, dynamic>>[]) ...[
                const SizedBox(height: 12),
                _CartaoRecompensa(
                  recompensa: recompensa,
                  ocupado: _ocupado == recompensa['id'],
                  onEditar: () => _formulario(original: recompensa),
                  onEstoque: () => _ajustarEstoque(recompensa),
                  onStatus: () => _mudarStatus(recompensa),
                  onRemover: () => _remover(recompensa),
                ),
              ],
          ],
        ),
      ),
    );
  }
}

class _CartaoRecompensa extends StatelessWidget {
  const _CartaoRecompensa({
    required this.recompensa,
    required this.ocupado,
    required this.onEditar,
    required this.onEstoque,
    required this.onStatus,
    required this.onRemover,
  });

  final Map<String, dynamic> recompensa;
  final bool ocupado;
  final VoidCallback onEditar;
  final VoidCallback onEstoque;
  final VoidCallback onStatus;
  final VoidCallback onRemover;

  @override
  Widget build(BuildContext context) {
    final status = recompensa['status'] as String? ?? '';
    final arquivada = status == 'arquivada';
    final estoque = recompensa['estoque'] is Map
        ? Map<String, dynamic>.from(recompensa['estoque'] as Map)
        : null;
    return Card(
      color: Colors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: AppAccents.cardBorder),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    recompensa['nome'] as String? ?? 'Recompensa',
                    style: const TextStyle(
                      color: AppColors.ink,
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Chip(
                  label: Text(_rotuloStatus(status)),
                  visualDensity: VisualDensity.compact,
                ),
              ],
            ),
            if ((recompensa['descricao'] as String? ?? '').isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                recompensa['descricao'] as String,
                style: const TextStyle(color: AppColors.muted, height: 1.35),
              ),
            ],
            const SizedBox(height: 12),
            Wrap(
              spacing: 14,
              runSpacing: 8,
              children: [
                _InfoRecompensa(
                  icone: Icons.toll_outlined,
                  texto: '${recompensa['custoXp']} moedas',
                ),
                _InfoRecompensa(
                  icone: Icons.inventory_2_outlined,
                  texto: _textoEstoque(estoque),
                ),
                _InfoRecompensa(
                  icone: Icons.people_outline,
                  texto:
                      'Público: ${recompensa['publico'] ?? 'todos'}'
                      '${recompensa['limitePorAluno'] == null ? '' : ' · limite ${recompensa['limitePorAluno']}/aluno'}',
                ),
                if (recompensa['programaCodigo'] != null)
                  _InfoRecompensa(
                    icone: Icons.event_outlined,
                    texto: 'Programa ${recompensa['programaCodigo']}',
                  ),
                if (recompensa['disponivelDe'] != null)
                  _InfoRecompensa(
                    icone: Icons.event_available_outlined,
                    texto: 'Desde ${_formatarData(recompensa['disponivelDe'])}',
                  ),
                if (recompensa['disponivelAte'] != null)
                  _InfoRecompensa(
                    icone: Icons.event_busy_outlined,
                    texto: 'Até ${_formatarData(recompensa['disponivelAte'])}',
                  ),
                _InfoRecompensa(
                  icone: Icons.redeem_outlined,
                  texto: '${recompensa['transacoes'] ?? 0} resgates',
                ),
              ],
            ),
            if (!arquivada) ...[
              const SizedBox(height: 14),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  OutlinedButton.icon(
                    onPressed: ocupado ? null : onEditar,
                    icon: const Icon(Icons.edit_outlined),
                    label: const Text('Editar'),
                  ),
                  OutlinedButton.icon(
                    onPressed: ocupado ? null : onEstoque,
                    icon: const Icon(Icons.inventory_2_outlined),
                    label: const Text('Estoque'),
                  ),
                  OutlinedButton.icon(
                    onPressed: ocupado ? null : onStatus,
                    icon: Icon(
                      status == 'publicada'
                          ? Icons.visibility_off_outlined
                          : Icons.publish_outlined,
                    ),
                    label: Text(
                      status == 'publicada' ? 'Desativar' : 'Publicar',
                    ),
                  ),
                  TextButton.icon(
                    onPressed: ocupado ? null : onRemover,
                    icon: Icon(
                      recompensa['podeExcluir'] == true
                          ? Icons.delete_outline
                          : Icons.archive_outlined,
                    ),
                    label: Text(
                      recompensa['podeExcluir'] == true
                          ? 'Excluir'
                          : 'Arquivar',
                    ),
                    style: TextButton.styleFrom(
                      foregroundColor: const Color(0xFFB42318),
                    ),
                  ),
                ],
              ),
            ],
            if (ocupado)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: LinearProgressIndicator(),
              ),
          ],
        ),
      ),
    );
  }
}

class _InfoRecompensa extends StatelessWidget {
  const _InfoRecompensa({required this.icone, required this.texto});

  final IconData icone;
  final String texto;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(icone, size: 16, color: AppColors.primary),
      const SizedBox(width: 5),
      Text(texto, style: const TextStyle(color: AppColors.muted, fontSize: 12)),
    ],
  );
}

class _MensagemErro extends StatelessWidget {
  const _MensagemErro({required this.mensagem, required this.onTentar});

  final String mensagem;
  final VoidCallback onTentar;

  @override
  Widget build(BuildContext context) => Card(
    color: const Color(0xFFFFF1F1),
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          Expanded(
            child: Text(
              mensagem,
              style: const TextStyle(color: Color(0xFFB42318)),
            ),
          ),
          TextButton(
            onPressed: onTentar,
            child: const Text('Tentar novamente'),
          ),
        ],
      ),
    ),
  );
}

class FormularioRecompensaCoord extends StatefulWidget {
  const FormularioRecompensaCoord({
    super.key,
    required this.api,
    required this.programas,
    required this.original,
    this.erroProgramas,
  });

  final CoordenacaoApi api;
  final List<Map<String, dynamic>> programas;
  final Map<String, dynamic>? original;
  final String? erroProgramas;

  @override
  State<FormularioRecompensaCoord> createState() =>
      _FormularioRecompensaCoordState();
}

class _FormularioRecompensaCoordState extends State<FormularioRecompensaCoord> {
  final _formKey = GlobalKey<FormState>();
  late final _nome = TextEditingController(
    text: widget.original?['nome'] as String? ?? '',
  );
  late final _descricao = TextEditingController(
    text: widget.original?['descricao'] as String? ?? '',
  );
  late final _imagem = TextEditingController(
    text: widget.original?['imagemUrl'] as String? ?? '',
  );
  late final _custo = TextEditingController(
    text: widget.original?['custoXp']?.toString() ?? '',
  );
  late final _condicoes = TextEditingController(
    text: widget.original?['condicoesRetirada'] as String? ?? '',
  );
  late final _estoqueInicial = TextEditingController();
  late final _limite = TextEditingController(
    text: widget.original?['limitePorAluno']?.toString() ?? '',
  );
  late bool _estoqueIlimitado =
      (widget.original?['estoque'] as Map?)?['ilimitado'] == true;
  late String _publico = widget.original?['publico'] as String? ?? 'todos';
  late String? _programa = widget.original?['programaCodigo'] as String?;
  late DateTime? _disponivelDe = _lerData(
    widget.original?['disponivelDe'] as String?,
  );
  late DateTime? _disponivelAte = _lerData(
    widget.original?['disponivelAte'] as String?,
  );
  late final _disponivelDeTexto = TextEditingController(
    text: _disponivelDe == null
        ? ''
        : formatarDataHoraLocalRecompensa(_disponivelDe!),
  );
  late final _disponivelAteTexto = TextEditingController(
    text: _disponivelAte == null
        ? ''
        : formatarDataHoraLocalRecompensa(_disponivelAte!),
  );
  bool _publicar = false;
  bool _salvando = false;
  String? _erro;
  String? _erroVigencia;

  bool get _criando => widget.original == null;

  DateTime? _lerData(String? valor) => lerDataHoraRecompensa(valor);

  @override
  void dispose() {
    _nome.dispose();
    _descricao.dispose();
    _imagem.dispose();
    _custo.dispose();
    _condicoes.dispose();
    _estoqueInicial.dispose();
    _limite.dispose();
    _disponivelDeTexto.dispose();
    _disponivelAteTexto.dispose();
    super.dispose();
  }

  String? _obrigatorio(String? valor, String campo, {int? max}) {
    return validarTextoRecompensa(valor, campo, maximo: max);
  }

  String _iso(DateTime? data) => dataHoraLocalParaIsoRecompensa(data) ?? '';

  Future<void> _selecionarData(bool inicio) async {
    final atual = inicio ? _disponivelDe : _disponivelAte;
    final agora = DateTime.now();
    final dia = await showDatePicker(
      context: context,
      initialDate: atual ?? agora,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
      helpText: inicio ? 'Selecione a data inicial' : 'Selecione a data final',
      cancelText: 'Cancelar',
      confirmText: 'Próximo',
    );
    if (dia == null || !mounted) return;
    final horaAtual = atual ?? agora;
    final hora = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(horaAtual),
      helpText: 'Selecione o horário',
      cancelText: 'Cancelar',
      confirmText: 'Aplicar',
    );
    if (hora == null || !mounted) return;
    final selecionada = combinarDataHoraRecompensa(dia, hora);
    setState(() {
      if (inicio) {
        _disponivelDe = selecionada;
        _disponivelDeTexto.text = formatarDataHoraLocalRecompensa(selecionada);
      } else {
        _disponivelAte = selecionada;
        _disponivelAteTexto.text = formatarDataHoraLocalRecompensa(selecionada);
      }
      _erroVigencia = null;
    });
  }

  Future<void> _salvar() async {
    setState(() {
      _erro = null;
      _erroVigencia = null;
    });
    if (!_formKey.currentState!.validate()) return;
    final erroVigencia = validarVigenciaRecompensa(
      inicio: _disponivelDe,
      fim: _disponivelAte,
      publicar: _publicar,
      criando: _criando,
    );
    if (erroVigencia != null) {
      setState(() => _erroVigencia = erroVigencia);
      return;
    }

    final custo = int.parse(_custo.text.trim());
    final limiteTexto = _limite.text.trim();
    final imagemTexto = _imagem.text.trim();
    final de = _iso(_disponivelDe);
    final ate = _iso(_disponivelAte);
    final dados = <String, dynamic>{};
    if (_criando) {
      dados.addAll({
        'nome': _nome.text.trim(),
        'descricao': _descricao.text.trim(),
        'custoXp': custo,
        'condicoesRetirada': _condicoes.text.trim(),
        'estoqueIlimitado': _estoqueIlimitado,
        'publico': _publico,
        'publicar': _publicar,
        if (!_estoqueIlimitado)
          'estoqueInicial': int.parse(_estoqueInicial.text.trim()),
      });
      if (imagemTexto.isNotEmpty) dados['imagemUrl'] = imagemTexto;
      if (limiteTexto.isNotEmpty) {
        dados['limitePorAluno'] = int.parse(limiteTexto);
      }
      if (_programa != null) dados['programaCodigo'] = _programa;
      if (de.isNotEmpty) dados['disponivelDe'] = de;
      if (ate.isNotEmpty) dados['disponivelAte'] = ate;
    } else {
      final original = widget.original!;
      final estoque = original['estoque'] as Map?;
      if (_nome.text.trim() != original['nome']) {
        dados['nome'] = _nome.text.trim();
      }
      if (_descricao.text.trim() != original['descricao']) {
        dados['descricao'] = _descricao.text.trim();
      }
      if (imagemTexto != (original['imagemUrl'] as String? ?? '')) {
        dados['imagemUrl'] = imagemTexto.isEmpty ? null : imagemTexto;
      }
      if (custo != original['custoXp']) dados['custoXp'] = custo;
      if (_condicoes.text.trim() != original['condicoesRetirada']) {
        dados['condicoesRetirada'] = _condicoes.text.trim();
      }
      final limiteAtual = original['limitePorAluno'] as int?;
      final limiteNovo = limiteTexto.isEmpty ? null : int.parse(limiteTexto);
      if (limiteNovo != limiteAtual) dados['limitePorAluno'] = limiteNovo;
      if (_publico != original['publico']) dados['publico'] = _publico;
      final programaAtual = original['programaCodigo'] as String?;
      if (_programa != programaAtual) dados['programaCodigo'] = _programa;
      if (!_mesmaData(_disponivelDe, original['disponivelDe'] as String?)) {
        dados['disponivelDe'] = de.isEmpty ? null : de;
      }
      if (!_mesmaData(_disponivelAte, original['disponivelAte'] as String?)) {
        dados['disponivelAte'] = ate.isEmpty ? null : ate;
      }
      if (estoque == null) {
        setState(() => _erro = 'Não foi possível carregar o estoque atual.');
        return;
      }
      dados['atualizadoEm'] = original['atualizadoEm'];
      if (dados.length == 1) {
        setState(() => _erro = 'Nenhuma alteração para salvar.');
        return;
      }
    }

    setState(() => _salvando = true);
    try {
      if (_criando) {
        await widget.api.criarRecompensa(dados);
      } else {
        await widget.api.atualizarRecompensa(
          widget.original!['id'] as String,
          dados,
        );
      }
      if (mounted) Navigator.of(context).pop(true);
    } catch (erro) {
      if (mounted) setState(() => _erro = erro.toString());
    } finally {
      if (mounted) setState(() => _salvando = false);
    }
  }

  bool _mesmaData(DateTime? nova, String? original) {
    final anterior = _lerData(original);
    if (nova == null || anterior == null) {
      return nova == null && anterior == null;
    }
    return nova.isAtSameMomentAs(anterior);
  }

  Widget _campoData(String rotulo, DateTime? valor, bool inicio) {
    final controller = inicio ? _disponivelDeTexto : _disponivelAteTexto;
    return TextFormField(
      key: ValueKey(inicio ? 'recompensa-data-de' : 'recompensa-data-ate'),
      controller: controller,
      enabled: !_salvando,
      keyboardType: TextInputType.number,
      inputFormatters: const [MascaraDataHoraRecompensa()],
      decoration: InputDecoration(
        labelText: '$rotulo (opcional)',
        hintText: placeholderDataHoraRecompensa,
        border: const OutlineInputBorder(),
        suffixIcon: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (controller.text.isNotEmpty)
              IconButton(
                tooltip: 'Limpar $rotulo',
                onPressed: _salvando
                    ? null
                    : () => setState(() {
                        if (inicio) {
                          _disponivelDe = null;
                          _disponivelDeTexto.clear();
                        } else {
                          _disponivelAte = null;
                          _disponivelAteTexto.clear();
                        }
                        _erroVigencia = null;
                      }),
                icon: const Icon(Icons.clear),
              ),
            IconButton(
              tooltip: 'Selecionar data e horário de $rotulo',
              onPressed: _salvando ? null : () => _selecionarData(inicio),
              icon: const Icon(Icons.calendar_month_outlined),
            ),
          ],
        ),
      ),
      validator: validarDataHoraDigitadaRecompensa,
      onChanged: (_) {
        final valorAtual = controller.value;
        final formatado = const MascaraDataHoraRecompensa().formatEditUpdate(
          valorAtual,
          valorAtual,
        );
        if (formatado != valorAtual) {
          controller.value = formatado;
        }
        final selecionada = lerDataHoraDigitadaRecompensa(formatado.text);
        setState(() {
          if (inicio) {
            _disponivelDe = selecionada;
          } else {
            _disponivelAte = selecionada;
          }
          _erroVigencia = null;
        });
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final programaAtualInexistente =
        _programa != null &&
        !widget.programas.any((p) => p['codigo'] == _programa);
    final programas = [
      if (programaAtualInexistente)
        DropdownMenuItem<String?>(value: _programa, child: Text(_programa!)),
      ...widget.programas.map(
        (p) => DropdownMenuItem<String?>(
          value: p['codigo'] as String,
          child: Text(
            '${p['codigo']}${p['titulo'] == null ? '' : ' — ${p['titulo']}'}',
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ),
    ];

    return Scaffold(
      backgroundColor: const Color(0xFFF6F5FB),
      appBar: AppBar(
        title: Text(_criando ? 'Nova recompensa' : 'Editar recompensa'),
        backgroundColor: Colors.white,
        foregroundColor: AppColors.ink,
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
          children: [
            if (_erro != null) ...[
              _MensagemErro(
                mensagem: _erro!,
                onTentar: () => setState(() => _erro = null),
              ),
              const SizedBox(height: 12),
            ],
            TextFormField(
              controller: _nome,
              maxLength: 120,
              decoration: const InputDecoration(
                labelText: 'Nome *',
                border: OutlineInputBorder(),
              ),
              validator: (v) => _obrigatorio(v, 'o nome', max: 120),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _descricao,
              maxLength: 2000,
              minLines: 2,
              maxLines: 5,
              decoration: const InputDecoration(
                labelText: 'Descrição *',
                alignLabelWithHint: true,
                border: OutlineInputBorder(),
              ),
              validator: (v) => _obrigatorio(v, 'a descrição', max: 2000),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _imagem,
              maxLength: 500,
              keyboardType: TextInputType.url,
              decoration: const InputDecoration(
                labelText: 'Imagem (URL https, opcional)',
                border: OutlineInputBorder(),
              ),
              validator: validarUrlImagemRecompensa,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _custo,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Custo em moedas *',
                border: OutlineInputBorder(),
              ),
              validator: validarCustoMoedasRecompensa,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _condicoes,
              maxLength: 2000,
              minLines: 2,
              maxLines: 5,
              decoration: const InputDecoration(
                labelText: 'Condições de retirada *',
                alignLabelWithHint: true,
                border: OutlineInputBorder(),
              ),
              validator: (v) =>
                  _obrigatorio(v, 'as condições de retirada', max: 2000),
            ),
            const SizedBox(height: 12),
            if (_criando) ...[
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Estoque ilimitado'),
                subtitle: const Text('Para itens sem quantidade definida.'),
                value: _estoqueIlimitado,
                onChanged: _salvando
                    ? null
                    : (valor) => setState(() => _estoqueIlimitado = valor),
              ),
              if (!_estoqueIlimitado)
                TextFormField(
                  controller: _estoqueInicial,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Estoque inicial *',
                    border: OutlineInputBorder(),
                  ),
                  validator: (v) => validarEstoqueInicialRecompensa(
                    v,
                    ilimitado: _estoqueIlimitado,
                  ),
                ),
              const SizedBox(height: 12),
            ],
            DropdownButtonFormField<String>(
              initialValue: _publico,
              decoration: const InputDecoration(
                labelText: 'Público *',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(
                  value: 'todos',
                  child: Text('Todos os alunos'),
                ),
                DropdownMenuItem(value: 'padrinhos', child: Text('Padrinhos')),
                DropdownMenuItem(
                  value: 'apadrinhados',
                  child: Text('Apadrinhados'),
                ),
              ],
              onChanged: _salvando
                  ? null
                  : (v) => setState(() => _publico = v ?? 'todos'),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String?>(
              initialValue: _programa,
              decoration: const InputDecoration(
                labelText: 'Programa (opcional)',
                border: OutlineInputBorder(),
              ),
              items: [
                const DropdownMenuItem<String?>(
                  value: null,
                  child: Text('Todos os programas'),
                ),
                ...programas,
              ],
              onChanged: _salvando
                  ? null
                  : (v) => setState(() => _programa = v),
            ),
            if (widget.erroProgramas != null) ...[
              const SizedBox(height: 6),
              Text(
                'Não foi possível carregar programas; o cadastro ainda pode ser feito para todos. ${widget.erroProgramas}',
                style: const TextStyle(color: AppColors.muted, fontSize: 12),
              ),
            ],
            const SizedBox(height: 12),
            TextFormField(
              controller: _limite,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Limite por aluno (opcional)',
                border: OutlineInputBorder(),
              ),
              validator: validarLimiteRecompensa,
            ),
            const SizedBox(height: 12),
            _campoData('Disponível a partir de', _disponivelDe, true),
            const SizedBox(height: 12),
            _campoData('Disponível até', _disponivelAte, false),
            if (_erroVigencia != null) ...[
              const SizedBox(height: 6),
              Text(
                _erroVigencia!,
                style: const TextStyle(color: Color(0xFFB42318)),
              ),
            ],
            if (_criando)
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Publicar agora'),
                subtitle: const Text(
                  'Desligado, a recompensa será salva como rascunho.',
                ),
                value: _publicar,
                onChanged: _salvando
                    ? null
                    : (valor) => setState(() => _publicar = valor),
              ),
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: _salvando ? null : _salvar,
              icon: _salvando
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.save_outlined),
              label: Text(_salvando ? 'Salvando…' : 'Salvar recompensa'),
            ),
          ],
        ),
      ),
    );
  }
}

class _AjusteEstoqueDialog extends StatefulWidget {
  const _AjusteEstoqueDialog({required this.recompensa});

  final Map<String, dynamic> recompensa;

  @override
  State<_AjusteEstoqueDialog> createState() => _AjusteEstoqueDialogState();
}

class _AjusteEstoqueDialogState extends State<_AjusteEstoqueDialog> {
  final _formKey = GlobalKey<FormState>();
  final _quantidade = TextEditingController();
  final _motivo = TextEditingController();
  late final bool _ilimitado =
      (widget.recompensa['estoque'] as Map?)?['ilimitado'] == true;
  late String _tipo = _ilimitado ? 'limitado' : 'reposicao';

  @override
  void dispose() {
    _quantidade.dispose();
    _motivo.dispose();
    super.dispose();
  }

  void _enviar() {
    if (!_formKey.currentState!.validate()) return;
    Navigator.pop(context, {
      'tipo': _tipo,
      if (_tipo != 'ilimitado')
        'quantidade': int.parse(_quantidade.text.trim()),
      'motivo': _motivo.text.trim(),
    });
  }

  @override
  Widget build(BuildContext context) {
    final tipos = _ilimitado
        ? const {'limitado': 'Passar a estoque limitado'}
        : const {
            'reposicao': 'Reposição (somar unidades)',
            'correcao': 'Correção (definir novo total)',
            'ilimitado': 'Passar a estoque ilimitado',
          };
    final estoque = widget.recompensa['estoque'] as Map?;
    final comprometido = estoque?['comprometido'] as int? ?? 0;
    return AlertDialog(
      title: const Text('Ajustar estoque'),
      content: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: _tipo,
                decoration: const InputDecoration(
                  labelText: 'Tipo de ajuste *',
                  border: OutlineInputBorder(),
                ),
                items: tipos.entries
                    .map(
                      (e) =>
                          DropdownMenuItem(value: e.key, child: Text(e.value)),
                    )
                    .toList(),
                onChanged: (v) => setState(() => _tipo = v ?? _tipo),
              ),
              if (_tipo != 'ilimitado') ...[
                const SizedBox(height: 12),
                TextFormField(
                  controller: _quantidade,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Quantidade *',
                    helperText: _tipo == 'correcao' || _tipo == 'limitado'
                        ? 'O total não pode ser inferior a $comprometido unidade(s) comprometida(s).'
                        : null,
                    border: const OutlineInputBorder(),
                  ),
                  validator: (v) {
                    final quantidade = int.tryParse(v?.trim() ?? '');
                    if (quantidade == null ||
                        quantidade <
                            (_tipo == 'reposicao' ? 1 : comprometido) ||
                        quantidade > 100000) {
                      return 'Informe uma quantidade válida (até 100.000).';
                    }
                    return null;
                  },
                ),
              ],
              const SizedBox(height: 12),
              TextFormField(
                controller: _motivo,
                maxLength: 300,
                minLines: 2,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Motivo *',
                  border: OutlineInputBorder(),
                ),
                validator: (v) {
                  final texto = v?.trim() ?? '';
                  if (texto.length < 3) {
                    return 'Informe um motivo (mínimo 3 caracteres).';
                  }
                  if (texto.length > 300) {
                    return 'Use no máximo 300 caracteres.';
                  }
                  return null;
                },
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancelar'),
        ),
        FilledButton(onPressed: _enviar, child: const Text('Salvar ajuste')),
      ],
    );
  }
}
