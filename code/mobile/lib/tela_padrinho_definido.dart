import 'package:flutter/material.dart';

import 'theme/colors.dart';
import 'widgets/cabecalho_logos.dart';
import 'widgets/campos_cadastro.dart';

class Padrinho {
  const Padrinho({
    required this.nome,
    required this.curso,
    required this.sobre,
    this.interesses = const [],
    this.online = false,
  });

  final String nome;
  final String curso;
  final String sobre;
  final List<String> interesses;
  final bool online;

  String get iniciais => nome
      .split(' ')
      .where((parte) => parte.isNotEmpty)
      .take(2)
      .map((parte) => parte[0].toUpperCase())
      .join();
}

class PadrinhoDefinidoPage extends StatelessWidget {
  // TODO: buscar o padrinho em /me/vinculos.
  const PadrinhoDefinidoPage({
    super.key,
    this.padrinho = const Padrinho(
      nome: 'Thiago Moreira',
      curso: 'Engenharia de Software',
      sobre: 'Gosto de tecnologia, projetos e vida no campus.',
      interesses: ['Tecnologia', 'Inovação', 'Projetos'],
      online: true,
    ),
  });

  final Padrinho padrinho;

  void _emBreve(BuildContext context, String funcionalidade) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text('$funcionalidade: em breve!')));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const CabecalhoLogos(),
              const SizedBox(height: 20),
              const _Destaque(),
              const SizedBox(height: 18),
              _CardPadrinho(padrinho: padrinho),
              const SizedBox(height: 14),
              _ProximosPassos(
                onMensagem: () => _emBreve(context, 'Chat'),
                onPerfil: () => _emBreve(context, 'Perfil do padrinho'),
              ),
              const SizedBox(height: 14),
              const _VinculoAtivo(),
            ],
          ),
        ),
      ),
    );
  }
}

class _Destaque extends StatelessWidget {
  const _Destaque();

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Seu padrinho foi definido!',
                style: TextStyle(
                  color: AppColors.ink,
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.4,
                  height: 1.1,
                ),
              ),
              SizedBox(height: 8),
              Text(
                'Sua conexão no Ajuda-aí foi criada com sucesso. Agora você '
                'já pode iniciar essa jornada com seu padrinho!',
                style: TextStyle(
                  fontFamily: 'Inter',
                  color: AppColors.muted,
                  fontSize: 13,
                  height: 1.4,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 12),
        // TODO: usar a ilustração do Figma.
        Container(
          width: 96,
          height: 96,
          decoration: const BoxDecoration(
            color: AppAccents.tileLilas,
            shape: BoxShape.circle,
          ),
          child: const Icon(
            Icons.handshake_outlined,
            size: 48,
            color: AppColors.primary,
          ),
        ),
      ],
    );
  }
}

class _CardPadrinho extends StatelessWidget {
  const _CardPadrinho({required this.padrinho});

  final Padrinho padrinho;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: EstiloCampo.decoracao(),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Stack(
            children: [
              CircleAvatar(
                radius: 34,
                backgroundColor: AppAccents.tileLilas,
                child: Text(
                  padrinho.iniciais,
                  style: const TextStyle(
                    color: AppColors.primary,
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              if (padrinho.online)
                Positioned(
                  right: 2,
                  bottom: 2,
                  child: Container(
                    width: 14,
                    height: 14,
                    decoration: BoxDecoration(
                      color: AppAccents.success,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 2),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  padrinho.nome,
                  style: const TextStyle(
                    color: AppColors.ink,
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                Text(
                  padrinho.curso,
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.muted,
                    fontSize: 12,
                  ),
                ),
                if (padrinho.online) ...[
                  const SizedBox(height: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: AppAccents.successBg,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Text(
                      'Online',
                      style: TextStyle(
                        fontFamily: 'Inter',
                        color: AppAccents.success,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 8),
                Text(
                  padrinho.sobre,
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.ink,
                    fontSize: 12,
                    height: 1.35,
                  ),
                ),
                if (padrinho.interesses.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (final interesse in padrinho.interesses)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: AppAccents.tileLilas,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            interesse,
                            style: const TextStyle(
                              fontFamily: 'Inter',
                              color: AppColors.primary,
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ProximosPassos extends StatelessWidget {
  const _ProximosPassos({required this.onMensagem, required this.onPerfil});

  final VoidCallback onMensagem;
  final VoidCallback onPerfil;

  static const _passos = [
    (
      Icons.send_outlined,
      'Envie sua primeira mensagem',
      'Diga olá, se apresente e conte um pouco sobre você.',
    ),
    (
      Icons.person_search_outlined,
      'Conheça o perfil do seu padrinho',
      'Veja mais informações, interesses e experiências.',
    ),
    (
      Icons.calendar_month_outlined,
      'Combine um primeiro encontro',
      'Vocês podem conversar no campus ou em um ambiente online.',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: EstiloCampo.decoracao(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Próximos passos',
            style: TextStyle(
              color: AppColors.ink,
              fontSize: 16,
              fontWeight: FontWeight.w800,
            ),
          ),
          const Text(
            'Aproveite para dar os primeiros passos na sua jornada!',
            style: TextStyle(
              fontFamily: 'Inter',
              color: AppColors.muted,
              fontSize: 12,
            ),
          ),
          const SizedBox(height: 12),
          for (final (i, (icone, titulo, descricao)) in _passos.indexed)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CircleAvatar(
                    radius: 11,
                    backgroundColor: AppColors.lavender,
                    child: Text(
                      '${i + 1}',
                      style: const TextStyle(
                        fontFamily: 'Inter',
                        color: AppColors.primary,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Icon(icone, size: 20, color: AppColors.primary),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          titulo,
                          style: const TextStyle(
                            fontFamily: 'Inter',
                            color: AppColors.ink,
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          descricao,
                          style: const TextStyle(
                            fontFamily: 'Inter',
                            color: AppColors.muted,
                            fontSize: 12,
                            height: 1.35,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 4),
          BotaoCadastro(texto: 'Enviar mensagem', onPressed: onMensagem),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            height: 50,
            child: OutlinedButton(
              onPressed: onPerfil,
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.primary,
                side: const BorderSide(color: AppColors.primary, width: 1.2),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
              child: const Text(
                'Ver perfil do padrinho',
                style: TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _VinculoAtivo extends StatelessWidget {
  const _VinculoAtivo();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppAccents.successBg,
        borderRadius: BorderRadius.circular(14),
      ),
      child: const Row(
        children: [
          Icon(Icons.groups_outlined, color: AppAccents.success, size: 28),
          SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Seu vínculo está ativo!',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    color: AppAccents.success,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Text(
                  'Agora você já pode conversar, participar de encontros e '
                  'acompanhar missões juntos no Ajuda-aí.',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.ink,
                    fontSize: 12,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
