import 'package:flutter/material.dart';

import '../services/coordenacao_api.dart';
import '../theme/colors.dart';
import 'componentes_coord.dart';

const datasPrograma = {
  'inscricoesInicio': 'Início das inscrições',
  'inscricoesFim': 'Fim das inscrições',
  'analiseInicio': 'Início da análise',
  'analiseFim': 'Fim da análise',
  'formacaoInicio': 'Início da formação dos grupos',
  'formacaoFim': 'Fim da formação dos grupos',
  'andamentoInicio': 'Início das atividades',
  'andamentoFim': 'Fim das atividades',
  'encerramentoEm': 'Encerramento',
};

bool dataCivilValida(String valor) {
  final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(valor);
  if (match == null) return false;
  final ano = int.parse(match.group(1)!);
  final mes = int.parse(match.group(2)!);
  final dia = int.parse(match.group(3)!);
  if (ano < 2000 || ano > 2100) return false;
  final data = DateTime.utc(ano, mes, dia);
  return data.year == ano && data.month == mes && data.day == dia;
}

String formatarDataBr(DateTime data) =>
    '${data.day.toString().padLeft(2, '0')}/${data.month.toString().padLeft(2, '0')}/${data.year.toString().padLeft(4, '0')}';

/// Aceita dia/mês/ano ou o formato da API e devolve AAAA-MM-DD.
String? normalizarDataPrograma(String texto) {
  final bruto = texto.trim();
  if (bruto.isEmpty) return '';
  final br = RegExp(r'^(\d{2})/(\d{2})/(\d{4})$').firstMatch(bruto);
  final iso = br == null ? bruto : '${br.group(3)}-${br.group(2)}-${br.group(1)}';
  return dataCivilValida(iso) ? iso : null;
}

String exibirDataPrograma(String valor) {
  final iso = normalizarDataPrograma(valor);
  if (iso == null || iso.isEmpty) return valor;
  final partes = iso.split('-');
  return '${partes[2]}/${partes[1]}/${partes[0]}';
}

/// Sugestão visível para um ciclo novo. Só vale depois que a coordenação confirma.
Map<String, String> sugestaoCronograma(String codigo) {
  final partes = codigo.split('/');
  final ano = partes.first;
  final primeiro = partes.length > 1 && partes[1] == '1';
  String dia(String mes, String d) => '$ano-$mes-$d';
  return primeiro
      ? {
          'inscricoesInicio': dia('02', '01'),
          'inscricoesFim': dia('02', '28'),
          'analiseInicio': dia('03', '01'),
          'analiseFim': dia('03', '30'),
          'formacaoInicio': dia('04', '01'),
          'formacaoFim': dia('04', '20'),
          'andamentoInicio': dia('04', '21'),
          'andamentoFim': dia('06', '15'),
          'encerramentoEm': dia('06', '20'),
        }
      : {
          'inscricoesInicio': dia('08', '01'),
          'inscricoesFim': dia('08', '28'),
          'analiseInicio': dia('09', '01'),
          'analiseFim': dia('09', '30'),
          'formacaoInicio': dia('10', '01'),
          'formacaoFim': dia('10', '20'),
          'andamentoInicio': dia('10', '21'),
          'andamentoFim': dia('12', '15'),
          'encerramentoEm': dia('12', '20'),
        };
}

String? validarCronogramaPrograma(Map<String, String> datas, {bool completo = false}) {
  String? anterior;
  String? rotuloAnterior;
  for (final entry in datasPrograma.entries) {
    final valor = datas[entry.key] ?? '';
    if (valor.isEmpty) {
      if (completo) return 'Informe ${entry.value.toLowerCase()}.';
      continue;
    }
    if (!dataCivilValida(valor)) {
      return 'Data inválida: ${entry.value}. Use DD/MM/AAAA (2000 a 2100).';
    }
    if (anterior != null && valor.compareTo(anterior) < 0) {
      return 'Ordem do cronograma inválida: ${entry.value} deve ser igual ou posterior a ${rotuloAnterior!.toLowerCase()}.';
    }
    anterior = valor;
    rotuloAnterior = entry.value;
  }
  return null;
}

/// O mesmo formulário revisa a criação e configura um ciclo existente.
class ConfigurarPrograma extends StatefulWidget {
  const ConfigurarPrograma({super.key, required this.api, required this.programa, this.novo = false});
  final CoordenacaoApi api;
  final Map<String, dynamic> programa;
  final bool novo;
  @override
  State<ConfigurarPrograma> createState() => _ConfigurarProgramaState();
}

class _ConfigurarProgramaState extends State<ConfigurarPrograma> {
  late final _datas = {
    for (final chave in datasPrograma.keys)
      chave: TextEditingController(text: exibirDataPrograma('${(widget.programa['datas'] as Map?)?[chave] ?? ''}')),
  };
  late final _requisitos = (widget.programa['requisitosPadrinho'] as List? ?? [])
      .whereType<Map>().map((r) => Map<String, dynamic>.from(r)).toList();
  late String _etapa = widget.programa['etapaAtual'] as String? ?? 'inscricoes';
  late bool _inscricoes = widget.novo || widget.programa['inscricoesAbertas'] == true;
  late bool _matching = widget.programa['matchingPendente'] == true;
  late final _vagas = TextEditingController(text: '${widget.programa['vagasApadrinhados'] ?? 80}');
  late final _grupos = TextEditingController(text: '${widget.programa['gruposPrevistos'] ?? 25}');
  bool _salvando = false;
  String? _erro;
  bool get _requisitosBloqueados => !widget.novo && widget.programa['etapaAtual'] == 'encerramento';

  @override
  void dispose() {
    for (final c in _datas.values) { c.dispose(); }
    _vagas.dispose(); _grupos.dispose();
    super.dispose();
  }

  Future<void> _salvar() async {
    if (_salvando) return;
    final datas = <String, String>{};
    String? erro;
    for (final entrada in _datas.entries) {
      final iso = normalizarDataPrograma(entrada.value.text);
      if (iso == null) {
        erro = 'Data inválida: ${datasPrograma[entrada.key]}. Use DD/MM/AAAA (2000 a 2100).';
        datas[entrada.key] = entrada.value.text.trim();
      } else {
        datas[entrada.key] = iso;
      }
    }
    erro ??= validarCronogramaPrograma(datas, completo: widget.novo);
    final descricoes = <String>{};
    if (!_requisitosBloqueados) {
      for (final r in _requisitos) {
        final descricao = '${r['descricao'] ?? ''}'.trim();
        if (descricao.isEmpty) erro ??= 'Preencha a descrição de todos os requisitos.';
        if (!descricoes.add(descricao.toLowerCase())) erro ??= 'Existem requisitos repetidos.';
      }
    }
    final vagas = int.tryParse(_vagas.text);
    final grupos = int.tryParse(_grupos.text);
    if (vagas == null || grupos == null || vagas < 0 || grupos < 0 || vagas > 10000 || grupos > 10000) {
      erro ??= 'Vagas e grupos devem ser números inteiros entre 0 e 10000.';
    }
    if (erro != null) { setState(() => _erro = erro); return; }
    final corpo = <String, dynamic>{
      for (final e in datas.entries) if (e.value.isNotEmpty) e.key: e.value,
      if (!_requisitosBloqueados) 'requisitosPadrinho': _requisitos,
      if (!widget.novo) ...{
        'etapaAtual': _etapa, 'inscricoesAbertas': _inscricoes,
        'matchingPendente': _matching, 'vagasApadrinhados': vagas, 'gruposPrevistos': grupos,
      },
    };
    // Campo existente não pode ser apagado por acidente ao esvaziar o input.
    for (final chave in datasPrograma.keys) {
      if (!widget.novo && (widget.programa['datas'] as Map?)?[chave] != null && datas[chave]!.isEmpty) {
        setState(() => _erro = 'Informe ${datasPrograma[chave]!.toLowerCase()}; a data existente será preservada.');
        return;
      }
    }
    setState(() { _salvando = true; _erro = null; });
    try {
      final codigo = '${widget.programa['codigo']}';
      final salvo = widget.novo ? await widget.api.criarPrograma(codigo, corpo)
          : await widget.api.atualizarPrograma(codigo, corpo);
      if (mounted) Navigator.pop(context, salvo);
    } catch (e) {
      if (mounted) setState(() { _salvando = false; _erro = mensagemDeErro(e); });
    }
  }

  Future<void> _escolherData(String chave) async {
    final iso = normalizarDataPrograma(_datas[chave]!.text);
    final partes = iso == null || iso.isEmpty ? null : iso.split('-').map(int.parse).toList();
    final atual = partes == null ? null : DateTime(partes[0], partes[1], partes[2]);
    final escolhida = await showDatePicker(
      context: context,
      locale: const Locale('pt', 'BR'),
      helpText: 'Selecionar data',
      cancelText: 'Cancelar',
      confirmText: 'OK',
      initialDate: atual,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100, 12, 31),
    );
    if (escolhida != null) {
      _datas[chave]!.text = formatarDataBr(escolhida);
    }
  }

  @override
  Widget build(BuildContext context) {
    final abaixo = MediaQuery.viewInsetsOf(context).bottom + MediaQuery.paddingOf(context).bottom;
    return SafeArea(
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.92,
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(20, 4, 20, 20 + abaixo),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _CabecalhoCiclo(codigo: '${widget.programa['codigo']}', novo: widget.novo),
              for (final fase in _fasesCiclo) _CardFase(
                fase: fase,
                campo: _campoData,
              ),
              _cardRequisitos(),
              if (!widget.novo) _cardAjustes(),
              if (_erro != null)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(_erro!, key: const ValueKey('erro-configuracao'), style: const TextStyle(color: Colors.red)),
                ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _salvando ? null : _salvar,
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  minimumSize: const Size.fromHeight(48),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                child: Text(_salvando ? 'Salvando...' : widget.novo ? 'Confirmar criação' : 'Salvar programa'),
              ),
              TextButton(
                onPressed: _salvando ? null : () => Navigator.pop(context),
                child: const Text('Cancelar'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _campoData(String chave) {
    final rotulo = datasPrograma[chave]!;
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: _salvando ? null : () => _escolherData(chave),
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppAccents.cardBorder),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(rotulo, style: const TextStyle(fontSize: 12, color: AppColors.muted, height: 1.2)),
                    TextFormField(
                      key: ValueKey(chave),
                      controller: _datas[chave],
                      enabled: !_salvando,
                      keyboardType: TextInputType.datetime,
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.ink),
                      decoration: const InputDecoration(
                        isDense: true,
                        hintText: 'DD/MM/AAAA',
                        border: InputBorder.none,
                        contentPadding: EdgeInsets.zero,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'Escolher ${rotulo.toLowerCase()}',
                onPressed: _salvando ? null : () => _escolherData(chave),
                icon: const Icon(Icons.calendar_month, color: AppColors.primary),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _cardRequisitos() {
    return _CardSecao(
      icone: Icons.person_outline,
      titulo: 'Requisitos para padrinho',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_requisitosBloqueados)
            const Text('Ciclo encerrado: os requisitos são históricos e não podem ser alterados.'),
          if (widget.novo)
            const Text(
              'Revise os requisitos deste ciclo antes de confirmar. Uma lista vazia significa nenhum requisito de disciplina.',
              style: TextStyle(color: AppColors.muted, height: 1.35),
            ),
          for (final r in _requisitos)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Row(
                key: ObjectKey(r),
                children: [
                  Expanded(
                    child: TextFormField(
                      initialValue: '${r['descricao'] ?? ''}',
                      maxLength: 120,
                      enabled: !_requisitosBloqueados && !_salvando,
                      decoration: const InputDecoration(labelText: 'Descrição do requisito'),
                      onChanged: (v) => r['descricao'] = v,
                    ),
                  ),
                  Checkbox(
                    value: r['obrigatorio'] != false,
                    semanticLabel: 'Requisito obrigatório',
                    onChanged: _requisitosBloqueados || _salvando ? null : (v) => setState(() => r['obrigatorio'] = v),
                  ),
                  IconButton(
                    tooltip: 'Remover requisito',
                    onPressed: _requisitosBloqueados || _salvando ? null : () => setState(() => _requisitos.remove(r)),
                    icon: const Icon(Icons.delete_outline),
                  ),
                ],
              ),
            ),
          if (!_requisitosBloqueados)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: _salvando || _requisitos.length >= 20
                    ? null
                    : () => setState(() => _requisitos.add({'descricao': '', 'obrigatorio': true})),
                icon: const Icon(Icons.add),
                label: const Text('Adicionar requisito'),
              ),
            ),
        ],
      ),
    );
  }

  Widget _cardAjustes() {
    return _CardSecao(
      icone: Icons.tune,
      titulo: 'Ajustes do ciclo',
      child: Column(
        children: [
          DropdownButtonFormField<String>(
            initialValue: _etapa,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Etapa atual'),
            items: const [
              DropdownMenuItem(value: 'inscricoes', child: Text('Inscrições')),
              DropdownMenuItem(value: 'analise', child: Text('Análise')),
              DropdownMenuItem(value: 'formacao', child: Text('Formação dos grupos')),
              DropdownMenuItem(value: 'andamento', child: Text('Programa em andamento')),
              DropdownMenuItem(value: 'encerramento', child: Text('Encerramento')),
            ],
            onChanged: _salvando ? null : (v) => setState(() => _etapa = v!),
          ),
          _Interruptor(
            titulo: 'Inscrições abertas',
            valor: _inscricoes,
            onChanged: _salvando ? null : (v) => setState(() => _inscricoes = v),
          ),
          _Interruptor(
            titulo: 'Matching pendente',
            valor: _matching,
            onChanged: _salvando ? null : (v) => setState(() => _matching = v),
          ),
          TextField(
            controller: _vagas,
            enabled: !_salvando,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Vagas para apadrinhados'),
          ),
          TextField(
            controller: _grupos,
            enabled: !_salvando,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Grupos previstos'),
          ),
        ],
      ),
    );
  }
}

class _Interruptor extends StatelessWidget {
  const _Interruptor({required this.titulo, required this.valor, required this.onChanged});
  final String titulo;
  final bool valor;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: Text(titulo, style: const TextStyle(color: AppColors.ink))),
        Switch(value: valor, onChanged: onChanged),
      ],
    );
  }
}

class _FaseCiclo {
  const _FaseCiclo(this.titulo, this.icone, this.campos);
  final String titulo;
  final IconData icone;
  final List<String> campos;
}

const _fasesCiclo = [
  _FaseCiclo('Inscrições', Icons.description_outlined, ['inscricoesInicio', 'inscricoesFim']),
  _FaseCiclo('Análise', Icons.search, ['analiseInicio', 'analiseFim']),
  _FaseCiclo('Formação dos grupos', Icons.groups_outlined, ['formacaoInicio', 'formacaoFim']),
  _FaseCiclo('Atividades', Icons.rocket_launch_outlined, ['andamentoInicio', 'andamentoFim']),
  _FaseCiclo('Encerramento', Icons.flag_outlined, ['encerramentoEm']),
];

class _CabecalhoCiclo extends StatelessWidget {
  const _CabecalhoCiclo({required this.codigo, required this.novo});
  final String codigo;
  final bool novo;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            color: AppColors.lavender,
            borderRadius: BorderRadius.circular(14),
          ),
          child: const Icon(Icons.calendar_month, color: AppColors.primary),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${novo ? 'Revisar novo ciclo' : 'Configurar programa'} $codigo',
                style: const TextStyle(
                  fontFamily: 'Poppins',
                  fontWeight: FontWeight.w800,
                  fontSize: 22,
                  color: AppColors.ink,
                  height: 1.15,
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'Defina o cronograma na ordem: inscrições → análise → formação → atividades → encerramento. Nenhuma data é ajustada automaticamente.',
                style: TextStyle(color: AppColors.muted, height: 1.35),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _CardFase extends StatelessWidget {
  const _CardFase({required this.fase, required this.campo});
  final _FaseCiclo fase;
  final Widget Function(String chave) campo;

  @override
  Widget build(BuildContext context) {
    return _CardSecao(
      icone: fase.icone,
      titulo: fase.titulo,
      child: LayoutBuilder(
        builder: (context, limites) {
          final ladoALado = fase.campos.length > 1 && limites.maxWidth >= 340;
          if (!ladoALado) {
            return Column(
              children: [
                for (var i = 0; i < fase.campos.length; i++) ...[
                  if (i > 0) const SizedBox(height: 8),
                  campo(fase.campos[i]),
                ],
              ],
            );
          }
          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (var i = 0; i < fase.campos.length; i++) ...[
                if (i > 0) const SizedBox(width: 10),
                Expanded(child: campo(fase.campos[i])),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _CardSecao extends StatelessWidget {
  const _CardSecao({required this.icone, required this.titulo, required this.child});
  final IconData icone;
  final String titulo;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 14),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFBF9FF),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppAccents.cardBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: const BoxDecoration(color: AppColors.lavender, shape: BoxShape.circle),
                child: Icon(icone, color: AppColors.primary, size: 18),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  titulo,
                  style: const TextStyle(
                    fontFamily: 'Poppins',
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                    color: AppColors.ink,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}
