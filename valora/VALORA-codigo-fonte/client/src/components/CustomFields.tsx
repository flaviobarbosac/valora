import type { FieldDef } from "@shared/pipeline";

/** One input for a field the company created (Personalizar › campos). */
export function CustomFieldInput({ def, value, onChange }: { def: FieldDef; value: string; onChange: (value: string) => void }) {
  const label = <span>{def.label} {def.required && <b>*</b>}</span>;
  const wide = def.type === "textarea" ? "field field-span-2" : "field";
  if (def.type === "select") {
    return <label className={wide}>{label}<select required={def.required} value={value} onChange={(event) => onChange(event.target.value)}><option value="">Não informado</option>{def.options?.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
  }
  if (def.type === "yesno") {
    return <label className={wide}>{label}<select required={def.required} value={value} onChange={(event) => onChange(event.target.value)}><option value="">Não informado</option><option value="sim">Sim</option><option value="nao">Não</option></select></label>;
  }
  if (def.type === "textarea") {
    return <label className={wide}>{label}<textarea rows={2} maxLength={2000} required={def.required} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
  }
  const type = def.type === "date" ? "date" : def.type === "phone" ? "tel" : "text";
  const inputMode = def.type === "number" || def.type === "money" ? "decimal" as const : undefined;
  const placeholder = def.type === "money" ? "R$ 0,00" : undefined;
  return <label className={wide}>{label}<input type={type} inputMode={inputMode} placeholder={placeholder} maxLength={def.type === "text" ? 160 : 40} required={def.required} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

/** Saved numbers use a dot; show them the Brazilian way in inputs. */
export function toInputValues(defs: FieldDef[], values: Record<string, string>) {
  return Object.fromEntries(defs.map((def) => {
    const value = values[def.key] ?? "";
    return [def.key, (def.type === "money" || def.type === "number") && value ? value.replace(".", ",") : value];
  }));
}

export function CustomFieldsGrid({ defs, values, onChange }: { defs: FieldDef[]; values: Record<string, string>; onChange: (values: Record<string, string>) => void }) {
  if (!defs.length) return null;
  return (
    <div className="form-grid">
      {defs.map((def) => <CustomFieldInput key={def.key} def={def} value={values[def.key] ?? ""} onChange={(value) => onChange({ ...values, [def.key]: value })} />)}
    </div>
  );
}
