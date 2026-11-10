import { useId, useRef, type ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';

type SectionDetails = { title: string; description?: string };

function SectionHeader({ id, title, description }: SectionDetails & { id: string }) {
  return (
    <div className="section-heading">
      <h2 id={id}>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  );
}

export function FormSection({ title, description, children }: SectionDetails & {
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section className="form-section" aria-labelledby={headingId}>
      <SectionHeader id={headingId} title={title} description={description} />
      <div className="section-content">{children}</div>
    </section>
  );
}

export function StatusIndicator({ label, tone = 'neutral' }: {
  label: string;
  tone?: 'neutral' | 'active' | 'warning' | 'success';
}) {
  return <span className="status-indicator" data-tone={tone}>{label}</span>;
}

type StepProps = {
  steps: readonly { title: string; short: string }[];
  current: number;
  disabled: boolean;
  complete: boolean;
  onSelect: (index: number) => void;
};

function StepList({ steps, current, disabled, complete, onSelect }: StepProps) {
  return (
    <nav aria-label="Etapas do relatório">
      <ol className="step-list">
        {steps.map((step, index) => {
          const state = complete || index < current ? 'done' : index === current ? 'current' : 'pending';
          return (
            <li key={step.title}>
              <button type="button" className="step-link" data-state={state} aria-current={state === 'current' ? 'step' : undefined}
                disabled={disabled || state !== 'done'} onClick={() => onSelect(index)}>
                <span className="step-number" aria-hidden="true">{state === 'done' ? <Check size={16} /> : String(index + 1).padStart(2, '0')}</span>
                <span className="step-copy">
                  <span>{step.short}</span>
                  <small>{state === 'done' ? 'Concluída' : state === 'current' ? 'Etapa atual' : 'Pendente'}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ProgressTrack({ value, total }: { value: number; total: number }) {
  return <progress max={total} value={value} aria-label="Progresso do preenchimento" />;
}

export function StepNavigation({ compact, ...props }: StepProps & { compact?: boolean }) {
  const disclosure = useRef<HTMLDetailsElement>(null);
  const { complete, current, steps } = props;
  const position = current + 1;
  const count = steps.length;

  if (compact) {
    if (complete) return null;
    return (
      <div className="mobile-progress">
        <div className="mobile-progress-line">
          <p><span>Etapa {position} de {count}</span> <strong>{steps[current].short}</strong></p>
          <details ref={disclosure}>
            <summary>Etapas <ChevronDown size={14} aria-hidden="true" /></summary>
            <div className="mobile-step-list">
              <StepList {...props} onSelect={index => {
                if (disclosure.current) disclosure.current.open = false;
                props.onSelect(index);
              }} />
            </div>
          </details>
        </div>
        <ProgressTrack value={position} total={count} />
      </div>
    );
  }

  return (
    <aside className="workflow-rail">
      <div className="rail-inner">
        <h2 className="rail-heading">Etapas do relatório</h2>
        <StepList {...props} />
        <div className="rail-progress">
          <div><span>Progresso</span><strong>{complete ? count : position} / {count}</strong></div>
          <ProgressTrack value={complete ? count : position} total={count} />
        </div>
      </div>
    </aside>
  );
}
