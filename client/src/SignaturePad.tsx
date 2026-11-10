import { useEffect, useRef, useState, type PointerEvent } from 'react';

const width = 960;
const height = 480;

type Props = {
  id: string;
  title: string;
  value: string;
  required: boolean;
  error?: string;
  onChange: (value: string) => void;
};

export function SignatureField({ id, title, value, required, error, onChange }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const initial = useRef(value);
  const [ready, setReady] = useState(!value);
  const revision = useRef(0);
  const stroke = useRef<{ id: number; x: number; y: number; distance: number } | null>(null);

  useEffect(() => {
    const context = canvas.current!.getContext('2d')!;
    if (!initial.current) return;
    const image = new Image();
    const startedAt = revision.current;
    image.onload = () => {
      if (startedAt === revision.current) context.drawImage(image, 0, 0, width, height);
      setReady(true);
    };
    image.onerror = () => setReady(true);
    image.src = initial.current;
    return () => { image.onload = null; image.onerror = null; };
  }, []);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * width / rect.width,
      y: (event.clientY - rect.top) * height / rect.height,
    };
  }

  function begin(event: PointerEvent<HTMLCanvasElement>) {
    if (!ready || stroke.current || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    stroke.current = { id: event.pointerId, ...point(event), distance: 0 };
    revision.current++;
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    const active = stroke.current;
    if (!active || active.id !== event.pointerId) return;
    event.preventDefault();
    const next = point(event);
    const distance = Math.hypot(next.x - active.x, next.y - active.y);
    if (distance < 1) return;
    const context = event.currentTarget.getContext('2d')!;
    context.lineWidth = 6;
    context.strokeStyle = '#161616';
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(active.x, active.y);
    context.lineTo(next.x, next.y);
    context.stroke();
    stroke.current = { id: active.id, ...next, distance: active.distance + distance };
  }

  function finish(event: PointerEvent<HTMLCanvasElement>) {
    const active = stroke.current;
    if (!active || active.id !== event.pointerId) return;
    stroke.current = null;
    if (active.distance > 0) onChange(event.currentTarget.toDataURL('image/png'));
  }

  function clear() {
    stroke.current = null;
    revision.current++;
    canvas.current!.getContext('2d')!.clearRect(0, 0, width, height);
    setReady(true);
    onChange('');
  }

  return (
    <div className="signature">
      <div className="signature-head">
        <div>
          <h3 id={id} tabIndex={-1}>{title}</h3>
          <p className="field-tag">{required ? 'Obrigatória' : 'Opcional'}</p>
        </div>
        <button className="subtle-button" type="button" onClick={clear}>
          Limpar
        </button>
      </div>
      <div className={'signature-surface' + (error ? ' invalid' : value ? ' captured' : '')}>
        {!value && <div className="signature-guide" aria-hidden="true">Assine nesta área</div>}
        <canvas ref={canvas} width={width} height={height} role="img" aria-labelledby={id}
          aria-describedby={id + '-hint'} onPointerDown={begin} onPointerMove={move}
          onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} />
      </div>
      <p id={id + '-hint'} role="status" className={error ? 'error-text' : value ? 'signature-status' : 'hint'}>
        {error || (value ? 'Assinatura registrada' : 'Use o dedo, uma caneta digital ou o mouse.')}
      </p>
    </div>
  );
}
