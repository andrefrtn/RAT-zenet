import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useForm } from 'react-hook-form';
import { ArrowLeft, ArrowRight, CheckCircle2, Download, LoaderCircle } from 'lucide-react';
import {
  closingIssues, closingKeys, company, dataKeys, detailLimit, displayDate, emptyDraft, labels,
  openingChannels, ratFields, reportKeys, serviceTypes, shortLimit, signatureKeys, statuses, totals,
  type Draft, type Field,
} from '../../shared/rat';
import { DateField, SelectField, TextAreaField, TextField, TimeField } from './FormFields';
import { SignatureField } from './SignaturePad';
import { FormSection, StatusIndicator, StepNavigation } from './Workspace';
import { createId, readDraft, removeDraft, writeDraft, type Session } from './storage';

const steps = [
  { short: 'Atendimento', title: 'Dados do atendimento', description: 'Identifique o chamado, o cliente e o equipamento atendido.', fields: dataKeys },
  { short: 'Relatório técnico', title: 'Relatório técnico', description: 'Documente o problema, a solução e as pendências.', fields: reportKeys },
  { short: 'Fechamento', title: 'Fechamento', description: 'Registre os horários, o deslocamento e a situação final do equipamento.', fields: closingKeys },
  { short: 'Assinaturas', title: 'Assinaturas', description: 'Colete as assinaturas do atendimento nesta tela.', fields: signatureKeys },
  { short: 'Revisão', title: 'Revisão', description: 'Confira os dados e as assinaturas antes de finalizar.', fields: [] },
];
const required = new Set<Field>(['number', 'serviceType', 'opening', 'date', 'client', 'technician', 'equipment', 'problem', 'arrival', 'start', 'end', 'status']);
const validationNotice = 'Confira os campos destacados.';
type Errors = Partial<Record<Field, string>>;
type Config = { requireTechnician: boolean; mailMode: 'test' | 'smtp' };
type Result = { report: Draft; pdf: Blob; filename: string; mode: Config['mailMode'] };
type ApiError = { message?: string; editable?: boolean; errors?: Partial<Record<Field, string[]>> };

function ReviewFields({ fields, values }: { fields: readonly Field[]; values: Draft }) {
  return <dl className="review-grid">
    {fields.map(field => <div className={['problem', 'solution', 'pending', 'notes'].includes(field) ? 'wide' : undefined} key={field}><dt>{labels[field]}</dt>
      <dd>{field === 'date' ? displayDate(values[field]) : values[field] || '—'}</dd></div>)}
  </dl>;
}

export default function App() {
  const [initial] = useState(readDraft);
  const [session, setSession] = useState(initial.session);
  const sessionRef = useRef(session);
  const [config, setConfig] = useState<Config | null>(null);
  const [configError, setConfigError] = useState(false);
  const [configAttempt, setConfigAttempt] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [result, setResult] = useState<Result | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const discardButton = useRef<HTMLButtonElement>(null);
  const { register, watch, setValue, reset, getValues } = useForm<Draft>({ defaultValues: initial.values });
  const values = watch();
  const step = session.step;
  const current = steps[step];
  const calculated = totals(values);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/config', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error();
      const next = await response.json() as Config;
      if (typeof next.requireTechnician !== 'boolean' || !['smtp', 'test'].includes(next.mailMode)) throw new Error();
      setConfig(next);
      setConfigError(false);
    }).catch(() => {
      if (!controller.signal.aborted) setConfigError(true);
    });
    return () => controller.abort();
  }, [configAttempt]);

  useEffect(() => {
    const subscription = watch(() => {
      setStorageError(!writeDraft(getValues(), sessionRef.current));
    });
    return () => subscription.unsubscribe();
  }, [watch, getValues]);

  function persist(next: Session) {
    sessionRef.current = next;
    setSession(next);
    setStorageError(!writeDraft(getValues(), next));
  }

  function moveTo(next: number) {
    persist({ ...sessionRef.current, step: next });
    setConfirmDiscard(false);
    setNotice('');
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
  }

  function clearFieldError(field: Field) {
    setErrors(previous => {
      if (!previous[field]) return previous;
      const next = { ...previous };
      delete next[field];
      return next;
    });
  }

  function validate(index: number, draft: Draft): Errors {
    const found: Errors = {};
    for (const field of steps[index].fields) {
      const parsed = ratFields.shape[field].safeParse(draft[field]);
      if (!parsed.success) found[field] = parsed.error.issues[0].message;
    }
    if (index === 2) {
      Object.assign(found, closingIssues({ ...draft, kmStart: draft.kmStart.trim(), kmEnd: draft.kmEnd.trim() }));
    }
    if (index === 3) {
      if (!draft.clientSignature) found.clientSignature = 'Colete a assinatura do cliente.';
      if (config?.requireTechnician && !draft.technicianSignature) found.technicianSignature = 'Colete a assinatura do técnico.';
    }
    return found;
  }

  function focusError(found: Errors) {
    const first = Object.keys(found)[0];
    if (first) requestAnimationFrame(() => {
      const target = document.getElementById('field-' + first);
      target?.scrollIntoView({ block: 'center' });
      target?.focus({ preventScroll: true });
    });
  }

  function nextStep() {
    const found = validate(step, getValues());
    setErrors(found);
    if (Object.keys(found).length) {
      setNotice(validationNotice);
      focusError(found);
    } else {
      moveTo(step + 1);
    }
  }

  async function finalize() {
    if (busyRef.current || !config) return;
    const report = getValues();
    if (!sessionRef.current.locked) {
      for (let index = 0; index < 4; index++) {
        const found = validate(index, report);
        if (!Object.keys(found).length) continue;
        moveTo(index);
        setErrors(found);
        setNotice(validationNotice);
        focusError(found);
        return;
      }
    }
    busyRef.current = true;
    setBusy(true);
    setNotice('');
    const id = sessionRef.current.id || createId();
    persist({ id, step: 4, locked: true });
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 65_000);
    try {
      const response = await fetch('/api/rat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: id, report }), signal: controller.signal,
      });
      if (!response.ok) {
        const error: ApiError = await response.json().catch(() => ({}));
        if (error.editable) {
          persist({ id, step: 4, locked: false });
          if (error.errors) {
            const found = Object.fromEntries(Object.entries(error.errors).map(([field, issues]) => [field, issues?.[0]]));
            setErrors(found);
            const invalidStep = steps.findIndex(entry => entry.fields.some(field => found[field]));
            if (invalidStep >= 0) {
              moveTo(invalidStep);
              focusError(found);
            }
          }
        }
        setNotice(error.message || 'O servidor não confirmou o envio. Tente novamente.');
        return;
      }
      const mode = response.headers.get('X-Mail-Mode');
      if (!response.headers.get('Content-Type')?.includes('application/pdf') || (mode !== 'test' && mode !== 'smtp')) {
        throw new Error();
      }
      const filename = response.headers.get('Content-Disposition')?.match(/filename="([a-z0-9_.-]+)"/i)?.[1] || 'RAT.pdf';
      const pdf = await response.blob();
      setResult({ report, pdf, filename, mode });
      setStorageError(!removeDraft());
      window.scrollTo({ top: 0 });
      requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
    } catch {
      setNotice('A conexão foi interrompida ou o envio não pôde ser confirmado. O rascunho foi mantido. Tente novamente com este mesmo relatório.');
    } finally {
      window.clearTimeout(timer);
      busyRef.current = false;
      setBusy(false);
    }
  }

  function startOver() {
    const next = { step: 0, id: '', locked: false };
    sessionRef.current = next;
    setSession(next);
    reset({ ...emptyDraft });
    setStorageError(!removeDraft());
    setResult(null);
    setConfirmDiscard(false);
    setErrors({});
    setNotice('');
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
  }

  function download() {
    if (!result) return;
    const url = URL.createObjectURL(result.pdf);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  function field(name: Field, options: {
    type?: 'date' | 'time'; choices?: readonly string[]; placeholder?: string; wide?: boolean; decimal?: boolean; multiline?: boolean;
  } = {}) {
    const props = {
      id: 'field-' + name,
      label: labels[name],
      required: required.has(name),
      wide: options.wide ?? options.multiline,
      error: errors[name],
    };
    const control = register(name, { onChange: () => clearFieldError(name) });
    if (options.choices) return <SelectField {...props} control={control} choices={options.choices} />;
    if (options.multiline) {
      return <TextAreaField {...props} hint={values[name].length.toLocaleString('pt-BR') + ' / ' + detailLimit.toLocaleString('pt-BR')}
        control={{ ...control, maxLength: detailLimit, rows: 4, placeholder: options.placeholder }} />;
    }
    if (options.type === 'date') return <DateField {...props} input={control} />;
    if (options.type === 'time') return <TimeField {...props} input={control} />;
    return <TextField {...props} input={{
      ...control,
      placeholder: options.placeholder,
      maxLength: name === 'number' ? 40 : options.decimal ? 11 : shortLimit,
      inputMode: options.decimal ? 'decimal' : undefined,
    }} />;
  }

  function body() {
    switch (step) {
      case 0:
        return <>
          <FormSection title="Identificação do chamado">
            <div className="field-grid call-fields">
              {field('number',)}{field('serviceType', { choices: serviceTypes })}
              {field('ticket', )}{field('date', { type: 'date' })}
              {field('opening', { choices: openingChannels })}
            </div>
          </FormSection>
          <FormSection title="Cliente e equipe">
            <div className="field-grid">{field('client', { placeholder: 'Nome ou razão social' })}{field('branch', { placeholder: 'Unidade ou filial' })}
              {field('requester', { placeholder: 'Nome do solicitante' })}{field('technician', { placeholder: 'Nome do técnico' })}</div>
          </FormSection>
          <FormSection title="Equipamento">
            <div className="field-grid equipment-fields">{field('equipment', )}{field('sector', { placeholder: 'Ex.: Administrativo' })}
              {field('serial', { placeholder: 'Número de série do equipamento' })}{field('asset', )}</div>
          </FormSection>
        </>;
      case 1:
        return <FormSection title="Descrição do atendimento">
          <div className="field-grid">
            {field('problem', { multiline: true, placeholder: 'Descreva o problema informado pelo cliente.' })}
            {field('solution', { multiline: true, wide: false, placeholder: 'Descreva as ações realizadas e o resultado.' })}
            {field('pending', { multiline: true, wide: false, placeholder: 'Informe o que ainda precisa ser resolvido, se houver.' })}
          </div>
        </FormSection>;
      case 2:
        return <>
          <FormSection title="Horários e quilometragem" description="Os totais são calculados a partir dos valores informados.">
            <div className="field-grid closing-fields">
              {field('arrival', { type: 'time' })}{field('start', { type: 'time' })}{field('end', { type: 'time' })}
              <div className="calculated"><span>Total (duração)</span><output aria-label="Total da duração">{calculated.duration}</output></div>
              {field('kmStart', { decimal: true, placeholder: 'Ex.: 10235,5' })}{field('kmEnd', { decimal: true, placeholder: 'Ex.: 10262' })}
              <div className="calculated"><span>KM total</span><output aria-label="Quilometragem total">{calculated.distance}</output></div>
            </div>
          </FormSection>
          <FormSection title="Situação do equipamento">
            <div className="field-grid">
              {field('status', { choices: statuses, wide: true })}
              {field('notes', { multiline: true, placeholder: 'Registre informações adicionais sobre o atendimento.' })}
            </div>
          </FormSection>
        </>;
      case 3:
        return <FormSection title="Coleta de assinaturas">
            <p className="callout">A ZENET coleta os dados e as assinaturas para documentar o atendimento. O rascunho fica neste navegador até a finalização ou o descarte.</p>
            <div className="signature-list">
              {signatureKeys.map(name => <SignatureField key={name} id={'field-' + name} title={labels[name]}
                required={name === 'clientSignature' || Boolean(config?.requireTechnician)}
                value={values[name]} error={errors[name]} onChange={value => {
                  setValue(name, value);
                  clearFieldError(name);
                }} />)}
            </div>
        </FormSection>;
      default:
        return <>
          <FormSection title="Dados do atendimento"><ReviewFields fields={dataKeys} values={values} /></FormSection>
          <FormSection title="Relatório técnico"><div className="review-narrative"><ReviewFields fields={reportKeys} values={values} /></div></FormSection>
          <FormSection title="Fechamento">
            <ReviewFields fields={closingKeys} values={values} />
            <div className="review-totals"><span>Duração <strong>{calculated.duration}</strong></span><span>KM total <strong>{calculated.distance}</strong></span></div>
          </FormSection>
          <FormSection title="Assinaturas">
            <div className="field-grid">{signatureKeys.map(name => <div className="review-signature" key={name}>
              <h3>{labels[name]}</h3>
              {values[name] ? <img src={values[name]} alt={labels[name]} /> : <p className="hint">Não coletada</p>}
            </div>)}</div>
          </FormSection>
        </>;
    }
  }

  function handleForm(event: FormEvent) {
    event.preventDefault();
    if (step === 4) void finalize();
    else nextStep();
  }

  const hasDraft = session.step > 0 || Object.values(values).some(Boolean);
  const visibleNotice = notice === validationNotice && Object.keys(errors).length === 0 ? '' : notice;
  const reportNumber = (result?.report.number ?? values.number).trim();
  const emailEnabled = config?.mailMode === 'smtp';
  const navigation = {
    steps,
    current: step,
    disabled: session.locked || busy || Boolean(result),
    complete: Boolean(result),
    onSelect: moveTo,
  };

  let statusLabel = hasDraft ? 'Rascunho local' : 'Em preenchimento';
  let statusTone: 'neutral' | 'active' | 'warning' | 'success' = hasDraft ? 'active' : 'neutral';
  if (storageError) {
    statusLabel = 'Falha ao salvar rascunho';
    statusTone = 'warning';
  }
  if (session.locked) {
    statusLabel = 'Finalização a confirmar';
    statusTone = 'warning';
  }
  if (busy) {
    statusLabel = 'Processando RAT';
    statusTone = 'active';
  }
  if (result) {
    statusLabel = result.mode === 'smtp' ? 'Enviado' : 'PDF gerado';
    statusTone = 'success';
  }

  return <div className="rat-app">
    <header className="topbar">
      <div className="shell top-inner">
        <img className="brand-mark" src="/zenet.png" width={387} height={136} alt="ZENET" />
        <p className="brand-text">RAT Digital</p>
        <div className="topbar-status" role="status"><StatusIndicator label={statusLabel} tone={statusTone} /></div>
      </div>
    </header>
    <div className="shell app-shell">
      <StepNavigation {...navigation} />
      <main className="workspace">
        <StepNavigation key={step} {...navigation} compact />
        <div className={step === 0 ? 'record-bar record-bar-compact' : 'record-bar'}>
          <p className="record-name">{reportNumber ? 'RAT #' + reportNumber : 'Novo atendimento'}</p>
        </div>
        {result ? <section className="confirmation">
          <CheckCircle2 className="success-icon" size={28} aria-hidden="true" />
          <h1 ref={heading} tabIndex={-1}>{result.mode === 'smtp' ? 'RAT enviado com sucesso' : 'RAT finalizado'}</h1>
          <p className="stage-description">{result.mode === 'smtp'
            ? 'O relatório foi finalizado e encaminhado por e-mail.'
            : 'O relatório está pronto para baixar em PDF.'}</p>
          <div className="result-details"><ReviewFields fields={['number', 'client', 'date']} values={result.report} /></div>
          {storageError && <p className="error-text">Não foi possível remover o rascunho deste navegador.</p>}
          <div className="confirmation-actions">
            <button type="button" className="button secondary" onClick={download}><Download size={16} aria-hidden="true" /> Baixar PDF</button>
            <button type="button" className="button primary" onClick={startOver}>Novo atendimento</button>
          </div>
        </section> : <>
          <form onSubmit={handleForm} noValidate>
            <div className="stage-head">
              <div>
                <h1 ref={heading} tabIndex={-1}>{current.title}</h1>
                <p className={step === 0 ? 'stage-description stage-description-compact' : 'stage-description'}>{current.description}</p>
              </div>
              {step < 3 && <p className="required-note"><span className="required" aria-hidden="true">*</span> Campos obrigatórios</p>}
            </div>
            <div className="stage-content" key={step}>
              {storageError && <p role="alert" className="callout warning">O navegador não conseguiu salvar o rascunho. Mantenha esta página aberta até concluir.</p>}
              {configError && <div role="alert" className="callout warning reconnect">
                <p>O servidor está indisponível. Você pode continuar preenchendo e tentar a conexão antes de finalizar.</p>
                <button type="button" className="subtle-button" onClick={() => { setConfigError(false); setConfigAttempt(value => value + 1); }}>Reconectar</button>
              </div>}
              {session.locked && <p className="callout">Use este mesmo rascunho para tentar finalizar novamente.</p>}
              {body()}
              {visibleNotice && <p role="alert" className="callout warning">{visibleNotice}</p>}
            </div>
            <div className="stage-actions">
              <div className="draft-tools">
                <div className="draft-state" role="status"><StatusIndicator label={statusLabel} tone={statusTone} /></div>
                <p>{storageError ? 'Não foi possível salvar o rascunho neste navegador.' : 'O rascunho é salvo neste navegador.'}</p>
                {hasDraft && <button ref={discardButton} type="button" className="subtle-button" disabled={busy}
                  aria-expanded={confirmDiscard} aria-controls="discard-confirmation" onClick={() => setConfirmDiscard(value => !value)}>
                  Descartar rascunho
                </button>}
              </div>
              <div className="form-actions">
                <button type="button" className="button secondary" disabled={step === 0 || session.locked || busy}
                  onClick={() => moveTo(step - 1)}><ArrowLeft size={16} aria-hidden="true" /> Voltar</button>
                <button type="submit" className="button primary" disabled={busy || (step === 4 && !config)}>
                  {step < 4 ? <>Continuar <ArrowRight size={16} aria-hidden="true" /></> :
                    busy ? <><LoaderCircle className="spin" size={16} aria-hidden="true" /> Processando RAT…</> :
                      session.locked ? 'Tentar novamente' : emailEnabled ? 'Finalizar e enviar RAT' : 'Finalizar RAT'}
                </button>
              </div>
            </div>
          </form>
          <section id="discard-confirmation" className="callout warning" hidden={!confirmDiscard || !hasDraft} aria-labelledby="discard-title">
            <h2 id="discard-title">Descartar rascunho?</h2>
            <p>{session.locked ? 'Há uma tentativa de envio sem confirmação. Confira a caixa de entrada antes de criar outro RAT. O descarte remove os dados e as assinaturas deste navegador.' : 'Os dados e as assinaturas deste relatório serão removidos deste navegador.'}</p>
            <div className="confirmation-actions">
              <button type="button" className="button secondary" disabled={busy} onClick={() => {
                setConfirmDiscard(false);
                discardButton.current?.focus();
              }}>Cancelar</button>
              <button type="button" className="button secondary" disabled={busy} onClick={startOver}>Descartar</button>
            </div>
          </section>
        </>}
      </main>
    </div>
    <footer className="shell footer"><strong>{company.name}</strong><span>{company.phone} · {company.site}</span></footer>
  </div>;
}
