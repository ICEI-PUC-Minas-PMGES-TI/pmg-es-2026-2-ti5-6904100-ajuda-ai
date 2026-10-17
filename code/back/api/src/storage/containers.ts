/**
 * Containers já criados na conta. A API não cria container nenhum.
 * Público: URL permanente, sem SAS de leitura.
 * Privado: só chave estável + SAS curta na hora do acesso.
 */
export const CONTAINERS = {
  mapAssets: 'map-assets',
  restaurantMenus: 'restaurant-menus',
  profiles: 'profiles',
  feed: 'feed',
  chat: 'chat',
} as const;

export type ContainerArmazenamento =
  (typeof CONTAINERS)[keyof typeof CONTAINERS];

const PUBLICOS = new Set<ContainerArmazenamento>([
  CONTAINERS.mapAssets,
  CONTAINERS.restaurantMenus,
]);

const PRIVADOS = new Set<ContainerArmazenamento>([
  CONTAINERS.profiles,
  CONTAINERS.feed,
  CONTAINERS.chat,
]);

const PERMITIDOS = new Set<string>([...PUBLICOS, ...PRIVADOS]);

export function ehContainerPermitido(
  valor: string,
): valor is ContainerArmazenamento {
  return PERMITIDOS.has(valor);
}

export function ehContainerPublico(container: ContainerArmazenamento): boolean {
  return PUBLICOS.has(container);
}

export function ehContainerPrivado(container: ContainerArmazenamento): boolean {
  return PRIVADOS.has(container);
}
