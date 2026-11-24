import type { RespostasCadastro } from '../participacoes/entities/participacao.entity.js';
import {
  GENEROS_PREFERENCIA,
  validarPreferenciaGenero,
} from '../participacoes/preferencia-genero.js';

/** Fontes canônicas: não exigem perguntas adicionais repetidas no catálogo. */
export const CRITERIOS_CADASTRO = [
  { campo: 'disponibilidade', nome: 'Disponibilidade', operacao: 'intersecao' },
  { campo: 'areas', nome: 'Áreas de apoio', operacao: 'intersecao' },
  { campo: 'interesses', nome: 'Interesses', operacao: 'intersecao' },
  {
    campo: 'preferenciaGenero',
    nome: 'Preferência de gênero',
    operacao: 'preferencia_genero',
  },
  {
    campo: 'bolsistaProuni',
    nome: 'Vivência como bolsista ProUni',
    operacao: 'vivencia_compartilhada',
  },
  {
    campo: 'deOutraCidade',
    nome: 'Vivência de mudança de cidade',
    operacao: 'vivencia_compartilhada',
  },
] as const;
export type CampoCadastroMatching =
  (typeof CRITERIOS_CADASTRO)[number]['campo'];

export function avaliarCadastro(
  campo: CampoCadastroMatching,
  p: RespostasCadastro = {},
  a: RespostasCadastro = {},
) {
  const fonte = CRITERIOS_CADASTRO.find((c) => c.campo === campo)!;
  const base = {
    nomePadrinho: fonte.nome,
    nomeApadrinhado: fonte.nome,
    valorPadrinho: p[campo],
    valorApadrinhado: a[campo],
  };
  const ausente = () => ({
    ...base,
    considerado: false,
    compativel: false,
    fator: 0,
    motivo: 'resposta_ausente',
  });
  if (campo === 'preferenciaGenero') {
    let pp;
    let pa;
    try {
      pp = validarPreferenciaGenero(p.preferenciaGenero);
      pa = validarPreferenciaGenero(a.preferenciaGenero);
    } catch {
      return ausente();
    }
    const preferencias = [
      [pp, a.genero],
      [pa, p.genero],
    ] as const;
    const conhecidas = preferencias.filter(
      ([pref, genero]) =>
        pref?.modo === 'sem_preferencia' ||
        (pref?.modo === 'preferencia' &&
          (GENEROS_PREFERENCIA as readonly unknown[]).includes(genero)),
    );
    const neutras = preferencias.filter(
      ([pref]) => pref?.modo === 'sem_preferencia',
    );
    const avaliaveis = conhecidas.filter(
      ([pref]) => pref?.modo === 'preferencia',
    );
    const atendidas = avaliaveis.filter(([pref, genero]) =>
      pref!.generos.includes(genero!),
    ).length;
    return {
      ...base,
      considerado: avaliaveis.length > 0,
      compativel: avaliaveis.length > 0 && atendidas === avaliaveis.length,
      // Cada direção responde por metade do critério; neutralidade explícita
      // é conhecida, enquanto uma preferência ausente permanece desconhecida.
      fator: atendidas / 2,
      fracaoConhecida: conhecidas.length / 2,
      fracaoNeutra: neutras.length / 2,
      motivo: avaliaveis.length
        ? 'preferencia_declarada'
        : neutras.length === 2
          ? 'sem_preferencia'
          : 'resposta_ausente',
      generoPadrinho: p.genero,
      generoApadrinhado: a.genero,
    };
  }

  // "Online" descreve modalidade, não um horário compartilhado.
  const horarios = (valor: unknown) =>
    Array.isArray(valor) ? valor.filter((v) => v !== 'Online') : valor;
  const vp = campo === 'disponibilidade' ? horarios(p[campo]) : p[campo];
  const va = campo === 'disponibilidade' ? horarios(a[campo]) : a[campo];
  if (campo === 'bolsistaProuni' || campo === 'deOutraCidade') {
    if (typeof vp !== 'boolean' || typeof va !== 'boolean') return ausente();
    // Dois "não" não constituem a vivência que este critério procura valorizar.
    if (!vp && !va)
      return {
        ...base,
        considerado: false,
        compativel: false,
        fator: 0,
        motivo: 'vivencia_nao_aplicavel',
      };
    return {
      ...base,
      considerado: true,
      compativel: vp && va,
      fator: vp && va ? 1 : 0,
      motivo: 'vivencia_compartilhada',
    };
  }
  if (!Array.isArray(vp) || !Array.isArray(va) || !vp.length || !va.length)
    return ausente();
  const valores = (lista: unknown[]) => [
    ...new Set(
      lista
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.trim().normalize('NFC').toLocaleLowerCase('pt-BR'))
        .filter((v) => v && (campo !== 'disponibilidade' || v !== 'online')),
    ),
  ];
  const padrinho = valores(vp);
  const apadrinhado = valores(va);
  if (!padrinho.length || !apadrinhado.length) return ausente();
  const comuns = padrinho.filter((v) => apadrinhado.includes(v)).length;
  const compativel = comuns > 0;
  // Apoio é direcional: quanto da necessidade do apadrinhado é atendido.
  // Interesses usam Jaccard; disponibilidade exige algum horário em comum.
  const fator =
    campo === 'areas'
      ? comuns / apadrinhado.length
      : campo === 'interesses'
        ? comuns / new Set([...padrinho, ...apadrinhado]).size
        : compativel
          ? 1
          : 0;
  return {
    ...base,
    considerado: true,
    compativel,
    fator,
    itensEmComum: comuns,
    itensSolicitados: apadrinhado.length,
    motivo:
      campo === 'areas'
        ? 'apoio_solicitado_atendido'
        : campo === 'interesses'
          ? 'afinidade_interesses'
          : 'intersecao',
  };
}
