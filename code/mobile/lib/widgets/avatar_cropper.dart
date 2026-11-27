import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../theme/colors.dart';

class AvatarCropper {
  static Future<Uint8List?> mostrar(BuildContext context, Uint8List bytes) =>
      showDialog<Uint8List>(
        context: context,
        builder: (_) => _AvatarCropperDialog(bytes: bytes),
      );
}

class _AvatarCropperDialog extends StatefulWidget {
  const _AvatarCropperDialog({required this.bytes});

  final Uint8List bytes;

  @override
  State<_AvatarCropperDialog> createState() => _AvatarCropperDialogState();
}

class _AvatarCropperDialogState extends State<_AvatarCropperDialog> {
  static const _saida = 512.0;
  double get _lado =>
      (MediaQuery.sizeOf(context).width - 96).clamp(180.0, 280.0).toDouble();

  ui.Image? _imagem;
  bool _processando = false;
  String? _erro;
  double _zoom = 1;
  double _zoomInicial = 1;
  Offset _deslocamento = Offset.zero;
  Offset _deslocamentoInicial = Offset.zero;
  Offset _focoInicial = Offset.zero;

  @override
  void initState() {
    super.initState();
    _carregarImagem();
  }

  Future<void> _carregarImagem() async {
    try {
      final codec = await ui.instantiateImageCodec(
        widget.bytes,
        targetWidth: 1024,
      );
      final frame = await codec.getNextFrame();
      codec.dispose();
      if (mounted) setState(() => _imagem = frame.image);
    } catch (_) {
      if (mounted) {
        setState(() => _erro = 'Não foi possível abrir esta imagem.');
      }
    }
  }

  double _escalaBase(Size area, ui.Image imagem) => [
    area.width / imagem.width,
    area.height / imagem.height,
  ].reduce((a, b) => a > b ? a : b);

  Offset _limitar(Offset valor, Size area, ui.Image imagem, double zoom) {
    final escala = _escalaBase(area, imagem) * zoom;
    final maxX = (imagem.width * escala - area.width) / 2;
    final maxY = (imagem.height * escala - area.height) / 2;
    return Offset(
      valor.dx.clamp(-maxX, maxX).toDouble(),
      valor.dy.clamp(-maxY, maxY).toDouble(),
    );
  }

  void _iniciarEscala(ScaleStartDetails detalhes) {
    _zoomInicial = _zoom;
    _deslocamentoInicial = _deslocamento;
    _focoInicial = detalhes.localFocalPoint;
  }

  void _atualizarEscala(ScaleUpdateDetails detalhes, Size area) {
    final imagem = _imagem;
    if (imagem == null) return;
    final novoZoom = (_zoomInicial * detalhes.scale).clamp(1.0, 3.0);
    final novoDeslocamento =
        _deslocamentoInicial + detalhes.localFocalPoint - _focoInicial;
    setState(() {
      _zoom = novoZoom;
      _deslocamento = _limitar(novoDeslocamento, area, imagem, novoZoom);
    });
  }

  Future<void> _confirmar() async {
    final imagem = _imagem;
    if (imagem == null || _processando) return;
    setState(() {
      _processando = true;
      _erro = null;
    });
    try {
      final area = Size.square(_lado);
      final escala = _escalaBase(area, imagem) * _zoom;
      final centro = Offset(area.width / 2, area.height / 2) + _deslocamento;
      final destino = Rect.fromCenter(
        center: centro,
        width: imagem.width * escala,
        height: imagem.height * escala,
      );
      final recorder = ui.PictureRecorder();
      Canvas(recorder)
        ..scale(_saida / area.width)
        ..drawImageRect(
          imagem,
          Rect.fromLTWH(
            0,
            0,
            imagem.width.toDouble(),
            imagem.height.toDouble(),
          ),
          destino,
          Paint()..filterQuality = FilterQuality.high,
        );
      final picture = recorder.endRecording();
      final recortada = await picture.toImage(_saida.toInt(), _saida.toInt());
      final dados = await recortada.toByteData(format: ui.ImageByteFormat.png);
      recortada.dispose();
      picture.dispose();
      if (dados == null) throw StateError('Não foi possível processar a foto.');
      final bytes = dados.buffer.asUint8List();
      if (bytes.length > 5 * 1024 * 1024) {
        throw StateError('A imagem ajustada excede o limite de 5 MB.');
      }
      if (mounted) Navigator.of(context).pop(bytes);
    } catch (erro) {
      if (mounted) {
        setState(() {
          _erro = 'Não foi possível processar a foto: $erro';
          _processando = false;
        });
      }
    }
  }

  @override
  void dispose() {
    _imagem?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final imagem = _imagem;
    return AlertDialog(
      title: const Text('Ajustar foto'),
      content: SizedBox(
        width: _lado + 8,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox.square(
              dimension: _lado,
              child: ClipOval(
                child: DecoratedBox(
                  decoration: const BoxDecoration(color: AppColors.lavender),
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      final area = Size(
                        constraints.maxWidth,
                        constraints.maxHeight,
                      );
                      return GestureDetector(
                        onScaleStart: _iniciarEscala,
                        onScaleUpdate: (detalhes) =>
                            _atualizarEscala(detalhes, area),
                        child: CustomPaint(
                          size: area,
                          painter: imagem == null
                              ? null
                              : _AvatarCropPainter(
                                  imagem: imagem,
                                  zoom: _zoom,
                                  deslocamento: _deslocamento,
                                ),
                          child: imagem == null
                              ? const Center(child: CircularProgressIndicator())
                              : null,
                        ),
                      );
                    },
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                const Text('Zoom'),
                Expanded(
                  child: Slider(
                    value: _zoom,
                    min: 1,
                    max: 3,
                    onChanged: imagem == null || _processando
                        ? null
                        : (valor) {
                            setState(() {
                              _zoom = valor;
                              _deslocamento = _limitar(
                                _deslocamento,
                                Size.square(_lado),
                                imagem,
                                valor,
                              );
                            });
                          },
                  ),
                ),
              ],
            ),
            if (_erro != null)
              Text(_erro!, style: const TextStyle(color: Colors.red)),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _processando ? null : () => Navigator.pop(context),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          onPressed: imagem == null || _processando ? null : _confirmar,
          child: Text(
            _processando ? 'Processando…' : 'Confirmar enquadramento',
          ),
        ),
      ],
    );
  }
}

class _AvatarCropPainter extends CustomPainter {
  const _AvatarCropPainter({
    required this.imagem,
    required this.zoom,
    required this.deslocamento,
  });

  final ui.Image imagem;
  final double zoom;
  final Offset deslocamento;

  @override
  void paint(Canvas canvas, Size size) {
    final escala =
        [
          size.width / imagem.width,
          size.height / imagem.height,
        ].reduce((a, b) => a > b ? a : b) *
        zoom;
    final destino = Rect.fromCenter(
      center: Offset(size.width / 2, size.height / 2) + deslocamento,
      width: imagem.width * escala,
      height: imagem.height * escala,
    );
    canvas.drawImageRect(
      imagem,
      Rect.fromLTWH(0, 0, imagem.width.toDouble(), imagem.height.toDouble()),
      destino,
      Paint()..filterQuality = FilterQuality.high,
    );
  }

  @override
  bool shouldRepaint(_AvatarCropPainter antigo) =>
      antigo.imagem != imagem ||
      antigo.zoom != zoom ||
      antigo.deslocamento != deslocamento;
}
