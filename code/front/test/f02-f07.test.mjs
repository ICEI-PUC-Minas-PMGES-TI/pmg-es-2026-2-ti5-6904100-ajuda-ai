import {test, after, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter, Routes, Route, Outlet} from 'react-router-dom';
const storage = new Map();
globalThis.localStorage = {getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
const server = await createServer({server:{middlewareMode:true},appType:'custom'});
after(() => server.close());
const {resolverAluno, ESTADOS_ALUNO, escolherCiclo} = await server.ssrLoadModule('/src/auth/resolverAluno.js');
const client = await server.ssrLoadModule('/src/api/client.js');
const {default:Status} = await server.ssrLoadModule('/src/pages/aluno/StatusCandidaturaPage.jsx');
const {RevisaoPadrinho} = await server.ssrLoadModule('/src/pages/cadastro/CandidaturaPadrinhoForm.jsx');
const {ROTULO_SITUACAO_COORD, badgeClass} = await server.ssrLoadModule('/src/pages/coordenacao/comum.jsx');
const perfil={nome:'Aluno',email:'aluno@pucminas.edu.br',curso:'SI',periodo:3,turno:'Noite',interesses:[]};
for(const estado of Object.keys(ESTADOS_ALUNO)) test(`estado ${estado} libera somente permissões confirmadas`,()=>{
  const r=resolverAluno(perfil,{situacao:estado},{inscricoesDisponiveis:true});
  assert.equal(r.ativo,['padrinho_ativo','apadrinhado_ativo'].includes(estado));
  assert.equal(r.podePadrinho,estado==='nenhuma');
  assert.equal(r.podeApadrinhado,false);
});
test('perfil incompleto, completo, ciclo fechado e estado desconhecido',()=>{
  assert.equal(resolverAluno({...perfil,curso:''},{situacao:'nenhuma'}).destino,'/');
  assert.equal(resolverAluno(perfil,{situacao:'nenhuma'}).destino,'/aluno/inicio');
  assert.equal(resolverAluno(perfil,{situacao:'nenhuma'},{inscricoesDisponiveis:false}).podePadrinho,false);
  assert.equal(resolverAluno(perfil,{situacao:'antigo'}).ativo,false);
  assert.equal(escolherCiclo([{codigo:'2026/1'},{codigo:'2026/2',atual:true}]),'2026/2');
  assert.equal(escolherCiclo([{codigo:'2027/1'},{codigo:'2027/2'}]),'');
});
function renderPage(Component,context){return renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(Routes,null,React.createElement(Route,{element:React.createElement(Outlet,{context})},React.createElement(Route,{index:true,element:React.createElement(Component)})))));}
for(const [estado,texto] of [['candidatura_pendente','Candidatura recebida'],['candidatura_em_analise','Nossa equipe está analisando'],['candidatura_rejeitada','Requisito não atendido'],['candidatura_aprovada_aguardando_matching','Aguardando definição do seu grupo'],['padrinho_ativo','Vínculo confirmado']]) test(`acompanhamento renderiza ${estado}`,()=>{
  const dados={situacao:estado,programa:{codigo:'2026/2',titulo:'Programa 2026/2',etapas:[]},registro:{papel:estado==='padrinho_ativo'?'padrinho':'candidato',status:estado==='candidatura_rejeitada'?'nao_aprovado':estado==='candidatura_em_analise'?'em_analise':'pendente',decisao:{justificativa:'Requisito não atendido'}}};
  const html=renderPage(Status,{situacao:dados});
  assert.ok(html.includes(texto));assert.ok(html.includes('2026/2'));assert.doesNotMatch(html,/Editar candidatura/);
});
test('revisão mostra dados, respostas, requisitos e confirmação explícita',()=>{
  let confirmacoes=0;let voltas=0;
  const props={perfil,email:perfil.email,programa:'2026/2',revisao:{motivacao:'Apoiar calouros',areas:['Projetos'],extras:{apoio:'Acadêmico'}},perguntas:[{id:'apoio',enunciado:'Área adicional'}],requisitos:[{id:'aed',descricao:'AED I'}],form:{requisitos:{aed:true}},confirmar:()=>confirmacoes++,onVoltar:()=>voltas++};
  const tree=RevisaoPadrinho(props);
  const html=renderToStaticMarkup(tree);
  for(const texto of ['Revise sua candidatura','Apoiar calouros','Acadêmico','AED I','Confirmar envio','Voltar e editar']) assert.ok(html.includes(texto));
  assert.equal(confirmacoes,0);
  function buttons(n){if(!n || typeof n!=='object')return []; if(n.type==='button')return [n]; return React.Children.toArray(n.props?.children).flatMap(buttons);}
  const bs=buttons(tree);bs[0].props.onClick();assert.equal(voltas,1);assert.equal(confirmacoes,0);bs[1].props.onClick();assert.equal(confirmacoes,1);
  assert.ok(buttons(RevisaoPadrinho({...props,enviando:true})).every(b=>b.props.disabled));
});
test('coordenação distingue aprovação aguardando matching',()=>{
  assert.match(ROTULO_SITUACAO_COORD.candidatura_aprovada_aguardando_matching,/matching/);
  assert.equal(badgeClass('aprovado','candidato'),'aprovada');
});
test('perfil, foto e candidatura usam sessão autenticada, sem identidade da URL',async()=>{
  const calls=[];client.clearAlunoSession();client.persistAlunoSession({accessToken:'jwt',usuario:perfil});client.selecionarProgramaAluno('2026/2');
  globalThis.fetch=async(url,opts)=>{calls.push({url,...opts});return new Response(JSON.stringify(url.endsWith('/cadastro')?{accessToken:'novo',usuario:perfil,participacao:{status:'pendente'}}:{...perfil,url:null}),{status:200});};
  await client.api.perfilAluno();await client.api.atualizarPerfil({nome:'Editado'});await client.api.fotoAluno();await client.api.salvarFoto(new Blob(['foto'],{type:'image/png'}));await client.api.cadastrar({...perfil,tipoParticipacao:'padrinho',respostas:{}});
  assert.ok(calls.every(c=>c.headers.Authorization==='Bearer jwt'));
  assert.ok(calls.every(c=>!Object.hasOwn(c.headers,'x-user-id')));
  assert.equal(JSON.parse(calls.at(-1).body).programa,'2026/2');
  assert.ok(calls[3].body instanceof FormData);assert.equal(calls[3].body.has('foto'),true);
  client.clearAlunoSession();assert.equal(client.getAlunoSession(),null);
  await assert.rejects(()=>client.api.situacao(perfil.email),/sessão expirou/);
});
