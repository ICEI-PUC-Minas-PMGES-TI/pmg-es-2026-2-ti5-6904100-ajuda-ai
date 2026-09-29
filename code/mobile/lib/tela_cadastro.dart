import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import 'dados_cadastro.dart';
import 'tela_cadastro_perfil.dart';
import 'theme/colors.dart';
import 'widgets/campos_cadastro.dart';

class CadastroPage extends StatefulWidget {
  // TODO: receber nome e e-mail do login com a Microsoft;
  const CadastroPage({
    super.key,
    this.nome = 'Camila Duarte',
    this.email = 'camila@pucminas.edu.br',
  });

  final String nome;
  final String email;

  @override
  State<CadastroPage> createState() => _CadastroPageState();
}

class _CadastroPageState extends State<CadastroPage> {
  static const _cursos = [
    'Engenharia de Software',
    'Ciência da Computação',
    'Sistemas de Informação',
    'Engenharia de Computação',
  ];
  static const _turnos = ['Manhã', 'Tarde', 'Noite'];
  static const _assuntos = [
    'Tecnologia',
    'Inovação',
    'Projetos',
    'Estágio',
    'Pesquisa',
    'Empreendedorismo',
    'Esportes',
    'Eventos',
  ];

  late final TextEditingController _nomeController;
  Uint8List? _foto;
  String _curso = _cursos.first;
  int _periodo = 1;
  String _turno = 'Noite';
  final List<String> _interesses = [];

  @override
  void initState() {
    super.initState();
    _nomeController = TextEditingController(text: widget.nome);
  }

  @override
  void dispose() {
    _nomeController.dispose();
    super.dispose();
  }

  Future<void> _escolherFoto() async {
    final resultado = await FilePicker.pickFiles(
      type: FileType.image,
      withData: true,
    );
    final bytes = resultado?.files.single.bytes;
    if (!mounted || bytes == null || bytes.isEmpty) return;
    setState(() => _foto = bytes);
  }

  void _continuar() {
    if (_nomeController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Informe seu nome completo.')),
      );
      return;
    }

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => PerfilCadastroPage(
          dados: DadosCadastro(
            nome: _nomeController.text.trim(),
            email: widget.email,
            curso: _curso,
            periodo: _periodo,
            turno: _turno,
            interesses: List.of(_interesses),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return EstruturaCadastro(
      children: [
        const TituloPasso(
          passo: 1,
          titulo: 'Complete seu perfil',
          subtitulo:
              'Essas informações serão usadas para personalizar sua '
              'experiência e conectar você a oportunidades, pessoas e '
              'conteúdos relevantes.',
        ),
        const SizedBox(height: 18),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SeletorFoto(foto: _foto, onTap: _escolherFoto),
            const SizedBox(width: 14),
            const Expanded(child: _DicaFoto()),
          ],
        ),
        const SizedBox(height: 18),
        const RotuloCampo('Nome completo'),
        CampoTexto(
          icone: Icons.person_outline,
          child: TextField(
            controller: _nomeController,
            textCapitalization: TextCapitalization.words,
            style: EstiloCampo.valor,
            decoration: const InputDecoration.collapsed(
              hintText: 'Seu nome completo',
            ),
          ),
        ),
        const RotuloCampo('E-mail institucional'),
        CampoTexto(
          icone: Icons.mail_outline,
          bloqueado: true,
          child: Text(
            widget.email,
            overflow: TextOverflow.ellipsis,
            style: EstiloCampo.valor.copyWith(color: AppColors.muted),
          ),
        ),
        const RotuloCampo('Curso'),
        CampoSelecao<String>(
          icone: Icons.school_outlined,
          valor: _curso,
          opcoes: {for (final curso in _cursos) curso: curso},
          onChanged: (valor) => setState(() => _curso = valor),
        ),
        const RotuloCampo('Período atual'),
        CampoSelecao<int>(
          icone: Icons.bar_chart_rounded,
          valor: _periodo,
          opcoes: {for (var p = 1; p <= 10; p++) p: '$pº período'},
          onChanged: (valor) => setState(() => _periodo = valor),
        ),
        const RotuloCampo('Turno'),
        CampoSelecao<String>(
          icone: Icons.nightlight_outlined,
          valor: _turno,
          opcoes: {for (final turno in _turnos) turno: turno},
          onChanged: (valor) => setState(() => _turno = valor),
        ),
        const RotuloCampo('Interesses (opcional)'),
        CampoMultiSelecao(
          selecionados: _interesses,
          opcoes: _assuntos,
          dica: 'Adicionar assunto',
          onAdicionar: (assunto) => setState(() => _interesses.add(assunto)),
          onRemover: (assunto) => setState(() => _interesses.remove(assunto)),
        ),
        const SizedBox(height: 8),
        const Text(
          'Selecione assuntos que você gosta ou tem interesse.',
          style: TextStyle(
            fontFamily: 'Inter',
            color: AppColors.muted,
            fontSize: 12,
          ),
        ),
        const SizedBox(height: 22),
        BotaoCadastro(texto: 'Continuar', onPressed: _continuar),
      ],
    );
  }
}

class _SeletorFoto extends StatelessWidget {
  const _SeletorFoto({required this.foto, required this.onTap});

  final Uint8List? foto;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Stack(
            clipBehavior: Clip.none,
            children: [
              CircleAvatar(
                radius: 38,
                backgroundColor: AppColors.lavender,
                foregroundImage: foto == null ? null : MemoryImage(foto!),
                child: const Icon(
                  Icons.person_outline,
                  size: 38,
                  color: AppColors.primary,
                ),
              ),
              Positioned(
                right: -2,
                bottom: 2,
                child: Container(
                  padding: const EdgeInsets.all(5),
                  decoration: BoxDecoration(
                    color: AppColors.primary,
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 2),
                  ),
                  child: const Icon(
                    Icons.photo_camera_outlined,
                    size: 13,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          const Text(
            'Adicionar foto',
            style: TextStyle(
              fontFamily: 'Inter',
              color: AppColors.primary,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _DicaFoto extends StatelessWidget {
  const _DicaFoto();

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.lavender,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppAccents.cardBorder),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline, size: 18, color: AppColors.primary),
          SizedBox(width: 8),
          Expanded(
            child: Text(
              'Uma boa foto ajuda outras pessoas a te reconhecerem no '
              'Ajuda-aí.',
              style: TextStyle(
                fontFamily: 'Inter',
                color: AppColors.ink,
                fontSize: 12,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
