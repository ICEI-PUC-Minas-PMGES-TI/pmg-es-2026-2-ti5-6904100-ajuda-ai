import 'package:flutter/material.dart';

import '../sessao_usuario.dart';
import '../services/chat_api.dart';
import '../tela_conversas.dart';

Future<void> abrirConversas(
  BuildContext context, {
  String? focoEmail,
  int? focoVinculo,
  int? focoGrupo,
}) async {
  final sessao = SessaoUsuario.atual;
  final email = sessao.identidade?.email;
  final token = sessao.accessToken;
  final programa = sessao.programaAtual;
  if (email == null || token == null) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Entre na sua conta para acessar as conversas.'),
      ),
    );
    return;
  }
  bool escopoValido() =>
      sessao.identidade?.email == email &&
      sessao.accessToken == token &&
      sessao.programaAtual == programa;
  final api = ChatApi(token: () => escopoValido() ? sessao.accessToken : null);
  try {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => TelaConversas(
          api: api,
          programa: programa,
          focoEmail: focoEmail,
          focoVinculo: focoVinculo,
          focoGrupo: focoGrupo,
          mudancasSessao: sessao.mudancas,
          escopoValido: escopoValido,
        ),
      ),
    );
  } finally {
    api.fechar();
  }
}
