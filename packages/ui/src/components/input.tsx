import { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { registerBuiltinComponent, type SchemaComponentProps } from '../engine/registry';
import { usePageContext } from '../engine/context';
import { dispatchAction } from '../engine/action';
import {
  CzSwitch,
  CzCheckbox,
  CzRadioGroup,
  CzRadioGroupItem,
  CzSelect,
  CzSelectTrigger,
  CzSelectContent,
  CzSelectItem,
  CzSelectValue,
  CzPopover,
  CzPopoverTrigger,
  CzPopoverContent,
  CzCalendar,
} from '../primitives';
import type {
  FormComponent,
  FieldSchema,
  InputComponent,
  TextareaComponent,
  NumberComponent,
  SelectComponent,
  SwitchComponent,
  CheckboxComponent,
  RadioComponent,
  DatePickerComponent,
  OptionItem,
} from '../schema/types';

// ============================================================
// Shared helpers
// ============================================================

function useActionContext() {
  const ctx = usePageContext();
  return {
    baseUrl: ctx.baseUrl,
    triggerReload: ctx.triggerReload,
    openDialog: ctx.openDialog,
    closeDialog: ctx.closeDialog,
    requestConfirm: ctx.requestConfirm,
  };
}

function useRegisterValue(id: string | undefined, value: unknown) {
  const ctx = usePageContext();
  useEffect(() => {
    if (!id) return;
    ctx.registerComponent(id, { value });
    return () => ctx.unregisterComponent(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!id) return;
    ctx.updateComponent(id, { value });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
}

const labelClass = 'block mb-1 text-sm font-medium text-text-secondary';
const baseInputClass = 'block w-full px-2.5 py-1.5 text-sm border border-border-strong rounded-sm outline-none box-border';
const errorClass = 'text-danger text-xs mt-0.5';

// ============================================================
// form
// ============================================================

function FormRenderer({ schema, exprContext }: SchemaComponentProps) {
  const s = schema as FormComponent;
  const ctx = usePageContext();
  const actionCtx = useActionContext();

  // Initialize values from initialValues or field defaults
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = { ...(s.initialValues ?? {}) };
    for (const field of s.fields) {
      if (init[field.name] === undefined && field.defaultValue !== undefined) {
        init[field.name] = field.defaultValue;
      }
    }
    return init;
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Register form values to PageContext if has id
  useRegisterValue(s.id, values);

  const setValue = useCallback((name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => {
      if (prev[name]) {
        const next = { ...prev };
        delete next[name];
        return next;
      }
      return prev;
    });
  }, []);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    for (const field of s.fields) {
      if (field.required) {
        const v = values[field.name];
        if (v === undefined || v === null || v === '') {
          newErrors[field.name] = `${field.label ?? field.name} is required`;
        }
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    if (!s.api) return;

    setSubmitting(true);
    try {
      const url = s.api.url.startsWith('http')
        ? s.api.url
        : ctx.baseUrl + s.api.url;

      const response = await fetch(url, {
        method: s.api.method ?? 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        const data = await response.json().catch(() => null);
        if (s.onSuccess) {
          await dispatchAction(s.onSuccess, {
            ...actionCtx,
            expressionContext: {
              ...exprContext,
              response: data,
              form: values,
            },
          });
        }
      } else {
        const errorData = await response.json().catch(() => null);
        if (s.onError) {
          await dispatchAction(s.onError, {
            ...actionCtx,
            expressionContext: {
              ...exprContext,
              response: errorData,
              form: values,
            },
          });
        }
      }
    } catch {
      if (s.onError) {
        await dispatchAction(s.onError, {
          ...actionCtx,
          expressionContext: {
            ...exprContext,
            form: values,
          },
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isInline = s.layout === 'inline';
  const isHorizontal = s.layout === 'horizontal';

  return (
    <form
      onSubmit={handleSubmit}
      className={clsx(
        'flex',
        isInline
          ? 'flex-row gap-4 flex-wrap items-end'
          : 'flex-col gap-3',
        s.className,
      )}
      style={s.style}
    >
      {s.fields.map((field) => (
        <FormField
          key={field.name}
          field={field}
          value={values[field.name]}
          onChange={(v) => setValue(field.name, v)}
          error={errors[field.name]}
          horizontal={isHorizontal}
        />
      ))}
      <div className={clsx(!isInline && 'mt-2')}>
        <button
          type="submit"
          disabled={submitting}
          className={clsx(
            'px-5 py-2 text-sm font-medium text-white border-0 rounded-sm',
            submitting
              ? 'bg-primary-light cursor-not-allowed'
              : 'bg-primary cursor-pointer',
          )}
        >
          {submitting ? 'Submitting...' : 'Submit'}
        </button>
      </div>
    </form>
  );
}

// ---- Form field renderer (inline HTML inputs) ----

function FormField({
  field,
  value,
  onChange,
  error,
  horizontal,
}: {
  field: FieldSchema;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
  horizontal?: boolean;
}) {
  const label = field.label ?? field.name;

  return (
    <div className={clsx(horizontal && 'flex items-center gap-2')}>
      {label && (
        <label className={clsx(
          labelClass,
          horizontal && 'mb-0 min-w-[80px]',
        )}>
          {label}
          {field.required && <span className="text-danger ml-0.5">*</span>}
        </label>
      )}
      <div className={clsx(horizontal && 'flex-1')}>
        {renderFieldInput(field, value, onChange)}
        {error && <div className={errorClass}>{error}</div>}
      </div>
    </div>
  );
}

function renderFieldInput(
  field: FieldSchema,
  value: unknown,
  onChange: (v: unknown) => void,
): React.ReactNode {
  const placeholder = field.placeholder ?? '';

  switch (field.type) {
    case 'input':
      return (
        <input
          type="text"
          value={String(value ?? '')}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={baseInputClass}
        />
      );

    case 'textarea':
      return (
        <textarea
          value={String(value ?? '')}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className={clsx(baseInputClass, 'resize-y')}
        />
      );

    case 'number':
      return (
        <input
          type="number"
          value={value !== undefined && value !== null ? String(value) : ''}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          className={baseInputClass}
        />
      );

    case 'select':
      return (
        <CzSelect
          value={String(value ?? '') || undefined}
          onValueChange={(v) => onChange(v)}
        >
          <CzSelectTrigger>
            <CzSelectValue placeholder={placeholder || '-- Select --'} />
          </CzSelectTrigger>
          <CzSelectContent>
            {(field.options ?? []).map((opt: OptionItem) => (
              <CzSelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </CzSelectItem>
            ))}
          </CzSelectContent>
        </CzSelect>
      );

    case 'switch':
      return (
        <CzSwitch
          checked={!!value}
          onCheckedChange={(checked) => onChange(checked)}
        />
      );

    case 'checkbox': {
      if (field.options && field.options.length > 0) {
        const checked = Array.isArray(value) ? (value as string[]) : [];
        return (
          <div className="flex flex-col gap-1">
            {field.options.map((opt: OptionItem) => (
              <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer text-sm">
                <CzCheckbox
                  checked={checked.includes(opt.value)}
                  onCheckedChange={(c) => {
                    if (c) {
                      onChange([...checked, opt.value]);
                    } else {
                      onChange(checked.filter((v) => v !== opt.value));
                    }
                  }}
                />
                {opt.label}
              </label>
            ))}
          </div>
        );
      }
      return (
        <label className="flex items-center gap-1.5 cursor-pointer text-sm">
          <CzCheckbox
            checked={!!value}
            onCheckedChange={(c) => onChange(!!c)}
          />
        </label>
      );
    }

    case 'radio':
      return (
        <CzRadioGroup
          value={String(value ?? '')}
          onValueChange={(v) => onChange(v)}
        >
          {(field.options ?? []).map((opt: OptionItem) => (
            <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer text-sm">
              <CzRadioGroupItem value={opt.value} />
              {opt.label}
            </label>
          ))}
        </CzRadioGroup>
      );

    case 'date-picker':
      return (
        <DatePickerField
          value={String(value ?? '')}
          onChange={(v) => onChange(v)}
        />
      );

    default:
      return (
        <input
          type="text"
          value={String(value ?? '')}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={baseInputClass}
        />
      );
  }
}

// ============================================================
// input (standalone)
// ============================================================

function InputRenderer({ schema, exprContext }: SchemaComponentProps) {
  const s = schema as InputComponent;
  const actionCtx = useActionContext();
  const [value, setValue] = useState(s.value ?? '');

  useRegisterValue(s.id, value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setValue(newVal);
    if (s.onChange) {
      dispatchAction(s.onChange, {
        ...actionCtx,
        expressionContext: {
          ...exprContext,
          form: { value: newVal },
        },
      });
    }
  };

  return (
    <input
      type="text"
      value={value}
      placeholder={s.placeholder ?? ''}
      onChange={handleChange}
      className={clsx(baseInputClass, s.className)}
      style={s.style}
    />
  );
}

// ============================================================
// textarea (standalone)
// ============================================================

function TextareaRenderer({ schema, exprContext }: SchemaComponentProps) {
  const s = schema as TextareaComponent;
  const actionCtx = useActionContext();
  const [value, setValue] = useState(s.value ?? '');

  useRegisterValue(s.id, value);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    setValue(newVal);
    if (s.onChange) {
      dispatchAction(s.onChange, {
        ...actionCtx,
        expressionContext: {
          ...exprContext,
          form: { value: newVal },
        },
      });
    }
  };

  return (
    <textarea
      value={value}
      placeholder={s.placeholder ?? ''}
      rows={s.rows ?? 3}
      onChange={handleChange}
      className={clsx(baseInputClass, 'resize-y', s.className)}
      style={s.style}
    />
  );
}

// ============================================================
// number (standalone)
// ============================================================

function NumberRenderer({ schema, exprContext }: SchemaComponentProps) {
  const s = schema as NumberComponent;
  const actionCtx = useActionContext();
  const [value, setValue] = useState<number | undefined>(s.value);

  useRegisterValue(s.id, value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const newVal = raw === '' ? undefined : Number(raw);
    setValue(newVal);
    if (s.onChange) {
      dispatchAction(s.onChange, {
        ...actionCtx,
        expressionContext: {
          ...exprContext,
          form: { value: newVal },
        },
      });
    }
  };

  return (
    <input
      type="number"
      value={value !== undefined ? String(value) : ''}
      min={s.min}
      max={s.max}
      step={s.step}
      onChange={handleChange}
      className={clsx(baseInputClass, s.className)}
      style={s.style}
    />
  );
}

// ============================================================
// select (standalone)
// ============================================================

function SelectRenderer({ schema, exprContext }: SchemaComponentProps) {
  const s = schema as SelectComponent;
  const actionCtx = useActionContext();
  const [value, setValue] = useState<string | string[]>(s.value ?? (s.multiple ? [] : ''));

  useRegisterValue(s.id, value);

  const dispatchSelectChange = (newVal: string | string[]) => {
    if (s.onChange) {
      dispatchAction(s.onChange, {
        ...actionCtx,
        expressionContext: {
          ...exprContext,
          form: { value: newVal },
        },
      });
    }
  };

  // Multi-select: keep native <select multiple>
  if (s.multiple) {
    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const opts = e.target.options;
      const selected: string[] = [];
      for (let i = 0; i < opts.length; i++) {
        if (opts[i].selected) selected.push(opts[i].value);
      }
      setValue(selected);
      dispatchSelectChange(selected);
    };

    return (
      <select
        value={value as string[]}
        multiple
        onChange={handleChange}
        className={clsx(baseInputClass, 'bg-bg', s.className)}
        style={s.style}
      >
        {s.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  // Single-select: use CzSelect
  const handleValueChange = (newVal: string) => {
    setValue(newVal);
    dispatchSelectChange(newVal);
  };

  return (
    <CzSelect value={(value as string) || undefined} onValueChange={handleValueChange}>
      <CzSelectTrigger className={s.className} style={s.style}>
        <CzSelectValue placeholder={s.placeholder || '-- Select --'} />
      </CzSelectTrigger>
      <CzSelectContent>
        {s.options.map((opt) => (
          <CzSelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </CzSelectItem>
        ))}
      </CzSelectContent>
    </CzSelect>
  );
}

// ============================================================
// switch (standalone)
// ============================================================

function SwitchRenderer({ schema, exprContext }: SchemaComponentProps) {
  const s = schema as SwitchComponent;
  const actionCtx = useActionContext();
  const [value, setValue] = useState(!!s.value);

  useRegisterValue(s.id, value);

  const handleCheckedChange = (checked: boolean) => {
    setValue(checked);
    if (s.onChange) {
      dispatchAction(s.onChange, {
        ...actionCtx,
        expressionContext: {
          ...exprContext,
          form: { value: checked },
        },
      });
    }
  };

  return (
    <CzSwitch
      checked={value}
      onCheckedChange={handleCheckedChange}
      className={s.className}
      style={s.style}
    />
  );
}

// ============================================================
// checkbox (standalone)
// ============================================================

function CheckboxRenderer({ schema, exprContext }: SchemaComponentProps) {
  const s = schema as CheckboxComponent;
  const actionCtx = useActionContext();

  // If options provided, it's a checkbox group
  const isGroup = s.options && s.options.length > 0;
  const [value, setValue] = useState<boolean | string[]>(
    isGroup
      ? (Array.isArray(s.value) ? s.value : [])
      : (!!s.value),
  );

  useRegisterValue(s.id, value);

  const dispatchChange = (newVal: boolean | string[]) => {
    if (s.onChange) {
      dispatchAction(s.onChange, {
        ...actionCtx,
        expressionContext: {
          ...exprContext,
          form: { value: newVal },
        },
      });
    }
  };

  if (isGroup) {
    const checked = value as string[];
    return (
      <div className={clsx('flex flex-col gap-1', s.className)} style={s.style}>
        {s.options!.map((opt) => (
          <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer text-sm">
            <CzCheckbox
              checked={checked.includes(opt.value)}
              onCheckedChange={(c) => {
                const newVal = c
                  ? [...checked, opt.value]
                  : checked.filter((v) => v !== opt.value);
                setValue(newVal);
                dispatchChange(newVal);
              }}
            />
            {opt.label}
          </label>
        ))}
      </div>
    );
  }

  return (
    <label className={clsx('flex items-center gap-1.5 cursor-pointer text-sm', s.className)} style={s.style}>
      <CzCheckbox
        checked={value as boolean}
        onCheckedChange={(c) => {
          const newVal = !!c;
          setValue(newVal);
          dispatchChange(newVal);
        }}
      />
      {s.label && <span>{s.label}</span>}
    </label>
  );
}

// ============================================================
// radio (standalone)
// ============================================================

function RadioRenderer({ schema, exprContext }: SchemaComponentProps) {
  const s = schema as RadioComponent;
  const actionCtx = useActionContext();
  const [value, setValue] = useState(s.value ?? '');

  useRegisterValue(s.id, value);

  const handleChange = (optValue: string) => {
    setValue(optValue);
    if (s.onChange) {
      dispatchAction(s.onChange, {
        ...actionCtx,
        expressionContext: {
          ...exprContext,
          form: { value: optValue },
        },
      });
    }
  };

  return (
    <CzRadioGroup
      value={value}
      onValueChange={handleChange}
      className={s.className}
      style={s.style}
    >
      {s.options.map((opt) => (
        <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer text-sm">
          <CzRadioGroupItem value={opt.value} />
          {opt.label}
        </label>
      ))}
    </CzRadioGroup>
  );
}

// ============================================================
// date-picker (standalone)
// ============================================================

function DatePickerField({
  value,
  onChange,
  className,
  style,
}: {
  value: string;
  onChange: (date: string) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);

  return (
    <CzPopover open={open} onOpenChange={setOpen}>
      <CzPopoverTrigger asChild>
        <button
          type="button"
          className={clsx(
            baseInputClass,
            'text-left bg-bg',
            !value && 'text-text-placeholder',
            className,
          )}
          style={style}
        >
          {value || 'Select date...'}
        </button>
      </CzPopoverTrigger>
      <CzPopoverContent modal>
        <CzCalendar
          value={value}
          onSelect={(date) => {
            onChange(date);
            setOpen(false);
          }}
        />
      </CzPopoverContent>
    </CzPopover>
  );
}

function DatePickerRenderer({ schema, exprContext }: SchemaComponentProps) {
  const s = schema as DatePickerComponent;
  const actionCtx = useActionContext();
  const [value, setValue] = useState(s.value ?? '');

  useRegisterValue(s.id, value);

  const handleSelect = (newVal: string) => {
    setValue(newVal);
    if (s.onChange) {
      dispatchAction(s.onChange, {
        ...actionCtx,
        expressionContext: {
          ...exprContext,
          form: { value: newVal },
        },
      });
    }
  };

  return (
    <DatePickerField
      value={value}
      onChange={handleSelect}
      className={s.className}
      style={s.style}
    />
  );
}

// ============================================================
// Register all components
// ============================================================

registerBuiltinComponent('form', FormRenderer);
registerBuiltinComponent('input', InputRenderer);
registerBuiltinComponent('textarea', TextareaRenderer);
registerBuiltinComponent('number', NumberRenderer);
registerBuiltinComponent('select', SelectRenderer);
registerBuiltinComponent('switch', SwitchRenderer);
registerBuiltinComponent('checkbox', CheckboxRenderer);
registerBuiltinComponent('radio', RadioRenderer);
registerBuiltinComponent('date-picker', DatePickerRenderer);
