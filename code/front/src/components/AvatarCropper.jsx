import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import './AvatarCropper.css';

const TAMANHO_SAIDA = 512;

export default function AvatarCropper({ arquivo, onCancelar, onConfirmar }) {
  const imagemRef = useRef(null);
  const areaRef = useRef(null);
  const arrastoRef = useRef(null);
  const [url, setUrl] = useState(null);
  const [dimensoes, setDimensoes] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [deslocamento, setDeslocamento] = useState({ x: 0, y: 0 });
  const [erro, setErro] = useState('');
  const [processando, setProcessando] = useState(false);

  useEffect(() => {
    const local = URL.createObjectURL(arquivo);
    setUrl(local);
    return () => URL.revokeObjectURL(local);
  }, [arquivo]);

  function limitar(posicao, fator = zoom) {
    const area = areaRef.current;
    if (!area || !dimensoes) return posicao;
    const escala = Math.max(
      area.clientWidth / dimensoes.largura,
      area.clientHeight / dimensoes.altura,
    ) * fator;
    const limiteX = Math.max(0, (dimensoes.largura * escala - area.clientWidth) / 2);
    const limiteY = Math.max(0, (dimensoes.altura * escala - area.clientHeight) / 2);
    return {
      x: Math.max(-limiteX, Math.min(limiteX, posicao.x)),
      y: Math.max(-limiteY, Math.min(limiteY, posicao.y)),
    };
  }

  function iniciarArrasto(event) {
    if (!dimensoes) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    arrastoRef.current = {
      x: event.clientX,
      y: event.clientY,
      inicio: deslocamento,
    };
  }

  function mover(event) {
    const inicio = arrastoRef.current;
    if (!inicio) return;
    setDeslocamento(limitar({
      x: inicio.inicio.x + event.clientX - inicio.x,
      y: inicio.inicio.y + event.clientY - inicio.y,
    }));
  }

  function alterarZoom(valor) {
    const novoZoom = Number(valor);
    setZoom(novoZoom);
    setDeslocamento((atual) => limitar(atual, novoZoom));
  }

  async function confirmar() {
    const imagem = imagemRef.current;
    const area = areaRef.current;
    if (!imagem || !area || !dimensoes) return;
    setProcessando(true);
    setErro('');
    try {
      const escala = Math.max(
        area.clientWidth / dimensoes.largura,
        area.clientHeight / dimensoes.altura,
      ) * zoom;
      const largura = area.clientWidth / escala;
      const altura = area.clientHeight / escala;
      const sx = dimensoes.largura / 2 - deslocamento.x / escala - largura / 2;
      const sy = dimensoes.altura / 2 - deslocamento.y / escala - altura / 2;
      const canvas = document.createElement('canvas');
      canvas.width = TAMANHO_SAIDA;
      canvas.height = TAMANHO_SAIDA;
      const contexto = canvas.getContext('2d');
      if (!contexto) throw new Error('Não foi possível ajustar esta imagem.');
      contexto.drawImage(
        imagem,
        sx,
        sy,
        largura,
        altura,
        0,
        0,
        TAMANHO_SAIDA,
        TAMANHO_SAIDA,
      );
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((resultado) => (
          resultado ? resolve(resultado) : reject(new Error('Não foi possível processar a imagem.'))
        ), 'image/webp', 0.9);
      });
      if (blob.size > 5 * 1024 * 1024) {
        throw new Error('A imagem ajustada excede o limite de 5 MB.');
      }
      onConfirmar(new File([blob], 'avatar.webp', { type: blob.type }));
    } catch (falha) {
      setErro(falha.message || 'Não foi possível ajustar esta imagem.');
      setProcessando(false);
    }
  }

  return (
    <Modal
      titulo="Ajustar foto"
      descricao="Arraste para posicionar e use o controle para aproximar ou afastar."
      onFechar={onCancelar}
      tamanho="sm"
      className="avatar-crop-modal"
      acoes={(
        <>
          <button type="button" className="ghost-button" onClick={onCancelar} disabled={processando}>
            Cancelar
          </button>
          <button type="button" className="primary-button" onClick={confirmar} disabled={!dimensoes || processando}>
            {processando ? 'Processando…' : 'Confirmar enquadramento'}
          </button>
        </>
      )}
    >
      <div
        ref={areaRef}
        className="avatar-crop-area"
        onPointerDown={iniciarArrasto}
        onPointerMove={mover}
        onPointerUp={() => { arrastoRef.current = null; }}
        onPointerCancel={() => { arrastoRef.current = null; }}
        role="img"
        aria-label="Prévia circular da foto de perfil"
      >
        {url && (
          <img
            ref={imagemRef}
            className="avatar-crop-image"
            src={url}
            alt=""
            draggable="false"
            onLoad={(event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget;
              setDimensoes({ largura: naturalWidth, altura: naturalHeight });
            }}
            onError={() => setErro('Não foi possível abrir esta imagem.')}
            style={dimensoes ? {
              width: dimensoes.largura * Math.max(
                (areaRef.current?.clientWidth || 0) / dimensoes.largura,
                (areaRef.current?.clientHeight || 0) / dimensoes.altura,
              ),
              height: dimensoes.altura * Math.max(
                (areaRef.current?.clientWidth || 0) / dimensoes.largura,
                (areaRef.current?.clientHeight || 0) / dimensoes.altura,
              ),
              maxWidth: 'none',
              left: '50%',
              top: '50%',
              translate: `calc(-50% + ${deslocamento.x}px) calc(-50% + ${deslocamento.y}px)`,
              scale: zoom,
            } : undefined}
          />
        )}
      </div>
      <label className="avatar-crop-zoom">
        <span>Zoom</span>
        <input
          type="range"
          min="1"
          max="3"
          step="0.01"
          value={zoom}
          onChange={(event) => alterarZoom(event.target.value)}
          disabled={!dimensoes || processando}
          aria-label="Aproximar ou afastar a foto"
        />
      </label>
      {erro && <p className="error-message" role="alert">{erro}</p>}
    </Modal>
  );
}
