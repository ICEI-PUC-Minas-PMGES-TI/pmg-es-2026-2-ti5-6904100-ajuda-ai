import 'package:campus_map/campus_map.dart';
import 'package:flutter/material.dart';

import '../services/coordenacao_api.dart';
import '../theme/colors.dart';

const xpTotemMin = 1;
const xpTotemMax = 1000;
const raioTotemMin = 10.0;
const raioTotemMax = 200.0;

typedef ConstrutorSeletorTotem = Widget Function(
  BuildContext context, {
  required CampusMapPoint? selecionado,
  required ValueChanged<CampusMapPoint> onChanged,
  required Map<String, dynamic>? campus,
  required List<CampusMapPoint> outros,
});

String? validarFormularioTotem({
  required String nome,
  required String xp,
  required String raio,
  required CampusMapPoint? ponto,
}) {
  if (nome.trim().isEmpty) return 'Informe o nome do totem.';
  if (nome.trim().length > 120) {
    return 'O nome deve ter no máximo 120 caracteres.';
  }
  final xpNumero = int.tryParse(xp.trim());
  if (xpNumero == null || xpNumero < xpTotemMin || xpNumero > xpTotemMax) {
    return 'O XP deve ser um número inteiro entre 1 e 1000.';
  }
  final raioNumero = double.tryParse(raio.trim().replaceAll(',', '.'));
  if (raioNumero == null ||
      raioNumero < raioTotemMin ||
      raioNumero > raioTotemMax) {
    return 'O raio deve estar entre 10 e 200 metros.';
  }
  if (ponto == null) return 'Escolha a posição do totem no mapa.';
  if (!ponto.latitude.isFinite ||
      !ponto.longitude.isFinite ||
      ponto.latitude < -90 ||
      ponto.latitude > 90 ||
      ponto.longitude < -180 ||
      ponto.longitude > 180) {
    return 'A posição escolhida é inválida.';
  }
  return null;
}

Map<String, dynamic> corpoCriacaoTotem({
  required String nome,
  required String xp,
  required String raio,
  required CampusMapPoint ponto,
}) => {
  'nome': nome.trim(),
  'xp': int.parse(xp.trim()),
  'raioMetros': double.parse(raio.trim().replaceAll(',', '.')),
  'latitude': ponto.latitude,
  'longitude': ponto.longitude,
  'ativo': true,
};

Map<String, dynamic> camposAlteradosTotem(
  Map<String, dynamic> original, {
  required String nome,
  required String xp,
  required String raio,
  required CampusMapPoint ponto,
}) {
  final campos = <String, dynamic>{};
  final nomeLimpo = nome.trim();
  final xpNumero = int.parse(xp.trim());
  final raioNumero = double.parse(raio.trim().replaceAll(',', '.'));
  if (nomeLimpo != original['nome']) campos['nome'] = nomeLimpo;
  if (xpNumero != (original['xp'] as num).toInt()) campos['xp'] = xpNumero;
  if (raioNumero != (original['raioMetros'] as num).toDouble()) {
    campos['raioMetros'] = raioNumero;
  }
  if (ponto.latitude != (original['latitude'] as num).toDouble() ||
      ponto.longitude != (original['longitude'] as num).toDouble()) {
    campos['latitude'] = ponto.latitude;
    campos['longitude'] = ponto.longitude;
  }
  return campos;
}

class TelaTotensCoord extends StatefulWidget {
  const TelaTotensCoord({super.key, required this.api, this.seletorBuilder});

  final CoordenacaoApi api;
  final ConstrutorSeletorTotem? seletorBuilder;

  @override
  State<TelaTotensCoord> createState() => _TelaTotensCoordState();
}

class _TelaTotensCoordState extends State<TelaTotensCoord> {
  List<Map<String, dynamic>>? _totens;
  Map<String, dynamic>? _campus;
  String? _erro;
  String? _erroCampus;
  String? _ocupado;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  Future<void> _carregar() async {
    setState(() => _erro = null);
    try {
      final totens = await widget.api.pucstops();
      if (!mounted) return;
      setState(() {
        _totens = totens..sort(_compararNome);
        _erro = null;
      });
    } catch (erro) {
      if (mounted) setState(() => _erro = '$erro');
    }
    try {
      final campus = await widget.api.campusPucStops();
      if (mounted) {
        setState(() {
          _campus = campus;
          _erroCampus = null;
        });
      }
    } catch (erro) {
      if (mounted) setState(() => _erroCampus = '$erro');
    }
  }

  static int _compararNome(Map<String, dynamic> a, Map<String, dynamic> b) =>
      '${a['nome']}'.toLowerCase().compareTo('${b['nome']}'.toLowerCase());

  void _substituir(Map<String, dynamic> salvo) {
    final lista = [
      for (final item in _totens ?? const <Map<String, dynamic>>[])
        if (item['id'] != salvo['id']) item,
      salvo,
    ]..sort(_compararNome);
    setState(() => _totens = lista);
  }

  List<CampusMapPoint> _outros(String? id) => [
    for (final item in _totens ?? const <Map<String, dynamic>>[])
      if (item['id'] != id && item['ativo'] == true)
        CampusMapPoint(
          latitude: (item['latitude'] as num).toDouble(),
          longitude: (item['longitude'] as num).toDouble(),
        ),
  ];

  Future<void> _abrirFormulario([Map<String, dynamic>? original]) async {
    final salvo = await Navigator.of(context).push<Map<String, dynamic>>(
      MaterialPageRoute(
        builder: (_) => FormularioTotemCoord(
          api: widget.api,
          original: original,
          campus: _campus,
          erroCampus: _erroCampus,
          outros: _outros(original?['id'] as String?),
          seletorBuilder: widget.seletorBuilder,
        ),
      ),
    );
    if (!mounted || salvo == null) return;
    _substituir(salvo);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(original == null ? 'Totem criado.' : 'Totem atualizado.'),
      ),
    );
  }

  Future<void> _desativar(Map<String, dynamic> totem) async {
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Excluir o totem “${totem['nome']}”?'),
        content: const Text(
          'O totem será desativado e sairá do mapa dos alunos. Resgates e XP já concedidos continuarão no histórico.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade700),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Desativar'),
          ),
        ],
      ),
    );
    if (confirmar != true || !mounted) return;
    setState(() => _ocupado = totem['id'] as String);
    try {
      _substituir(await widget.api.desativarPucStop(totem['id'] as String));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Totem desativado. O histórico foi preservado.'),
          ),
        );
      }
    } catch (erro) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$erro')));
      }
    } finally {
      if (mounted) setState(() => _ocupado = null);
    }
  }

  Future<void> _reativar(Map<String, dynamic> totem) async {
    setState(() => _ocupado = totem['id'] as String);
    try {
      _substituir(await widget.api.ativarPucStop(totem['id'] as String));
    } catch (erro) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$erro')));
      }
    } finally {
      if (mounted) setState(() => _ocupado = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Gerenciar totens'),
        actions: [
          IconButton(
            onPressed: _carregar,
            icon: const Icon(Icons.refresh),
            tooltip: 'Atualizar',
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _campus == null ? null : () => _abrirFormulario(),
        icon: const Icon(Icons.add_location_alt_outlined),
        label: const Text('Novo totem'),
      ),
      body: _totens == null && _erro == null
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _carregar,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
                children: [
                  const Text(
                    'Defina onde o totem aparece no mapa e quanto XP cada aluno recebe no primeiro resgate.',
                  ),
                  if (_erroCampus != null)
                    _AvisoTotem(
                      texto:
                          'Não foi possível abrir o seletor do campus: $_erroCampus',
                    ),
                  if (_erro != null)
                    _AvisoTotem(texto: _erro!, onTentar: _carregar),
                  if (_totens?.isEmpty == true)
                    const Padding(
                      padding: EdgeInsets.only(top: 32),
                      child: Text('Nenhum totem cadastrado.'),
                    ),
                  for (final totem in _totens ?? const <Map<String, dynamic>>[])
                    Card(
                      margin: const EdgeInsets.only(top: 12),
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(16, 14, 8, 10),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Icon(
                                  Icons.location_on,
                                  color: totem['ativo'] == true
                                      ? AppColors.primary
                                      : AppColors.muted,
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    '${totem['nome']}',
                                    style: const TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                                Chip(
                                  label: Text(
                                    totem['ativo'] == true
                                        ? 'Ativo'
                                        : 'Inativo',
                                  ),
                                ),
                              ],
                            ),
                            Text(
                              '${totem['xp']} XP · ${totem['raioMetros']} m · ${totem['coletas'] ?? 0} resgates',
                            ),
                            Wrap(
                              spacing: 4,
                              children: [
                                TextButton.icon(
                                  onPressed: _ocupado == null
                                      ? () => _abrirFormulario(totem)
                                      : null,
                                  icon: const Icon(Icons.edit_outlined),
                                  label: const Text('Editar'),
                                ),
                                if (totem['ativo'] == true)
                                  TextButton.icon(
                                    onPressed: _ocupado == null
                                        ? () => _desativar(totem)
                                        : null,
                                    icon: const Icon(Icons.delete_outline),
                                    label: const Text('Excluir'),
                                  )
                                else
                                  TextButton.icon(
                                    onPressed: _ocupado == null
                                        ? () => _reativar(totem)
                                        : null,
                                    icon: const Icon(Icons.restore),
                                    label: const Text('Reativar'),
                                  ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
    );
  }
}

class FormularioTotemCoord extends StatefulWidget {
  const FormularioTotemCoord({
    super.key,
    required this.api,
    required this.campus,
    required this.outros,
    this.original,
    this.erroCampus,
    this.seletorBuilder,
  });

  final CoordenacaoApi api;
  final Map<String, dynamic>? original;
  final Map<String, dynamic>? campus;
  final String? erroCampus;
  final List<CampusMapPoint> outros;
  final ConstrutorSeletorTotem? seletorBuilder;

  @override
  State<FormularioTotemCoord> createState() => _FormularioTotemCoordState();
}

class _FormularioTotemCoordState extends State<FormularioTotemCoord> {
  late final TextEditingController _nome;
  late final TextEditingController _xp;
  late final TextEditingController _raio;
  CampusMapPoint? _ponto;
  bool _salvando = false;
  String? _erroServidor;

  bool get _criando => widget.original == null;

  @override
  void initState() {
    super.initState();
    final original = widget.original;
    _nome = TextEditingController(text: '${original?['nome'] ?? ''}');
    _xp = TextEditingController(
      text: original == null ? '' : '${original['xp']}',
    );
    _raio = TextEditingController(
      text: original == null ? '30' : '${original['raioMetros']}',
    );
    if (original != null) {
      _ponto = CampusMapPoint(
        latitude: (original['latitude'] as num).toDouble(),
        longitude: (original['longitude'] as num).toDouble(),
      );
    }
    for (final controller in [_nome, _xp, _raio]) {
      controller.addListener(_atualizar);
    }
  }

  @override
  void dispose() {
    _nome.dispose();
    _xp.dispose();
    _raio.dispose();
    super.dispose();
  }

  void _atualizar() {
    if (mounted) setState(() => _erroServidor = null);
  }

  String? get _erroValidacao => validarFormularioTotem(
    nome: _nome.text,
    xp: _xp.text,
    raio: _raio.text,
    ponto: _ponto,
  );

  Map<String, dynamic> get _campos => camposAlteradosTotem(
    widget.original!,
    nome: _nome.text,
    xp: _xp.text,
    raio: _raio.text,
    ponto: _ponto!,
  );

  bool get _podeSalvar =>
      !_salvando && _erroValidacao == null && (_criando || _campos.isNotEmpty);

  Future<void> _salvar() async {
    if (!_podeSalvar) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _salvando = true;
      _erroServidor = null;
    });
    try {
      final salvo = _criando
          ? await widget.api.criarPucStop(
              corpoCriacaoTotem(
                nome: _nome.text,
                xp: _xp.text,
                raio: _raio.text,
                ponto: _ponto!,
              ),
            )
          : await widget.api.atualizarPucStop(
              widget.original!['id'] as String,
              _campos,
            );
      if (mounted) Navigator.of(context).pop(salvo);
    } catch (erro) {
      if (mounted) {
        setState(() {
          _erroServidor = '$erro';
          _salvando = false;
        });
      }
    }
  }

  Future<void> _abrirMapa() async {
    FocusScope.of(context).unfocus();
    final ponto = await Navigator.of(context).push<CampusMapPoint>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => SeletorPosicaoTotemCoord(
          selecionado: _ponto,
          campus: widget.campus,
          outros: widget.outros,
          seletorBuilder: widget.seletorBuilder,
        ),
      ),
    );
    if (!mounted || ponto == null) return;
    setState(() {
      _ponto = ponto;
      _erroServidor = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final mensagem =
        _erroServidor ??
        _erroValidacao ??
        (!_criando && _campos.isEmpty
            ? 'Nenhuma alteração para salvar.'
            : null);
    return Scaffold(
      appBar: AppBar(title: Text(_criando ? 'Novo totem' : 'Editar totem')),
      body: SafeArea(
        child: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: EdgeInsets.fromLTRB(
            16,
            16,
            16,
            MediaQuery.viewInsetsOf(context).bottom + 24,
          ),
          children: [
            TextField(
              controller: _nome,
              maxLength: 120,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Nome',
                hintText: 'Ex.: Totem da biblioteca',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: TextField(
                    key: const ValueKey('xp-totem'),
                    controller: _xp,
                    keyboardType: TextInputType.number,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(
                      labelText: 'XP da recompensa',
                      helperText: 'Inteiro de 1 a 1000',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: _raio,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    decoration: const InputDecoration(
                      labelText: 'Raio (m)',
                      helperText: 'De 10 a 200',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            const Text(
              'Posição no campus',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 4),
            Text(
              _criando
                  ? 'Abra o mapa 3D, mova o campus sob o pin e confirme.'
                  : 'Abra o mapa 3D para conferir ou mover o pin atual.',
            ),
            if (widget.erroCampus != null)
              _AvisoTotem(texto: widget.erroCampus!),
            const SizedBox(height: 10),
            Material(
              color: const Color(0xFFF6F2FF),
              borderRadius: BorderRadius.circular(16),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Row(
                  children: [
                    const Icon(Icons.view_in_ar_outlined),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        _ponto == null
                            ? 'Nenhuma posição escolhida.'
                            : 'Posição escolhida\n${_ponto!.latitude.toStringAsFixed(6)}, ${_ponto!.longitude.toStringAsFixed(6)}',
                      ),
                    ),
                    FilledButton.icon(
                      key: const ValueKey('abrir-mapa-3d-totem'),
                      onPressed: widget.campus == null ? null : _abrirMapa,
                      icon: const Icon(Icons.map_outlined),
                      label: Text(_ponto == null ? 'Escolher' : 'Alterar'),
                    ),
                  ],
                ),
              ),
            ),
            if (!_criando)
              const Padding(
                padding: EdgeInsets.only(top: 12),
                child: Text(
                  'Alterar o XP vale apenas para novos resgates. O histórico anterior é preservado.',
                ),
              ),
            if (mensagem != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(
                  mensagem,
                  style: TextStyle(
                    color: _erroServidor != null
                        ? Colors.red.shade700
                        : AppColors.muted,
                  ),
                ),
              ),
            const SizedBox(height: 16),
            FilledButton.icon(
              key: const ValueKey('salvar-totem'),
              onPressed: _podeSalvar ? _salvar : null,
              icon: _salvando
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.save_outlined),
              label: Text(_salvando ? 'Salvando…' : 'Salvar'),
            ),
          ],
        ),
      ),
    );
  }
}

class SeletorPosicaoTotemCoord extends StatefulWidget {
  const SeletorPosicaoTotemCoord({
    super.key,
    required this.selecionado,
    required this.campus,
    required this.outros,
    this.seletorBuilder,
  });

  final CampusMapPoint? selecionado;
  final Map<String, dynamic>? campus;
  final List<CampusMapPoint> outros;
  final ConstrutorSeletorTotem? seletorBuilder;

  @override
  State<SeletorPosicaoTotemCoord> createState() =>
      _SeletorPosicaoTotemCoordState();
}

class _SeletorPosicaoTotemCoordState extends State<SeletorPosicaoTotemCoord> {
  CampusMapPoint? _ponto;

  @override
  void initState() {
    super.initState();
    _ponto = widget.selecionado ?? _centroCampus();
  }

  CampusMapPoint? _centroCampus() {
    final centro = widget.campus?['centro'];
    if (centro is! Map) return null;
    final latitude = centro['latitude'];
    final longitude = centro['longitude'];
    if (latitude is! num || longitude is! num) return null;
    return CampusMapPoint(
      latitude: latitude.toDouble(),
      longitude: longitude.toDouble(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final builder = widget.seletorBuilder;
    final mapa = builder != null
        ? builder(
            context,
            selecionado: _ponto,
            onChanged: (ponto) => setState(() => _ponto = ponto),
            campus: widget.campus,
            outros: widget.outros,
          )
        : CampusPointPicker(
            config: const CampusMapConfig(
              mapboxAccessToken: String.fromEnvironment('MAPBOX_ACCESS_TOKEN'),
              styleUri: String.fromEnvironment('MAPBOX_STYLE_URI'),
            ),
            selected: _ponto,
            campus: widget.campus,
            others: widget.outros,
            centerPin: true,
            enable3d: true,
            showInstructions: false,
            onChanged: (ponto) {
              if (mounted) setState(() => _ponto = ponto);
            },
          );
    return Scaffold(
      appBar: AppBar(
        title: const Text('Posicionar totem'),
        leading: IconButton(
          onPressed: () => Navigator.pop(context),
          icon: const Icon(Icons.close),
          tooltip: 'Cancelar',
        ),
      ),
      body: Stack(
        fit: StackFit.expand,
        children: [
          mapa,
          const Positioned(
            left: 16,
            right: 16,
            top: 12,
            child: IgnorePointer(
              child: Material(
                color: Color(0xEEFFFFFF),
                borderRadius: BorderRadius.all(Radius.circular(14)),
                child: Padding(
                  padding: EdgeInsets.all(12),
                  child: Text(
                    'Mova, gire e incline o mapa. A ponta do pin indica onde o totem será instalado.',
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
            ),
          ),
          Positioned(
            left: 12,
            right: 12,
            bottom: 12,
            child: SafeArea(
              top: false,
              child: Material(
                elevation: 8,
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        _ponto == null
                            ? 'Mova o mapa para escolher uma posição.'
                            : '${_ponto!.latitude.toStringAsFixed(6)}, ${_ponto!.longitude.toStringAsFixed(6)}',
                        key: const ValueKey('posicao-pin-totem'),
                      ),
                      const SizedBox(height: 10),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton.icon(
                          key: const ValueKey('confirmar-posicao-totem'),
                          onPressed: _ponto == null
                              ? null
                              : () => Navigator.pop(context, _ponto),
                          icon: const Icon(Icons.check),
                          label: const Text('Usar esta posição'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AvisoTotem extends StatelessWidget {
  const _AvisoTotem({required this.texto, this.onTentar});
  final String texto;
  final VoidCallback? onTentar;

  @override
  Widget build(BuildContext context) => Card(
    color: Colors.orange.shade50,
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          const Icon(Icons.warning_amber_outlined),
          const SizedBox(width: 8),
          Expanded(child: Text(texto)),
          if (onTentar != null)
            TextButton(
              onPressed: onTentar,
              child: const Text('Tentar novamente'),
            ),
        ],
      ),
    ),
  );
}
