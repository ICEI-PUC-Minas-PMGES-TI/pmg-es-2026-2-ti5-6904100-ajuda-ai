import assert from 'node:assert/strict';
import test from 'node:test';
import { criarConversasMock } from '../src/pages/aluno/chatMock.js';

test('conversas mock demonstram estados enviada, entregue e lida', () => {
  const conversas = criarConversasMock();
  const estados = new Set(
    conversas
      .flatMap((conversa) => conversa.mensagens)
      .map((mensagem) => mensagem.estado)
      .filter(Boolean),
  );
  assert.deepEqual(estados, new Set(['lida', 'entregue', 'enviada']));
});

test('cada tela recebe uma cópia independente das conversas de demonstração', () => {
  const primeira = criarConversasMock();
  const segunda = criarConversasMock();
  primeira[0].mensagens.push({
    id: 'local',
    remetente: 'eu',
    texto: 'Mensagem de teste',
  });
  assert.equal(segunda[0].mensagens.length, 5);
});
