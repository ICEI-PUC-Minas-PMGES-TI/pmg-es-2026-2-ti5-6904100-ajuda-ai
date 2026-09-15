import { Injectable } from '@nestjs/common';
import { Aviso, AVISOS } from '../dados/dados.js';

@Injectable()
export class AvisosService {
  listar(): Aviso[] {
    return AVISOS;
  }
}
