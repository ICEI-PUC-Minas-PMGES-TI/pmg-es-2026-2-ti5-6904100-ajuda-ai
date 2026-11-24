import 'package:flutter/material.dart';

import '../models/preferencia_genero.dart';

class CampoPreferenciaGenero extends StatelessWidget {
  const CampoPreferenciaGenero({
    super.key,
    required this.valor,
    required this.onChanged,
    this.erro = false,
  });
  final PreferenciaGenero? valor;
  final ValueChanged<PreferenciaGenero?> onChanged;
  final bool erro;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 12),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        DropdownButtonFormField<String>(
          isExpanded: true,
          key: ValueKey(valor?.modo),
          initialValue: valor?.modo ?? '',
          decoration: const InputDecoration(
            labelText: 'Preferência de gênero para o par (opcional)',
          ),
          items: const [
            DropdownMenuItem(value: '', child: Text('Não informado')),
            DropdownMenuItem(
              value: 'sem_preferencia',
              child: Text('Sem preferência'),
            ),
            DropdownMenuItem(
              value: 'preferencia',
              child: Text('Tenho preferência'),
            ),
          ],
          onChanged: (modo) => onChanged(
            modo == null || modo.isEmpty ? null : PreferenciaGenero(modo: modo),
          ),
        ),
        if (valor?.modo == 'preferencia')
          for (final genero in PreferenciaGenero.opcoes)
            CheckboxListTile(
              title: Text(genero),
              value: valor!.generos.contains(genero),
              onChanged: (selecionado) => onChanged(
                PreferenciaGenero(
                  modo: 'preferencia',
                  generos: selecionado == true
                      ? [...valor!.generos, genero]
                      : valor!.generos.where((g) => g != genero).toList(),
                ),
              ),
            ),
        const Text(
          'Sua preferência ajuda na compatibilidade e não impede outras combinações.',
        ),
        if (erro)
          const Text(
            'Selecione ao menos um gênero ou escolha sem preferência.',
            style: TextStyle(color: Colors.red),
          ),
      ],
    ),
  );
}
