/**
 * Conteúdo do campus administrado pela coordenação: eventos,
 * restaurantes/lanchonetes e cardápios. Fica no schema `mapa` porque é
 * conteúdo posicionado no mapa, como `mapa.pucstops`; não pertence a uma
 * versão do mapa (é editado sem publicar versão nova). A versão ativa só
 * entra na validação: o local precisa existir nela (prédio/área) ou cair
 * dentro do campus (ponto).
 *
 * Limites iguais na API e nas CHECKs da migration EventosRestaurantesCardapios.
 * Título e nome: 3..255 como no PUCMaps (`EventTitle`, `CanteenName`).
 */
export const TITULO_EVENTO = { min: 3, max: 255 } as const;
export const NOME_RESTAURANTE = { min: 3, max: 255 } as const;
export const DESCRICAO_MAX = 2000;
/** Evento mais longo aceito (dias): evita "evento" que é na verdade um aviso fixo. */
export const DURACAO_EVENTO_MAX_DIAS = 31;
/** Vigência máxima de um cardápio (dias): semana, quinzena ou mês. */
export const VIGENCIA_CARDAPIO_MAX_DIAS = 31;

/** Arquivo de cardápio: imagem ou PDF, como a cantina publica. */
export const CARDAPIO_TAMANHO_MAX = 10 * 1024 * 1024;
export const TIPOS_CARDAPIO = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
] as const;
export type TipoCardapio = (typeof TIPOS_CARDAPIO)[number];

/** Fuso das datas "de hoje" (cardápio do dia, aberto agora). */
export const FUSO_CAMPUS = 'America/Sao_Paulo';
