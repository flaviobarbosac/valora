import { useEffect, useState, type FormEvent } from "react";
import { CircleHelp, IdCard, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EMPTY_CUSTOMER, type Customer, type CustomerFormValues } from "@/lib/client-types";
import { agree, newWord, term, useWorkspace } from "@/lib/workspace";
import { CustomFieldsGrid, toInputValues } from "@/components/CustomFields";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing an existing customer… */
  initial: Customer | null;
  /** …or starting from an atendimento's name and contact. */
  prefill?: Partial<CustomerFormValues> | null;
  saving: boolean;
  onSubmit: (values: CustomerFormValues) => Promise<void>;
  onDelete?: (customer: Customer) => void;
};

const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/** Cadastro do cliente, laid out like the back of a postcard. */
export default function CustomerFormDialog({ open, onOpenChange, initial, prefill, saving, onSubmit, onDelete }: Props) {
  const { prefs } = useWorkspace();
  const [values, setValues] = useState<CustomerFormValues>(EMPTY_CUSTOMER);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    if (initial) {
      const { id: _id, ownerName: _owner, isMine: _mine, dealCount: _count, createdAt: _c, updatedAt: _u, ...rest } = initial;
      setValues({ ...EMPTY_CUSTOMER, ...Object.fromEntries(Object.entries(rest).map(([key, value]) => [key, value ?? ""])), customFields: toInputValues(prefs.customerFields, initial.customFields) } as CustomerFormValues);
    } else setValues({ ...EMPTY_CUSTOMER, ...(prefill ?? {}) });
  }, [open, initial, prefill]);

  const set = (key: keyof CustomerFormValues) => (event: { target: { value: string } }) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const text = (key: keyof CustomerFormValues) => String(values[key] ?? "");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!text("name").trim()) { setError(`Informe o nome ${agree("customer", "do")} ${term("customer", true)}.`); return; }
    if (text("email").trim() && !looksLikeEmail(text("email").trim())) { setError("Confira o e-mail."); return; }
    const missing = prefs.customerFields.find((field) => field.required && !values.customFields[field.key]?.trim());
    if (missing) { setError(`Preencha "${missing.label}".`); return; }
    await onSubmit(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="client-dialog customer-dialog">
        <DialogHeader className="dialog-heading">
          <div className="dialog-icon"><IdCard size={19} /></div>
          <div>
            <DialogTitle>{initial ? `Cadastro de ${initial.name}` : `${newWord("customer")} ${term("customer", true)}`}</DialogTitle>
            <DialogDescription>Os dados ficam em {term("customers")} {agree("customer", "cadastrados")}, no menu, e podem ser ligados {agree("deal", "aos")} {term("deals", true)}.</DialogDescription>
          </div>
        </DialogHeader>
        <form className="client-form" onSubmit={submit}>
          <div className="postcard postcard-form">
            <div className="postcard-left">
              <span className="postcard-eyebrow">Observações</span>
              <label className="field"><span className="sr-only">Observações</span><textarea className="postcard-textarea" rows={6} maxLength={4000} value={text("notes")} onChange={set("notes")} placeholder="Preferências, melhor horário para contato, família, histórico…" /></label>
              {prefs.customerFields.length > 0 && <CustomFieldsGrid defs={prefs.customerFields} values={values.customFields} onChange={(customFields) => setValues((current) => ({ ...current, customFields }))} />}
            </div>
            <div className="postcard-divider" aria-hidden="true" />
            <div className="postcard-right">
              <div className="postcard-stamp" aria-hidden="true"><span>{text("name").trim().charAt(0).toLocaleUpperCase("pt-BR") || "?"}</span><small>{term("customer")}</small></div>
              <div className="postcard-fields">
                <label className="field"><span>Nome <b>*</b></span><input autoFocus required maxLength={160} value={text("name")} onChange={set("name")} placeholder="Nome completo" /></label>
                <label className="field"><span>Endereço</span><input maxLength={200} value={text("address")} onChange={set("address")} placeholder="Rua, número, complemento" /></label>
                <div className="postcard-row">
                  <label className="field"><span>Bairro</span><input maxLength={100} value={text("district")} onChange={set("district")} /></label>
                  <label className="field"><span>CEP</span><input maxLength={16} inputMode="numeric" value={text("zip")} onChange={set("zip")} placeholder="00000-000" /></label>
                </div>
                <div className="postcard-row postcard-row-uf">
                  <label className="field"><span>Cidade</span><input maxLength={100} value={text("city")} onChange={set("city")} /></label>
                  <label className="field postcard-uf"><span>UF</span><input maxLength={40} value={text("state")} onChange={set("state")} placeholder="SP" /></label>
                </div>
                <div className="postcard-row">
                  <label className="field"><span>Telefone</span><input type="tel" maxLength={40} value={text("phone")} onChange={set("phone")} placeholder="(11) 90000-0000" /></label>
                  <label className="field"><span>E-mail</span><input type="email" maxLength={320} value={text("email")} onChange={set("email")} /></label>
                </div>
                <div className="postcard-row">
                  <label className="field"><span>CPF / CNPJ</span><input maxLength={32} value={text("document")} onChange={set("document")} /></label>
                  <label className="field"><span>Nascimento</span><input type="date" value={text("birthDate")} onChange={set("birthDate")} /></label>
                </div>
              </div>
            </div>
          </div>
          {error && <div className="form-error"><CircleHelp size={16} />{error}</div>}
          <div className="form-actions">
            {initial && onDelete && <button type="button" className="button button-ghost danger-text" onClick={() => onDelete(initial)}><Trash2 size={14} />Excluir cadastro</button>}
            <button type="button" className="button button-ghost" onClick={() => onOpenChange(false)}>Cancelar</button>
            <button type="submit" className="button button-primary" disabled={saving}>{saving ? "Salvando…" : initial ? "Salvar cadastro" : `Cadastrar ${term("customer", true)}`}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
