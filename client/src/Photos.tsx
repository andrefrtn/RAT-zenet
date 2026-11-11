import { useId, useRef, useState, type ChangeEvent } from 'react';
import type { Photo, PhotoCategory, PhotoLimits } from '../../shared/rat';
import { apiFetch } from './api';
import { createId } from './storage';

export function Photos({ category, photos, limits, onChange, onBusy, disabled }: {
  category: PhotoCategory; photos: Photo[]; limits: PhotoLimits;
  onChange: (photos: Photo[]) => void; onBusy: (busy: boolean) => void; disabled: boolean;
}) {
  const id = useId();
  const gallery = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const latest = useRef(photos); latest.current = photos;
  async function add(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    setError('');
    if (photos.length + files.length > limits.maxCount) { setError('Limite de ' + limits.maxCount + ' fotos por relatório.'); return; }
    setBusy(true); onBusy(true);
    try {
      for (const file of files) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > limits.maxFileBytes) throw new Error('Use JPEG, PNG ou WebP de até ' + Math.floor(limits.maxFileBytes / 1024 / 1024) + ' MB.');
        const response = await apiFetch('/api/photos/prepare', { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || 'Não foi possível preparar a foto.');
        const updated = [...latest.current, { id: createId(), category, caption: '', data: body.data }];
        latest.current = updated;
        onChange(updated);
      }
    } catch (error) { setError(error instanceof Error ? error.message : 'Conecte-se ao servidor para adicionar fotos.'); }
    finally { setBusy(false); onBusy(false); }
  }
  return <div className="photo-attachments">
    <div className="photo-actions">
      <button type="button" className="subtle-button" disabled={busy || disabled} onClick={() => gallery.current?.click()}>Adicionar fotos</button>
      <button type="button" className="subtle-button" disabled={busy || disabled} onClick={() => camera.current?.click()}>Tirar foto</button>
      {busy && <span role="status">Preparando fotografias…</span>}
    </div>
    <input ref={gallery} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={add} aria-label="Selecionar fotos da galeria" />
    <input ref={camera} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={add} aria-label="Tirar foto com a câmera" />
    {error && <p role="alert" className="error-text">{error}</p>}
    <div className="photo-gallery">
      {photos.filter(photo => photo.category === category).map((photo, index) => <figure key={photo.id}>
        <img src={photo.data} alt={'Foto ' + (index + 1) + (photo.caption ? ' — ' + photo.caption : '')} />
        <label htmlFor={id + photo.id}>Legenda da foto {index + 1}</label>
        <input id={id + photo.id} value={photo.caption} disabled={disabled} maxLength={240} placeholder="Legenda opcional" onChange={event => onChange(photos.map(item => item.id === photo.id ? { ...item, caption: event.target.value } : item))} />
        <button type="button" className="subtle-button" disabled={busy || disabled} onClick={() => onChange(photos.filter(item => item.id !== photo.id))}>Remover foto {index + 1}</button>
      </figure>)}
    </div>
  </div>;
}
