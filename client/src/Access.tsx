import { useEffect, useState, type ReactNode } from 'react';
import { readDraft, type Snapshot } from './storage';

export function Access({ children }: { children: (snapshot: Snapshot) => ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    readDraft().then(value => { if (active) setSnapshot(value); })
      .catch(() => { if (active) setError('Não foi possível abrir o rascunho. Tente novamente.'); });
    return () => { active = false; };
  }, [attempt]);
  if (snapshot) return <>{children(snapshot)}</>;
  return <main className="access-shell"><div className="access-panel">
    <img src="/zenet.png" alt="ZENET" width={124} height={44} />
    <h1>RAT Digital</h1>
    {error ? <><p role="alert" className="error-text">{error}</p>
      <button className="button primary" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></>
      : <p role="status" className="stage-description">Abrindo atendimento…</p>}
  </div></main>;
}
