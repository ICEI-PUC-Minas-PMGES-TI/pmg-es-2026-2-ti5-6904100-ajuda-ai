// O Entra emite ID token; somente /auth/login cria a sessão da aplicação.
const clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID;
const tenantId = import.meta.env.VITE_MICROSOFT_TENANT_ID;
const redirectUri = import.meta.env.VITE_MICROSOFT_REDIRECT_URI || `${location.origin}/auth/callback`;
const base = () => `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0`;
function base64url(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function aleatorio() { return base64url(crypto.getRandomValues(new Uint8Array(32))); }
export async function iniciarMicrosoft() {
  if (!clientId || !tenantId) throw new Error('Login Microsoft web não configurado. Configure VITE_MICROSOFT_CLIENT_ID, VITE_MICROSOFT_TENANT_ID e o redirect SPA no Entra ID.');
  const verifier = aleatorio(); const state = aleatorio(); const nonce = aleatorio();
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  sessionStorage.setItem('ajudaai.microsoft', JSON.stringify({verifier, state, nonce, em: Date.now()}));
  location.assign(`${base()}/authorize?${new URLSearchParams({client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid profile email', state, nonce, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account'})}`);
}
let callbackPromise;
export function concluirMicrosoft() {
  // Evita consumir o código duas vezes, inclusive no StrictMode.
  return callbackPromise ??= trocarCodigo();
}
async function trocarCodigo() {
  const params = new URLSearchParams(location.search);
  const stored = JSON.parse(sessionStorage.getItem('ajudaai.microsoft') || 'null');
  sessionStorage.removeItem('ajudaai.microsoft');
  history.replaceState(null, '', '/auth/callback');
  if (!stored || params.get('state') !== stored.state || Date.now() - stored.em > 600000) throw new Error('Retorno Microsoft inválido ou expirado. Entre novamente.');
  if (params.get('error')) throw new Error(params.get('error_description') || 'Login Microsoft cancelado.');
  const r = await fetch(`${base()}/token`, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({client_id: clientId, redirect_uri: redirectUri, grant_type: 'authorization_code', code: params.get('code') || '', code_verifier: stored.verifier, scope: 'openid profile email'})});
  const token = await r.json();
  if (!r.ok || !token.id_token) throw new Error('Não foi possível concluir o login Microsoft. Confira o redirect SPA no Entra ID.');
  const segmento = token.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const claims = JSON.parse(atob(segmento));
  if (claims.nonce !== stored.nonce) throw new Error('Retorno Microsoft inválido.');
  return token.id_token;
}
