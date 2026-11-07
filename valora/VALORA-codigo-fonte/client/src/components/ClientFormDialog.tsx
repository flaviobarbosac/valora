import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { localToday, type ClientFormValues, type ClientRecord, type Customer } from "@/lib/client-types";
import { agree, article, newWord, stageOf, term, useWorkspace } from "@/lib/workspace";
import { STAGE_KIND_LABELS, type StageKind } from "@shared/pipeline";
import { useEffect, useState, type FormEvent } from "react";
import RecordNotes from "@/components/RecordNotes";
import { CustomFieldsGrid, toInputValues } from "@/components/CustomFields";
import { CalendarDays, CircleHelp, UserRound } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: ClientRecord | null;
  onSubmit: (values: ClientFormValues) => Promise<void>;
  saving: boolean;
  /** Someone else's record (visible to leaders, managers and admins): show it without editing. */
  readOnly?: boolean;
  ownerName?: string;
  /** Overrides the read-only explanation (e.g. "Ver como" mode). */
  viewOnlyReason?: string;
  /** My registered customers, to link the atendimento to one. */
  customers: Customer[];
  /** A new atendimento for this customer (from Clientes cadastrados). */
  presetCustomer?: Customer | null;
};

const KIND_ORDER: StageKind[] = ["open", "handoff", "won", "lost"];

export default function ClientFormDialog({ open, onOpenChange, initial, onSubmit, saving, readOnly = false, ownerName, viewOnlyReason, customers, presetCustomer }: Props) {
  const { productOf, myProduct, products, data } = useWorkspace();
  const choices = !initial && data?.canChooseProduct ? products.filter((item) => item.inWorkspace && item.id > 0) : [];
  const [chosenId, setChosenId] = useState<number | null>(null);
  const product = initial ? productOf(initial) : choices.find((item) => item.id === chosenId) ?? myProduct;
  const config = product?.config;
  const empty = (): ClientFormValues => ({
    name: presetCustomer?.name ?? "", contact: presetCustomer?.phone || presetCustomer?.email || "", contactDate: localToday(),
    lastProductSold: "", objection: "", objectionNotes: "", stage: config?.stages[0]?.key ?? "new", followUpDate: "",
    customerId: presetCustomer?.id ?? null, customFields: {},
  });
  const [values, setValues] = useState<ClientFormValues>(empty);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    if (!initial) setChosenId(myProduct?.id ?? null);
    setValues(initial ? {
      reference: initial.reference,
      name: initial.name,
      contact: initial.contact ?? "",
      contactDate: initial.contactDate,
      lastProductSold: initial.lastProductSold ?? "",
      objection: initial.objection ?? "",
      objectionNotes: initial.objectionNotes ?? "",
      stage: initial.stage,
      followUpDate: initial.followUpDate ?? "",
      customerId: initial.customerId,
      customFields: toInputValues(config?.fields ?? [], initial.customFields),
    } : empty());
  }, [open, initial, presetCustomer]);

  const update = <K extends keyof ClientFormValues>(key: K, value: ClientFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const stage = stageOf(product, values.stage);
  const kind = stage?.kind ?? "open";
  const reasons = config?.reasons ?? [];
  const linked = customers.find((customer) => customer.id === values.customerId) ?? null;

  const chooseCustomer = (id: number | null) => {
    const customer = customers.find((item) => item.id === id);
    setValues((current) => ({
      ...current,
      customerId: id,
      ...(customer ? { name: current.name.trim() ? current.name : customer.name, contact: current.contact.trim() ? current.contact : customer.phone || customer.email || "" } : {}),
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (readOnly) return;
    setError("");
    if (!values.name.trim()) { setError(`Informe o nome ${agree("customer", "do")} ${term("customer", true)}.`); return; }
    if (kind === "lost" && reasons.length && !values.objection) { setError("Selecione o motivo de não ter fechado."); return; }
    const missing = config?.fields.find((field) => field.required && !values.customFields[field.key]?.trim());
    if (missing) { setError(`Preencha "${missing.label}".`); return; }
    await onSubmit(choices.length > 1 && product ? { ...values, productId: product.id } : values);
  };

  const chooseProduct = (id: number) => {
    const next = choices.find((item) => item.id === id);
    setChosenId(id);
    // Stages, reasons and fields belong to the product: start them over.
    setValues((current) => ({ ...current, stage: next?.config.stages[0]?.key ?? current.stage, objection: "", lastProductSold: "", customFields: {} }));
  };

  const title = readOnly ? (viewOnlyReason ? `Ficha ${agree("customer", "do")} ${term("customer", true)}` : `${term("deal")} da equipe`) : initial ? `Editar ${term("deal", true)}` : `${newWord("deal")} ${term("deal", true)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="client-dialog">
        <DialogHeader className="dialog-heading">
          <div className="dialog-icon"><UserRound size={19} /></div>
          <div>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{readOnly ? (viewOnlyReason ?? `Registrado por ${ownerName ?? "outra pessoa"}. Só quem registrou pode alterar.`) : product ? <>Pipeline de <b>{product.name}</b>. Registre o contato e deixe o próximo passo visível.</> : "Registre o contato e deixe o próximo passo visível."}</DialogDescription>
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="client-form">
          <fieldset className="client-form-fields" disabled={readOnly}>
          <div className="form-section-title"><span>Dados {agree("customer", "do")} {term("customer", true)}</span><i /></div>
          {initial && <div className="reference-line"><span>Referencial</span><strong>{initial.reference}</strong></div>}
          <div className="form-grid">
            {choices.length > 1 && <label className="field field-span-2"><span>Produto</span><select value={product?.id ?? ""} onChange={(event) => chooseProduct(Number(event.target.value))}>{choices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
            {(customers.length > 0 || linked) && <label className="field field-span-2"><span>{term("customer")} {agree("customer", "cadastrado")} <small>(opcional)</small></span><select value={values.customerId ?? ""} onChange={(event) => chooseCustomer(event.target.value ? Number(event.target.value) : null)}><option value="">Sem cadastro</option>{linked && !customers.some((item) => item.id === linked.id) && <option value={linked.id}>{linked.name}</option>}{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.document ? ` · ${customer.document}` : ""}</option>)}</select></label>}
            <label className="field field-span-2"><span>Nome {agree("customer", "do")} {term("customer", true)} <b>*</b></span><input autoFocus={!readOnly} required maxLength={160} value={values.name} onChange={(event) => update("name", event.target.value)} placeholder="Ex.: Mariana Costa" /></label>
            <label className="field"><span>Contato</span><input maxLength={100} value={values.contact} onChange={(event) => update("contact", event.target.value)} placeholder="Telefone ou e-mail" /></label>
            <label className="field"><span>Dia do contato <b>*</b></span><div className="input-with-icon"><CalendarDays size={16} /><input type="date" required value={values.contactDate} onChange={(event) => update("contactDate", event.target.value)} /></div></label>
          </div>

          <div className="form-section-title"><span>Andamento</span><i /></div>
          <div className="form-grid">
            <label className="field"><span>Etapa do pipeline</span><select value={values.stage} onChange={(event) => update("stage", event.target.value)}>
              {KIND_ORDER.map((group) => {
                const stages = config?.stages.filter((item) => item.kind === group) ?? [];
                return stages.length ? <optgroup key={group} label={STAGE_KIND_LABELS[group]}>{stages.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</optgroup> : null;
              })}
              {!stage && <option value={values.stage}>{values.stage}</option>}
            </select></label>
            <label className="field"><span>Próximo contato <small>(opcional)</small></span><input type="date" value={values.followUpDate} onChange={(event) => update("followUpDate", event.target.value)} /></label>
            {kind === "won" && <label className="field field-span-2"><span>{config?.itemLabel ?? "Produto vendido"} <small>(opcional)</small></span><input list="sold-items" maxLength={160} value={values.lastProductSold} onChange={(event) => update("lastProductSold", event.target.value)} placeholder={config?.items[0] ? `Ex.: ${config.items[0]}` : "O que foi vendido"} /><datalist id="sold-items">{config?.items.map((item) => <option key={item} value={item} />)}</datalist></label>}
            {reasons.length > 0 && kind !== "won" && <label className="field field-span-2"><span>{kind === "lost" ? <>Motivo de não ter fechado <b>*</b></> : <>Objeção ou situação <small>(opcional — motivos de "retornar" marcam {article("customer")} {term("customer", true)} como {agree("customer", "indeciso")})</small></>}</span><select required={kind === "lost"} value={values.objection} onChange={(event) => update("objection", event.target.value)}><option value="">{kind === "lost" ? "Selecione o motivo" : "Nenhuma"}</option>{reasons.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>}
            <label className="field field-span-2"><span>Observação <small>(opcional)</small></span><textarea rows={2} maxLength={2000} value={values.objectionNotes} onChange={(event) => update("objectionNotes", event.target.value)} placeholder="Anote um detalhe útil para o próximo contato" /></label>
          </div>

          {Boolean(config?.fields.length) && <>
            <div className="form-section-title"><span>Informações de {product?.name}</span><i /></div>
            <CustomFieldsGrid defs={config!.fields} values={values.customFields} onChange={(customFields) => update("customFields", customFields)} />
          </>}
          </fieldset>
          {initial && <RecordNotes recordId={initial.id} canReview={initial.canReview} isMine={initial.isMine} readOnly={Boolean(viewOnlyReason)} />}
          {error && <div className="form-error"><CircleHelp size={16} />{error}</div>}
          {readOnly
            ? <div className="form-actions"><button type="button" className="button button-primary" onClick={() => onOpenChange(false)}>Fechar</button></div>
            : <div className="form-actions"><button type="button" className="button button-ghost" onClick={() => onOpenChange(false)}>Cancelar</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? "Salvando…" : initial ? "Salvar alterações" : `Salvar ${term("deal", true)}`}</button></div>}
        </form>
      </DialogContent>
    </Dialog>
  );
}
