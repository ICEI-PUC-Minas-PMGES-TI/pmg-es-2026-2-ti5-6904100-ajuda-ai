import 'package:flutter/material.dart';

import '../theme/colors.dart';
import 'componentes_coord.dart';

/// Conta da coordenação — dados básicos da sessão.
class TelaConfiguracoesCoord extends StatelessWidget {
  const TelaConfiguracoesCoord({
    super.key,
    required this.nome,
    required this.email,
    required this.onSair,
  });

  final String nome;
  final String email;
  final VoidCallback onSair;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: corFundoCoord,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          children: [
            const CabecalhoCoord(
              voltar: true,
              titulo: 'Configurações',
              subtitulo: 'Dados da sua conta de coordenação.',
            ),
            Material(
              color: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
                side: const BorderSide(color: AppAccents.cardBorder),
              ),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Conta da coordenação',
                      style: TextStyle(
                        fontFamily: 'Poppins',
                        fontWeight: FontWeight.w800,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 12),
                    _fato('Nome', nome),
                    _fato('E-mail', email),
                    _fato('Perfil', 'Coordenação'),
                    const SizedBox(height: 12),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF4F2FF),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Text(
                        'Sessão da coordenação neste aparelho. Em produção, '
                        'o acesso usa a conta institucional @pucminas.edu.br.',
                        style: TextStyle(
                          fontSize: 12,
                          color: corTextoSecundarioCoord,
                          height: 1.4,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: onSair,
              icon: const Icon(Icons.logout),
              label: const Text('Sair da coordenação'),
              style: OutlinedButton.styleFrom(
                foregroundColor: corErroCoord,
                minimumSize: const Size.fromHeight(48),
                side: BorderSide(color: corErroCoord.withValues(alpha: 0.4)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _fato(String rotulo, String valor) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            rotulo,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: AppColors.primary,
            ),
          ),
          Text(
            valor,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}
