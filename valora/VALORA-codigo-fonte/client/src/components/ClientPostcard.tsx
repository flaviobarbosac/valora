import { CalendarClock, IdCard, Mail, Pencil, Phone, Plus, StickyNote, UserPlus, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatCustomValue } from "@shared/pipeline";
import type { ClientRecord, Customer } from "@/lib/client-types";
import { agree, newWord, reasonLabel, stageOf, term, useWorkspace } from "@/lib/workspace";

const dateBR = (value: string | null | undefined) => (value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "");
const MONTHS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
/** "21 OUT 26", like a post office stamp. */
const postmarkDate = (value: string) => `${value.slice(8, 10)} ${MONTHS[Number(value.slice(5, 7)) - 1] ?? ""} ${value.slice(2, 4)}`;

/** The address side: who the customer is and how to reach them. */
export function PostcardAddress({ customer, fallbackName, fallbackContact, stampLabel, postmark, logo }: {
  customer: Customer | null; fallbackName: string; fallbackContact?: string | null; stampLabel: string; postmark?: string | null; logo?: string | null;
}) {
  const { prefs } = useWorkspace();
  const name = customer?.name ?? fallbackName;
  const cityLine = [customer?.district, [customer?.city, customer?.state].filter(Boolean).join("/")].filter(Boolean).join(" — ");
  const extra = prefs.customerFields.filter((field) => customer?.customFields[field.key]);
  return (
    <div className="postcard-right">
      <div className="postcard-stamp" aria-hidden="true">
        {logo ? <img src={logo} alt="" /> : <span>{name.trim().charAt(0).toLocaleUpperCase("pt-BR") || "?"}</span>}
        <small>{stampLabel}</small>
      </div>
      {postmark && <div className="postcard-postmark" aria-hidden="true"><span>{postmark}</span></div>}
      <div className="postcard-lines">
        <p className="postcard-line postcard-line-name">{name}</p>
        <p className="postcard-line">{customer?.address || <i>{customer ? "Endereço não informado" : "Sem cadastro"}</i>}</p>
        <p className="postcard-line">{cityLine || <i>&nbsp;</i>}</p>
        <p className="postcard-line postcard-line-zip">{customer?.zip ? `CEP ${customer.zip}` : <i>&nbsp;</i>}</p>
      </div>
      <ul className="postcard-contacts">
        {(customer?.phone || (!customer && fallbackContact)) && <li><Phone size={12} />{customer?.phone ?? fallbackContact}</li>}
        {customer?.email && <li><Mail size={12} />{customer.email}</li>}
        {customer?.document && <li><IdCard size={12} />{customer.document}</li>}
        {customer?.birthDate && <li><CalendarClock size={12} />Nascimento {dateBR(customer.birthDate)}</li>}
        {extra.map((field) => <li key={field.key}><b>{field.label}:</b> {formatCustomValue(field, customer!.customFields[field.key])}</li>)}
      </ul>
    </div>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The atendimento clicked on the pipeline (deal view)… */
  record: ClientRecord | null;
  /** …or just the registered customer (Clientes cadastrados). */
  customer: Customer | null;
  /** Atendimentos linked to the customer. */
  deals: ClientRecord[];
  readOnly: boolean;
  logo?: string | null;
  onEditDeal: (record: ClientRecord) => void;
  onOpenDeal: (record: ClientRecord) => void;
  onRegister: (record: ClientRecord) => void;
  onEditCustomer: (customer: Customer) => void;
  onNewDeal: (customer: Customer) => void;
};

export default function ClientPostcard({ open, onOpenChange, record, customer, deals, readOnly, logo, onEditDeal, onOpenDeal, onRegister, onEditCustomer, onNewDeal }: Props) {
  const { productOf } = useWorkspace();
  const product = record ? productOf(record) : null;
  const stage = record ? stageOf(product, record.stage) : undefined;
  const fields = record && product ? product.config.fields.filter((field) => record.customFields[field.key]) : [];
  const name = customer?.name ?? record?.name ?? "";
  const otherDeals = deals.filter((deal) => deal.id !== record?.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="postcard-dialog" showCloseButton={false}>
        <DialogTitle className="sr-only">Ficha de {name}</DialogTitle>
        <DialogDescription className="sr-only">Cartão com os dados {agree("customer", "do")} {term("customer", true)} e {agree("deal", "do")} {term("deal", true)}.</DialogDescription>
        <button type="button" className="postcard-close" aria-label="Fechar" onClick={() => onOpenChange(false)}><X size={16} /></button>
        <article className="postcard">
          <div className="postcard-left">
            {record ? <>
              <span className="postcard-eyebrow">{product?.name ?? term("deal")} · {record.reference}</span>
              <h3 className="postcard-greeting">{record.name}</h3>
              <div className="postcard-stage">{stage && <span className={`stage-dot stage-${stage.color}`} />}{stage?.label ?? record.stage}{!record.isMine && <span className="owner-tag">{record.ownerName}</span>}</div>
              <dl className="postcard-facts">
                <div><dt>Dia do contato</dt><dd>{dateBR(record.contactDate)}</dd></div>
                {record.followUpDate && <div><dt>Próximo contato</dt><dd>{dateBR(record.followUpDate)}</dd></div>}
                {record.contact && <div><dt>Contato</dt><dd>{record.contact}</dd></div>}
                {record.lastProductSold && <div><dt>{product?.config.itemLabel ?? "Produto vendido"}</dt><dd>{record.lastProductSold}</dd></div>}
                {record.objection && <div><dt>{stage?.kind === "lost" ? "Motivo" : "Situação"}</dt><dd>{reasonLabel(product, record.objection)}</dd></div>}
                {fields.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{formatCustomValue(field, record.customFields[field.key])}</dd></div>)}
              </dl>
              {record.objectionNotes && <p className="postcard-message">“{record.objectionNotes}”</p>}
            </> : <>
              <span className="postcard-eyebrow">{term("customer")} {agree("customer", "cadastrado")}{customer && !customer.isMine ? ` · ${customer.ownerName}` : ""}</span>
              <h3 className="postcard-greeting">{name}</h3>
              {customer?.notes ? <p className="postcard-message">“{customer.notes}”</p> : <p className="postcard-message postcard-message-empty">Sem observações.</p>}
            </>}
            {(record ? otherDeals.length > 0 : deals.length > 0) && <div className="postcard-deals">
              <span>{record ? `${agree("deal", "Outros")} ${term("deals", true)}` : term("deals")}</span>
              <ul>{(record ? otherDeals : deals).map((deal) => {
                const dealStage = stageOf(productOf(deal), deal.stage);
                return <li key={deal.id}><button type="button" onClick={() => onOpenDeal(deal)}>{dealStage && <span className={`stage-dot stage-${dealStage.color}`} />}<span>{dealStage?.label ?? deal.stage}</span><small>{dateBR(deal.contactDate)} · {deal.reference}</small></button></li>;
              })}</ul>
            </div>}
            {record && customer?.notes && <p className="postcard-note"><StickyNote size={11} />{customer.notes}</p>}
          </div>
          <div className="postcard-divider" aria-hidden="true" />
          <PostcardAddress customer={customer} fallbackName={record?.name ?? ""} fallbackContact={record?.contact} stampLabel={product?.name ?? term("customer")} postmark={record ? postmarkDate(record.contactDate) : null} logo={logo} />
        </article>
        <div className="postcard-actions">
          {record && <button type="button" className="button button-outline" onClick={() => onEditDeal(record)}><Pencil size={14} />{record.canEdit && !readOnly ? `Editar ${term("deal", true)}` : `Ver ${term("deal", true)}`}</button>}
          {!readOnly && record && !customer && record.canEdit && <button type="button" className="button button-primary" onClick={() => onRegister(record)}><UserPlus size={14} />Cadastrar {term("customer", true)}</button>}
          {!readOnly && customer?.isMine && <button type="button" className={`button ${record ? "button-outline" : "button-primary"}`} onClick={() => onEditCustomer(customer)}><IdCard size={14} />Editar cadastro</button>}
          {!readOnly && customer?.isMine && !record && <button type="button" className="button button-outline" onClick={() => onNewDeal(customer)}><Plus size={14} />{newWord("deal")} {term("deal", true)}</button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
