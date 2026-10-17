import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BANK_OPTIONS,
  CREDIT_OPTIONS,
  EMPTY_CLIENT,
  OBJECTIONS,
  PIPELINE_STAGES,
  PRODUCT_CLASSES,
  stageLabel,
  type ClientFormValues,
  type ClientRecord,
} from "@/lib/client-types";
import { useEffect, useState, type FormEvent } from "react";
import RecordNotes from "@/components/RecordNotes";
import { CalendarDays, CheckCircle2, CircleHelp, UserRound } from "lucide-react";

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
};

const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const SALE_OPTIONS = [
  { value: "pending", label: "Em andamento" },
  { value: "sold", label: "Sim, venda fechada" },
  { value: "not_sold", label: "Não fechou" },
] as const;

export default function ClientFormDialog({ open, onOpenChange, initial, onSubmit, saving, readOnly = false, ownerName, viewOnlyReason }: Props) {
  const [values, setValues] = useState<ClientFormValues>({ ...EMPTY_CLIENT, contactDate: localToday() });
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setValues(initial ? {
      reference: initial.reference,
      name: initial.name,
      contact: initial.contact ?? "",
      contactDate: initial.contactDate,
      hasCreditLimit: initial.hasCreditLimit,
      saleStatus: initial.saleStatus,
      lastProductSold: initial.lastProductSold ?? "",
      productClass: initial.productClass ?? "",
      isBankCustomer: initial.isBankCustomer,
      objection: initial.objection ?? "",
      objectionNotes: initial.objectionNotes ?? "",
      interestedWithoutLimit: initial.interestedWithoutLimit,
      stage: initial.stage,
      followUpDate: initial.followUpDate ?? "",
    } : { ...EMPTY_CLIENT, contactDate: localToday() });
  }, [open, initial]);

  const update = <K extends keyof ClientFormValues>(key: K, value: ClientFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (readOnly) return;
    setError("");
    if (!values.name.trim()) {
      setError("Informe o nome do cliente.");
      return;
    }
    if (values.saleStatus === "sold" && !values.lastProductSold.trim()) {
      setError("Informe o último produto vendido.");
      return;
    }
    if (values.saleStatus === "sold" && !values.productClass) {
      setError("Selecione a classe do produto vendido.");
      return;
    }
    if (values.saleStatus === "not_sold" && !values.objection) {
      setError("Selecione o motivo de não fechamento.");
      return;
    }
    await onSubmit(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="client-dialog">
        <DialogHeader className="dialog-heading">
          <div className="dialog-icon"><UserRound size={19} /></div>
          <div>
            <DialogTitle>{readOnly ? (viewOnlyReason ? "Ficha do cliente" : "Atendimento da equipe") : initial ? "Editar atendimento" : "Novo atendimento"}</DialogTitle>
            <DialogDescription>{readOnly ? (viewOnlyReason ?? `Registrado por ${ownerName ?? "outra pessoa"}. Só quem registrou pode alterar.`) : "Registre o contato e deixe o próximo passo visível."}</DialogDescription>
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="client-form">
          <fieldset className="client-form-fields" disabled={readOnly}>
          <div className="form-section-title"><span>Dados do cliente</span><i /></div>
          {initial && <div className="reference-line"><span>Referencial</span><strong>{initial.reference}</strong></div>}
          <div className="form-grid">
            <label className="field field-span-2"><span>Nome do cliente <b>*</b></span><input autoFocus={!readOnly} required maxLength={160} value={values.name} onChange={(event) => update("name", event.target.value)} placeholder="Ex.: Mariana Costa" /></label>
            <label className="field"><span>Contato</span><input maxLength={100} value={values.contact} onChange={(event) => update("contact", event.target.value)} placeholder="Telefone ou e-mail" /></label>
            <label className="field"><span>Dia do contato <b>*</b></span><div className="input-with-icon"><CalendarDays size={16} /><input type="date" required value={values.contactDate} onChange={(event) => update("contactDate", event.target.value)} /></div></label>
          </div>

          <div className="form-section-title"><span>Perfil e oportunidade</span><i /></div>
          <div className="form-grid">
            <label className="field"><span>Limite de crédito disponível</span><select value={values.hasCreditLimit} onChange={(event) => {
              const hasCreditLimit = event.target.value as ClientFormValues["hasCreditLimit"];
              setValues((current) => ({
                ...current,
                hasCreditLimit,
                ...(hasCreditLimit === "yes" ? {
                  interestedWithoutLimit: false,
                  stage: current.stage === "awaiting_limit" ? "contacted" : current.stage,
                  objection: current.objection === "no_limit" ? "" : current.objection,
                } : {}),
              }));
            }}>{CREDIT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="field"><span>Já é cliente do banco?</span><select value={values.isBankCustomer} onChange={(event) => update("isBankCustomer", event.target.value as ClientFormValues["isBankCustomer"])}>{BANK_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="field"><span>Resultado do atendimento</span><select value={values.saleStatus} onChange={(event) => {
              const saleStatus = event.target.value as ClientFormValues["saleStatus"];
              setValues((current) => {
                if (saleStatus === "sold") return { ...current, saleStatus, stage: "sold", interestedWithoutLimit: false, objection: current.objection === "no_limit" ? "" : current.objection };
                if (saleStatus === "not_sold") return { ...current, saleStatus, stage: current.stage === "sold" || current.stage === "technical" ? "lost" : current.stage };
                return { ...current, saleStatus, stage: current.stage === "sold" || current.stage === "lost" ? "contacted" : current.stage };
              });
            }}>{SALE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="field"><span>Último produto vendido {values.saleStatus === "sold" && <b>*</b>}</span><input maxLength={160} required={values.saleStatus === "sold"} value={values.lastProductSold} onChange={(event) => {
              const lastProductSold = event.target.value;
              setValues((current) => ({ ...current, lastProductSold, ...(lastProductSold.trim() ? {} : { productClass: "" }) }));
            }} placeholder="Ex.: Empréstimo pessoal" /></label>
            {(values.saleStatus === "sold" || Boolean(values.lastProductSold.trim())) && <label className="field"><span>Classe do produto {values.saleStatus === "sold" && <b>*</b>}</span><select required={values.saleStatus === "sold"} value={values.productClass} onChange={(event) => update("productClass", event.target.value as ClientFormValues["productClass"])}><option value="">Selecione a classe</option>{PRODUCT_CLASSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>}
          </div>

          <label className={`interest-toggle ${values.interestedWithoutLimit ? "is-active" : ""}`}>
            <input type="checkbox" checked={values.interestedWithoutLimit} onChange={(event) => {
              const interested = event.target.checked;
              setValues((current) => interested
                ? {
                    ...current,
                    interestedWithoutLimit: true,
                    hasCreditLimit: "no",
                    saleStatus: current.saleStatus === "sold" ? "pending" : current.saleStatus,
                    stage: "awaiting_limit",
                    objection: current.objection || "no_limit",
                  }
                : {
                    ...current,
                    interestedWithoutLimit: false,
                    stage: current.stage === "awaiting_limit" ? "contacted" : current.stage,
                  });
            }} />
            <span className="interest-check"><CheckCircle2 size={17} /></span>
            <span><strong>Tem interesse, mas está sem limite agora</strong><small>Ajuda a separar oportunidades para retomar quando o limite estiver disponível.</small></span>
          </label>

          {values.saleStatus === "not_sold" && <>
            <div className="form-section-title"><span>Motivo do não fechamento</span><i /></div>
            <div className="form-grid">
              <label className="field"><span>Objeção principal <b>*</b></span><select required value={values.objection} onChange={(event) => update("objection", event.target.value as ClientFormValues["objection"])}><option value="">Selecione o motivo</option>{OBJECTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label className="field"><span>Etapa do acompanhamento</span><select value={values.stage} onChange={(event) => update("stage", event.target.value as ClientFormValues["stage"])}>{PIPELINE_STAGES.map((item) => <option key={item.value} disabled={item.value === "sold" || item.value === "technical"} value={item.value}>{stageLabel(item.value)}</option>)}</select></label>
              <label className="field field-span-2"><span>Observação <small>(opcional)</small></span><textarea rows={2} maxLength={2000} value={values.objectionNotes} onChange={(event) => update("objectionNotes", event.target.value)} placeholder="Anote um detalhe útil para o próximo contato" /></label>
            </div>
          </>}
          {values.saleStatus === "pending" && <div className="form-grid">
            <label className="field field-span-2"><span>Objeção ou situação <small>(opcional — "Vai pensar" marca o cliente como indeciso, para retornar de novo)</small></span><select value={values.objection} onChange={(event) => update("objection", event.target.value as ClientFormValues["objection"])}><option value="">Nenhuma</option>{OBJECTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          </div>}
          {values.saleStatus !== "not_sold" && <div className="form-grid">
            <label className="field"><span>Etapa do acompanhamento</span><select disabled={values.saleStatus === "sold"} value={values.stage} onChange={(event) => update("stage", event.target.value as ClientFormValues["stage"])}>{PIPELINE_STAGES.map((item) => <option key={item.value} disabled={(item.value === "sold" && values.saleStatus !== "sold") || (item.value === "lost" && values.saleStatus !== "not_sold")} value={item.value}>{stageLabel(item.value)}</option>)}</select></label>
            <label className="field"><span>Próximo contato <small>(opcional)</small></span><input type="date" value={values.followUpDate} onChange={(event) => update("followUpDate", event.target.value)} /></label>
          </div>}
          {values.saleStatus === "not_sold" && <label className="field follow-up-field"><span>Próximo contato <small>(opcional)</small></span><input type="date" value={values.followUpDate} onChange={(event) => update("followUpDate", event.target.value)} /></label>}

          </fieldset>
          {initial && <RecordNotes recordId={initial.id} canReview={initial.canReview} isMine={initial.isMine} readOnly={Boolean(viewOnlyReason)} />}
          {error && <div className="form-error"><CircleHelp size={16} />{error}</div>}
          {readOnly
            ? <div className="form-actions"><button type="button" className="button button-primary" onClick={() => onOpenChange(false)}>Fechar</button></div>
            : <div className="form-actions"><button type="button" className="button button-ghost" onClick={() => onOpenChange(false)}>Cancelar</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? "Salvando…" : initial ? "Salvar alterações" : "Salvar atendimento"}</button></div>}
        </form>
      </DialogContent>
    </Dialog>
  );
}
