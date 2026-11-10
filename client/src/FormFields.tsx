import type { ComponentPropsWithRef, ReactNode } from 'react';

type FieldProps = {
  id: string;
  label: string;
  required?: boolean;
  wide?: boolean;
  error?: string;
  hint?: string;
};

function FieldFrame({ id, label, required, wide, error, hint, children }: FieldProps & { children: ReactNode }) {
  return (
    <div className={wide ? 'field wide' : 'field'}>
      <label htmlFor={id}>{label}{required && <span className="required" aria-hidden="true"> *</span>}</label>
      {children}
      {error ? <p className="error-text" id={id + '-help'}>{error}</p>
        : hint && <p className="field-count" id={id + '-help'}>{hint}</p>}
    </div>
  );
}

function fieldAttributes({ id, required, error, hint }: FieldProps) {
  return {
    id,
    'aria-required': required || undefined,
    'aria-invalid': Boolean(error),
    'aria-describedby': error || hint ? id + '-help' : undefined,
  };
}

type InputProps = FieldProps & { input: ComponentPropsWithRef<'input'> };

function InputField({ input, type, ...field }: InputProps & { type: 'text' | 'date' | 'time' }) {
  return <FieldFrame {...field}><input {...input} {...fieldAttributes(field)} type={type} /></FieldFrame>;
}

export function TextField(props: InputProps) {
  return <InputField {...props} type="text" />;
}

export function DateField(props: InputProps) {
  return <InputField {...props} type="date" />;
}

export function TimeField(props: InputProps) {
  return <InputField {...props} type="time" />;
}

export function SelectField({ control, choices, ...field }: FieldProps & {
  control: ComponentPropsWithRef<'select'>;
  choices: readonly string[];
}) {
  return (
    <FieldFrame {...field}>
      <select {...control} {...fieldAttributes(field)}>
        <option value="">Selecione</option>
        {choices.map(choice => <option key={choice}>{choice}</option>)}
      </select>
    </FieldFrame>
  );
}

export function TextAreaField({ control, ...field }: FieldProps & { control: ComponentPropsWithRef<'textarea'> }) {
  return <FieldFrame {...field}><textarea {...control} {...fieldAttributes(field)} /></FieldFrame>;
}
