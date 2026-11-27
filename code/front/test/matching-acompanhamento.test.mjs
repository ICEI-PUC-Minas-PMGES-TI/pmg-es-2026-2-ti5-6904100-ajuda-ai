import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acompanharMatching } from '../src/pages/coordenacao/acompanharMatching.js';
function cenario(respostas, opcoes = {}) {
  let chamadas = 0, esperas = 0, falhas = 0, tempo = 0;
  const atualizacoes = [];
  const promise = acompanharMatching({
    consultar: async () => { const r = respostas[Math.min(chamadas++, respostas.length - 1)] ?? []; if (r instanceof Error) throw r; return r; },
    operacaoId: 'minha-operacao', ativo: () => true, agora: () => tempo,
    atualizar: e => atualizacoes.push(e), erroRede: () => falhas++,
    esperar: async () => { esperas++; tempo += 1500; assert.ok(esperas <= 121); }, ...opcoes,
  });
  return { promise, dados: () => ({ chamadas, esperas, falhas, atualizacoes }) };
}
const rodada = (status, extras = {}) => ({ id: 11, operacaoId: 'minha-operacao', status, ...extras });
test('resposta POST perdida acompanha exatamente a operação até concluir', async () => {
 const final = rodada('concluida'); const c = cenario([[rodada('executando')], [final]]);
 assert.deepEqual(await c.promise, final); assert.equal(c.dados().chamadas, 2);
});
test('POST não chegou ao servidor: encerra a espera e permite repetir a mesma operação', async () => {
 const c = cenario([[]]); await assert.rejects(c.promise, e => e.codigo === 'execucao_nao_confirmada');
 assert.equal(c.dados().esperas, 10);
});
test('não atribui a conclusão de outro coordenador ao pedido que não chegou à API', async () => {
 const c = cenario([[rodada('concluida', {id:12,operacaoId:'outra-operacao'})]]);
 await assert.rejects(c.promise, e => e.codigo === 'execucao_nao_confirmada');
});
test('uma rodada alheia mais recente não substitui a operação procurada', async () => {
 const outra = rodada('concluida', {id:12,operacaoId:'outra-operacao'});
 const c = cenario([[outra,rodada('executando')],[outra,rodada('falha',{erro:'Prazo expirou'})]]);
 assert.equal((await c.promise).erro,'Prazo expirou');
});
test('mesmo sem conexão o acompanhamento tem um prazo total', async () => {
 const c = cenario([[rodada('executando')],new Error('Rede indisponível')],{prazoTotalMs:6000});
 await assert.rejects(c.promise,e=>e.codigo==='acompanhamento_expirado');
 assert.equal(c.dados().esperas,4);
});
test('retoma uma execução legada exclusivamente pelo ID conhecido', async () => {
 const c=cenario([[rodada('concluida',{id:12}),rodada('falha')]],{operacaoId:undefined,execucaoId:11});
 assert.equal((await c.promise).id,11);
});
test('resposta tardia não atualiza a tela depois da troca de contexto', async () => {
 let ativo=true;const c=cenario([],{ativo:()=>ativo,consultar:async()=>{ativo=false;return[rodada('concluida')];}});
 assert.equal(await c.promise,null);assert.deepEqual(c.dados().atualizacoes,[]);
});
test('sessão expirada encerra o acompanhamento sem repetir a requisição', async () => {
 const c=cenario([Object.assign(new Error('Sessão expirou'),{status:401})]);
 await assert.rejects(c.promise,/Sessão expirou/);assert.equal(c.dados().chamadas,1);
});
