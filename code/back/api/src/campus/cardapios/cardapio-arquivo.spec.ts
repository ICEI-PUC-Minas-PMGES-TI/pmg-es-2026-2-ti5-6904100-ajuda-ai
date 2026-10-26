import { BadRequestException } from '@nestjs/common';
import {
  detectarTipoCardapio,
  exigirArquivoCardapio,
  nomeBlobCardapio,
} from './cardapio-arquivo.js';

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const webp = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from('WEBPVP8 '),
]);
const pdf = Buffer.from('%PDF-1.7\n%âãÏÓ\n');

describe('arquivo de cardápio', () => {
  it('detecta o tipo pelos bytes', () => {
    expect(detectarTipoCardapio(png)).toBe('image/png');
    expect(detectarTipoCardapio(jpeg)).toBe('image/jpeg');
    expect(detectarTipoCardapio(webp)).toBe('image/webp');
    expect(detectarTipoCardapio(pdf)).toBe('application/pdf');
  });

  it('recusa vazio, outro formato (mesmo com nome .png) e acima de 10 MB', () => {
    for (const dados of [
      undefined,
      Buffer.alloc(0),
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      Buffer.from('GIF89a'),
      Buffer.from('<html>cardapio.pdf</html>'),
      Buffer.concat([pdf, Buffer.alloc(10 * 1024 * 1024)]),
    ]) {
      expect(() => exigirArquivoCardapio(dados)).toThrow(BadRequestException);
    }
    expect(exigirArquivoCardapio(pdf)).toBe('application/pdf');
  });

  it('nome determinístico, sem nada do nome original', () => {
    expect(
      nomeBlobCardapio(
        '3f6c2a1e-8b4d-4c2a-9e1f-0a7b5c3d2e10',
        '9d2e4b7a-1c3f-4a5b-8e6d-2f0c1b9a8e77',
        'image/jpeg',
      ),
    ).toBe(
      'restaurantes/3f6c2a1e-8b4d-4c2a-9e1f-0a7b5c3d2e10/cardapios/9d2e4b7a-1c3f-4a5b-8e6d-2f0c1b9a8e77.jpg',
    );
  });
});
