import { BadRequestException } from '@nestjs/common';

export const DATAS_PROGRAMA = {
  inscricoesInicio: 'Início das inscrições',
  inscricoesFim: 'Fim das inscrições',
  analiseInicio: 'Início da análise',
  analiseFim: 'Fim da análise',
  formacaoInicio: 'Início da formação dos grupos',
  formacaoFim: 'Fim da formação dos grupos',
  andamentoInicio: 'Início das atividades',
  andamentoFim: 'Fim das atividades',
  encerramentoEm: 'Encerramento',
} as const;

/** Datas civis ISO, sem normalização automática nem conversão de fuso. */
export function validarCronograma(dados: Record<string, unknown>, completo = false): void {
  let anterior: { valor: string; rotulo: string } | undefined;
  for (const [chave, rotulo] of Object.entries(DATAS_PROGRAMA)) {
    const valor = dados[chave];
    if (valor === undefined || valor === null) {
      if (completo) throw new BadRequestException(`Informe ${rotulo.toLowerCase()}.`);
      continue;
    }
    const data = typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)
      ? new Date(`${valor}T00:00:00.000Z`) : new Date(NaN);
    if (!Number.isFinite(data.getTime()) || data.toISOString().slice(0, 10) !== valor || data.getUTCFullYear() < 2000 || data.getUTCFullYear() > 2100) {
      throw new BadRequestException(`Data inválida: ${rotulo}. Use uma data real entre 2000 e 2100 (AAAA-MM-DD).`);
    }
    if (anterior && (valor as string) < anterior.valor) {
      throw new BadRequestException(`Ordem do cronograma inválida: ${rotulo} deve ser igual ou posterior a ${anterior.rotulo.toLowerCase()}.`);
    }
    anterior = { valor: valor as string, rotulo };
  }
}
