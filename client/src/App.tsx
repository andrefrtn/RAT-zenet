import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useForm } from 'react-hook-form';
import { ArrowLeft, ArrowRight, CheckCircle2, Download, LoaderCircle } from 'lucide-react';
import {
  closingIssues, closingKeys, company, dataKeys, detailLimit, displayDate, labels,
  openingChannels, ratFields, reportKeys, serviceTypes, shortLimit, statuses, totals, photoCategories,
  type Draft, type Field, type Technician, type PhotoLimits, type Issuance, type PhotoCategory,
} from '../../shared/rat';
import { DateField, SelectField, TextAreaField, TextField, TimeField } from './FormFields';
import { SignatureField } from './SignaturePad';
import { FormSection, StatusIndicator, StepNavigation } from './Workspace';
import { createId, blankDraft, removeDraft, writeDraft, type Session, type Snapshot } from './storage';
import { Access } from './Access';
import { Photos } from './Photos';
import { apiFetch, downloadPdf } from './api';

const steps = [
  { short: 'Atendimento', title: 'Dados do atendimento', description: 'Identifique o chamado, o cliente e o equipamento atendido.', fields: dataKeys },
  { short: 'Relatório técnico', title: 'Relatório técnico', description: 'Documente o problema, a solução e as pendências.', fields: reportKeys },
  { short: 'Fechamento', title: 'Fechamento', description: 'Registre os horários, o deslocamento e a situação final do equipamento.', fields: closingKeys },
  { short: 'Assinaturas', title: 'Assinaturas', description: 'Colete a assinatura do cliente e de cada técnico participante.', fields: ['clientSignature'] as Field[] },
  { short: 'Revisão', title: 'Revisão', description: 'Confira os dados e as assinaturas antes de finalizar.', fields: [] },
];
const required = new Set<Field>(['serviceType', 'opening', 'date', 'client', 'equipment', 'problem', 'arrival', 'start', 'end', 'status']);
const validationNotice = 'Confira os campos destacados.';
type Errors = Record<string, string | undefined>;
type Config = { technicians: Technician[]; photoLimits: PhotoLimits; numberPreview: string | null };
type ApiError = { message?: string; editable?: boolean; errors?: Partial<Record<Field, string[]>> };

function ReviewFields({ fields, values }: { fields: readonly Field[]; values: Draft }) {
  return <dl className="review-grid">
    {fields.map(field => <div className={['problem', 'solution', 'pending', 'notes'].includes(field) ? 'wide' : undefined} key={field}><dt>{labels[field]}</dt>
      <dd>{field === 'date' ? displayDate(values[field]) : values[field] || '—'}</dd></div>)}
  </dl>;
}

export default function App() {
  return <Access>{initial => <RatForm initial={initial} />}</Access>;
}

function RatForm({ initial }: { initial: Snapshot }) {
  const legacyRef = useRef(initial.legacy);
  const legacy = legacyRef.current;
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
  const [result, setResult] = useState<Issuance | null>(initial.session.emitted ?? null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const discarding = useRef(false);
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
    apiFetch('/api/config', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error();
      const next = await response.json() as Config;
      if (!Array.isArray(next.technicians) || !next.photoLimits) throw new Error();
      setConfig(next);
      setConfigError(false);
    }).catch(() => {
      if (!controller.signal.aborted) setConfigError(true);
    });
    return () => controller.abort();
  }, [configAttempt]);

  useEffect(() => {
    if (result || session.locked) return;
    const refresh = () => { if (!document.hidden) setConfigAttempt(value => value + 1); };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [result, session.locked]);

  useEffect(() => {
    const subscription = watch(() => {
      if (!discarding.current) void writeDraft(getValues(), sessionRef.current, legacyRef.current).then(saved => setStorageError(!saved));
    });
    return () => subscription.unsubscribe();
  }, [watch, getValues]);

  async function persist(next: Session) {
    sessionRef.current = next;
    setSession(next);
    const saved = await writeDraft(getValues(), next, legacyRef.current);
    setStorageError(!saved);
    return saved;
  }

  function moveTo(next: number) {
    persist({ ...sessionRef.current, step: next });
    setConfirmDiscard(false);
    setNotice('');
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
  }

  function clearFieldError(field: string) {
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
    if (index === 0) {
      if (!draft.technicians.length) found.technicians = 'Selecione ao menos um técnico.';
      else if (draft.technicians.length > 16) found.technicians = 'Selecione até 16 técnicos por atendimento.';
      else if (draft.technicians.some(id => !config?.technicians.some(tech => tech.id === id))) found.technicians = 'Remova os técnicos indisponíveis e selecione profissionais ativos.';
    }
    if (index === 3) {
      if (!draft.clientSignature) found.clientSignature = 'Colete a assinatura do cliente.';
      for (const id of draft.technicians) if (!draft.technicianSignatures[id]) found['tech-' + id] = 'Colete a assinatura deste técnico.';
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
    if (busyRef.current || photoBusy || !config) return;
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
    if (!await persist({ id, step: 4, locked: true })) {
      setNotice('Não foi possível salvar esta operação no aparelho. Libere espaço antes de finalizar para preservar a emissão.');
      busyRef.current = false; setBusy(false); return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 65_000);
    try {
      const response = await apiFetch('/api/rat', {
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
            const invalidStep = found.technicians ? 0 : found.technicianSignatures ? 3 : found.photos ? 1
              : steps.findIndex(entry => entry.fields.some(field => found[field]));
            if (invalidStep >= 0) {
              moveTo(invalidStep);
              focusError(found);
            }
          }
        }
        setNotice(error.message || 'O servidor não confirmou a emissão. Tente novamente com este rascunho.');
        return;
      }
      const emitted = await response.json() as Issuance;
      if (!/^\d{4}-\d{2}-\d{2}-\d{4}$/.test(emitted.number) || emitted.operationId !== id) throw new Error();
      setResult(emitted);
      await persist({ id, step: 4, locked: true, emitted });
      window.scrollTo({ top: 0 });
      requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
    } catch {
      setNotice('A conexão foi interrompida. O RAT pode já ter sido emitido. Tente novamente com este mesmo rascunho para recuperar o número.');
    } finally {
      window.clearTimeout(timer);
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function startOver() {
    setBusy(true);
    busyRef.current = true;
    discarding.current = true;
    legacyRef.current = undefined;
    const next = { step: 0, id: '', locked: false };
    sessionRef.current = next;
    setSession(next);
    reset(blankDraft());
    setStorageError(!await removeDraft());
    discarding.current = false;
    setResult(null);
    setConfigAttempt(value => value + 1);
    setConfirmDiscard(false);
    setErrors({});
    setNotice('');
    setBusy(false);
    busyRef.current = false;
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
  }

  async function download() {
    if (!result) return;
    setBusy(true); setPdfError('');
    try { await downloadPdf(result.operationId, result.filename, getValues()); }
    catch (error) { setPdfError(error instanceof Error ? error.message : 'O RAT já está emitido. Tente gerar o PDF novamente.'); }
    finally { setBusy(false); }
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
      return <div className={props.wide ? 'photo-field wide' : 'photo-field'}>
        <TextAreaField {...props} hint={values[name].length.toLocaleString('pt-BR') + ' / ' + detailLimit.toLocaleString('pt-BR')}
          control={{ ...control, maxLength: detailLimit, rows: 4, placeholder: options.placeholder }} />
        {config && photoCategories.includes(name as PhotoCategory) && <Photos category={name as PhotoCategory} photos={values.photos} limits={config.photoLimits}
          disabled={photoBusy} onBusy={setPhotoBusy} onChange={photos => setValue('photos', photos)} />}
      </div>;
    }
    if (options.type === 'date') return <DateField {...props} input={control} />;
    if (options.type === 'time') return <TimeField {...props} input={control} />;
    return <TextField {...props} input={{
      ...control,
      placeholder: options.placeholder,
      maxLength: options.decimal ? 11 : shortLimit,
      inputMode: options.decimal ? 'decimal' : undefined,
    }} />;
  }

  const previewNumber = configError ? 'Prévia indisponível' : !config ? 'Consultando número…' : config.numberPreview ?? 'Limite diário atingido';

  function body() {
    switch (step) {
      case 0:
        return <>
          <FormSection title="Identificação do chamado">
            <div className="field-grid call-fields">
              <div className="calculated"><span id="rat-number-label">Nº RAT · Prévia</span><output aria-labelledby="rat-number-label" aria-describedby="rat-number-hint">{previewNumber}</output><p className="hint" id="rat-number-hint">Confirmado ao finalizar. Pode mudar se outro RAT for emitido antes.</p></div>{field('serviceType', { choices: serviceTypes })}
              {field('ticket', )}{field('date', { type: 'date' })}
              {field('opening', { choices: openingChannels })}
            </div>
          </FormSection>
          <FormSection title="Cliente e equipe">
            <div className="field-grid">{field('client', { placeholder: 'Nome ou razão social' })}{field('branch', { placeholder: 'Unidade ou filial' })}
              {field('requester', { placeholder: 'Nome do solicitante' })}</div>
            <fieldset className="technician-picker" id="field-technicians" tabIndex={-1}>
              <legend>Técnicos participantes <span className="required">*</span></legend>
              {config?.technicians.length === 0 && <p className="callout">Nenhum técnico cadastrado. Peça ao responsável para cadastrar os profissionais antes de finalizar.</p>}
              {[...(config?.technicians || []), ...values.technicians.filter(id => !config?.technicians.some(tech => tech.id === id)).map(id => ({ id, name: 'Técnico indisponível — ' + id, active: false }))].map(tech =>
                <label className="technician-option" key={tech.id}>
                  <input type="checkbox" checked={values.technicians.includes(tech.id)} onChange={event => {
                    if (!event.target.checked && values.technicianSignatures[tech.id] && !window.confirm('Remover ' + tech.name + ' e a assinatura associada?')) return;
                    const signatures = { ...getValues().technicianSignatures };
                    if (!event.target.checked) delete signatures[tech.id];
                    setValue('technicianSignatures', signatures);
                    setValue('technicians', event.target.checked ? [...values.technicians, tech.id] : values.technicians.filter(id => id !== tech.id));
                    clearFieldError('technicians');
                  }} />
                  <span>{tech.name}</span>
                </label>)}
              {errors.technicians && <p className="error-text" role="alert">{errors.technicians}</p>}
            </fieldset>
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
              <SignatureField id="field-clientSignature" title="Assinatura do cliente" required value={values.clientSignature}
                error={errors.clientSignature} onChange={value => { setValue('clientSignature', value); clearFieldError('clientSignature'); }} />
              {values.technicians.map(id => <SignatureField key={id} id={'field-tech-' + id}
                title={config?.technicians.find(tech => tech.id === id)?.name || 'Técnico indisponível'} required
                value={values.technicianSignatures[id] || ''} error={errors['tech-' + id]}
                onChange={value => { setValue('technicianSignatures', { ...getValues().technicianSignatures, [id]: value }); clearFieldError('tech-' + id); clearFieldError('technicianSignatures'); }} />)}
            </div>
            {errors.technicianSignatures && <p className="error-text">{errors.technicianSignatures}</p>}
        </FormSection>;
      default:
        return <>
          <FormSection title="Dados do atendimento"><ReviewFields fields={dataKeys} values={values} /></FormSection>
          <FormSection title="Técnicos participantes"><ul>{values.technicians.map(id => <li key={id}>{config?.technicians.find(tech => tech.id === id)?.name || 'Técnico indisponível'}</li>)}</ul></FormSection>
          <FormSection title="Relatório técnico"><div className="review-narrative"><ReviewFields fields={reportKeys} values={values} /></div></FormSection>
          <FormSection title="Fechamento">
            <ReviewFields fields={closingKeys} values={values} />
            <div className="review-totals"><span>Duração <strong>{calculated.duration}</strong></span><span>KM total <strong>{calculated.distance}</strong></span></div>
          </FormSection>
          <FormSection title="Assinaturas">
            <div className="field-grid">{[{ id: 'client', name: 'Assinatura do cliente', data: values.clientSignature }, ...values.technicians.map(id => ({ id,
              name: config?.technicians.find(tech => tech.id === id)?.name || 'Técnico indisponível', data: values.technicianSignatures[id] }))].map(item => <div className="review-signature" key={item.id}>
              <h3>{item.name}</h3>
              {item.data ? <img src={item.data} alt={'Assinatura — ' + item.name} /> : <p className="hint">Não coletada</p>}
            </div>)}</div>
          </FormSection>
          {!!values.photos.length && <FormSection title="Registro fotográfico"><div className="photo-gallery">{values.photos.map((photo, index) => <figure key={photo.id}>
            <img src={photo.data} alt={photo.caption || 'Foto ' + (index + 1)} /><figcaption><strong>Foto {index + 1} — {labels[photo.category]}</strong><p>{photo.caption}</p></figcaption>
          </figure>)}</div></FormSection>}
        </>;
    }
  }

  function handleForm(event: FormEvent) {
    event.preventDefault();
    if (step === 4) void finalize();
    else nextStep();
  }

  const hasDraft = session.step > 0 || dataKeys.some(key => Boolean(values[key])) || values.technicians.length > 0 || values.photos.length > 0;
  const visibleNotice = notice === validationNotice && Object.keys(errors).length === 0 ? '' : notice;
  const reportNumber = result?.number;
  const navigation = {
    steps,
    current: step,
    disabled: session.locked || busy || photoBusy || Boolean(result),
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
    statusLabel = 'RAT emitido';
    statusTone = 'success';
  }

  return <div className="rat-app">
    <header className="topbar">
      <div className="shell top-inner">
        <div className="brand-identity">
        <img className="brand-mark" src="/zenet.png" width={387} height={136} alt="ZENET" />
        <p className="brand-text">RAT Digital</p>
        </div>
        <div className="topbar-status" role="status"><StatusIndicator label={statusLabel} tone={statusTone} /></div>
      </div>
    </header>
    <div className="shell app-shell">
      <StepNavigation {...navigation} />
      <main className="workspace">
        <StepNavigation key={step} {...navigation} compact />
        <div className={step === 0 ? 'record-bar record-bar-compact' : 'record-bar'}>
          <p className="record-name">{reportNumber || (session.locked ? 'Emissão a confirmar' : config?.numberPreview && !configError ? config.numberPreview + ' · Prévia' : 'RAT ainda não emitido')}</p>
        </div>
        {result ? <section className="confirmation">
          <CheckCircle2 className="success-icon" size={28} aria-hidden="true" />
          <h1 ref={heading} tabIndex={-1}>RAT finalizado com sucesso</h1>
          <p className="official-number">{result.number}</p>
          <p className="stage-description">O número oficial foi registrado. Baixe e guarde o PDF: os dados deste RAT ficam apenas neste aparelho.</p>
          <div className="result-details"><strong>{result.client}</strong><p>{new Date(result.issuedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p></div>
          {pdfError && <p className="error-text" role="alert">{pdfError}</p>}
          {storageError && <p className="error-text">Não foi possível salvar o rascunho neste navegador. Mantenha esta página aberta e baixe o PDF.</p>}
          <div className="confirmation-actions">
            <button type="button" className="button secondary" disabled={busy} onClick={() => void download()}><Download size={16} aria-hidden="true" />{busy ? 'Gerando PDF…' : 'Baixar PDF'}</button>
            <button type="button" className="button primary" disabled={busy} onClick={() => setConfirmDiscard(true)}>Novo atendimento</button>
          </div>
          {confirmDiscard && <div className="callout warning" role="alert">
            <p>Já salvou o PDF? Ao iniciar outro atendimento, os dados, fotos e assinaturas deste RAT serão removidos deste aparelho. O servidor não guarda uma cópia.</p>
            <div className="confirmation-actions">
              <button type="button" className="button secondary" disabled={busy} onClick={() => setConfirmDiscard(false)}>Voltar</button>
              <button type="button" className="button primary" disabled={busy} onClick={() => void startOver()}>Iniciar novo atendimento</button>
            </div>
          </div>}
        </section> : <>
          <form onSubmit={handleForm} noValidate>
            <div className="stage-head">
              <div>
                <h1 ref={heading} tabIndex={-1}>{current.title}</h1>
                <p className={step === 0 ? 'stage-description stage-description-compact' : 'stage-description'}>{current.description}</p>
              </div>
              {step < 3 && <p className="required-note"><span className="required" aria-hidden="true">*</span> Campos obrigatórios</p>}
            </div>
            <fieldset className="stage-content form-body" key={step} disabled={session.locked || busy}>
              {legacy && <details className="callout"><summary>Rascunho da versão anterior</summary><p>Referência anterior {legacy.number || 'sem número'}. Selecione os técnicos cadastrados e colete as assinaturas novamente para a emissão oficial.</p>
                {legacy.technician && <p>Técnico informado anteriormente — {legacy.technician}</p>}
                {legacy.signature && <img className="legacy-signature" src={legacy.signature} alt="Assinatura preservada do rascunho anterior, sem associação automática" />}</details>}
              {storageError && <p role="alert" className="callout warning">O navegador não conseguiu salvar o rascunho. Mantenha esta página aberta até concluir.</p>}
              {configError && <div role="alert" className="callout warning reconnect">
                <p>O servidor está indisponível. Você pode continuar preenchendo e tentar a conexão antes de finalizar.</p>
                <button type="button" className="subtle-button" onClick={() => { setConfigError(false); setConfigAttempt(value => value + 1); }}>Reconectar</button>
              </div>}
              {session.locked && <p className="callout">Use este mesmo rascunho para tentar finalizar novamente.</p>}
              {body()}
              {visibleNotice && <p role="alert" className="callout warning">{visibleNotice}</p>}
            </fieldset>
            <div className="stage-actions">
              <div className="draft-tools">
                <div className="draft-state" role="status"><StatusIndicator label={statusLabel} tone={statusTone} /></div>
                <p>{storageError ? 'Não foi possível salvar o rascunho neste navegador.' : 'O rascunho é salvo neste navegador.'}</p>
                {hasDraft && <button ref={discardButton} type="button" className="subtle-button" disabled={busy || photoBusy}
                  aria-expanded={confirmDiscard} aria-controls="discard-confirmation" onClick={() => setConfirmDiscard(value => !value)}>
                  Descartar rascunho
                </button>}
              </div>
              <div className="form-actions">
                <button type="button" className="button secondary" disabled={step === 0 || session.locked || busy || photoBusy}
                  onClick={() => moveTo(step - 1)}><ArrowLeft size={16} aria-hidden="true" /> Voltar</button>
                <button type="submit" className="button primary" disabled={busy || photoBusy || (step === 4 && !config)}>
                  {step < 4 ? <>Continuar <ArrowRight size={16} aria-hidden="true" /></> :
                    busy ? <><LoaderCircle className="spin" size={16} aria-hidden="true" /> Processando RAT…</> :
                      session.locked ? 'Recuperar emissão' : 'Finalizar RAT'}
                </button>
              </div>
            </div>
          </form>
          <section id="discard-confirmation" className="callout warning" hidden={!confirmDiscard || !hasDraft} aria-labelledby="discard-title">
            <h2 id="discard-title">Descartar rascunho?</h2>
            <p>{session.locked ? 'Há uma emissão sem confirmação. Recupere a emissão antes de criar outro atendimento. O descarte remove os dados deste aparelho.' : 'Os dados, as fotografias e as assinaturas deste relatório serão removidos deste aparelho.'}</p>
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
