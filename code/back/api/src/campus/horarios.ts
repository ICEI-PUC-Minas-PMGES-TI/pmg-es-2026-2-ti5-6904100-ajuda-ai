import { BadRequestException } from '@nestjs/common';
import { FUSO_CAMPUS } from './campus.js';

/**
 * Faixa de funcionamento, como no PUCMaps (`openingHours`): dia da semana
 * (0 = domingo … 6 = sábado) e horário local `HH:mm`. Uma faixa não atravessa
 * a meia-noite; para isso, duas faixas.
 */
export interface FaixaHorario {
  dia: number;
  abre: string;
  fecha: string;
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));

/**
 * Valida e ordena (dia, abre). Recusa formato inválido, `fecha <= abre` e
 * sobreposição no mesmo dia (o PUCMaps também recusava). No máximo 21 faixas.
 */
export function validarHorarios(bruto: unknown): FaixaHorario[] {
  if (!Array.isArray(bruto) || bruto.length > 21) {
    throw new BadRequestException('horarios: lista de até 21 faixas.');
  }
  const faixas = bruto.map((f: unknown, i) => {
    const { dia, abre, fecha } = (f ?? {}) as Record<string, unknown>;
    const chaves = Object.keys((f ?? {}) as object);
    if (
      chaves.some((c) => !['dia', 'abre', 'fecha'].includes(c)) ||
      !Number.isInteger(dia) ||
      (dia as number) < 0 ||
      (dia as number) > 6 ||
      typeof abre !== 'string' ||
      typeof fecha !== 'string' ||
      !HORA.test(abre) ||
      !HORA.test(fecha)
    ) {
      throw new BadRequestException(
        `horarios[${i}]: use { dia: 0..6, abre: "HH:mm", fecha: "HH:mm" }.`,
      );
    }
    if (minutos(fecha) <= minutos(abre)) {
      throw new BadRequestException(
        `horarios[${i}]: o horário de fechar deve ser depois do de abrir.`,
      );
    }
    return { dia: dia as number, abre, fecha };
  });
  faixas.sort((a, b) => a.dia - b.dia || minutos(a.abre) - minutos(b.abre));
  for (let i = 1; i < faixas.length; i++) {
    const [a, b] = [faixas[i - 1], faixas[i]];
    if (a.dia === b.dia && minutos(b.abre) < minutos(a.fecha)) {
      throw new BadRequestException(
        `horarios: faixas sobrepostas no mesmo dia (${a.abre}–${a.fecha} e ${b.abre}–${b.fecha}).`,
      );
    }
  }
  return faixas;
}

/** Dia da semana, minutos do dia e data (YYYY-MM-DD) no fuso do campus. */
export function agoraNoCampus(agora: Date = new Date()): {
  dia: number;
  minuto: number;
  data: string;
} {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: FUSO_CAMPUS,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(agora)
      .map((p) => [p.type, p.value]),
  );
  const dias = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    dia: dias.indexOf(partes.weekday),
    minuto: Number(partes.hour) * 60 + Number(partes.minute),
    data: `${partes.year}-${partes.month}-${partes.day}`,
  };
}

/** Aberto agora (horário de Brasília), pelas faixas cadastradas. */
export function abertoAgora(
  faixas: FaixaHorario[],
  agora: Date = new Date(),
): boolean {
  const { dia, minuto } = agoraNoCampus(agora);
  return faixas.some(
    (f) =>
      f.dia === dia && minuto >= minutos(f.abre) && minuto < minutos(f.fecha),
  );
}
