import { useMemo, useState } from "react";
import { IdCard, LoaderCircle, Mail, MapPin, Phone, Plus, Search, X } from "lucide-react";
import type { Customer } from "@/lib/client-types";
import { agree, newWord, term } from "@/lib/workspace";

type Props = {
  customers: Customer[];
  loading: boolean;
  readOnly: boolean;
  onOpen: (customer: Customer) => void;
  onNew: () => void;
};

/** Clientes cadastrados: a wall of postcards. */
export default function CustomersPanel({ customers, loading, readOnly, onOpen, onNew }: Props) {
  const [search, setSearch] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const hasOthers = customers.some((customer) => !customer.isMine);
  const shown = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return customers.filter((customer) => (!onlyMine || customer.isMine) && (!query || [customer.name, customer.phone, customer.email, customer.document, customer.city, customer.district]
      .some((part) => (part ?? "").toLocaleLowerCase("pt-BR").includes(query))));
  }, [customers, search, onlyMine]);

  return (
    <section className="panel records-panel customers-panel">
      <div className="records-heading">
        <div><div className="panel-heading-title"><h2>{term("customers")} {agree("customer", "cadastrados")}</h2><span className="soft-count">{customers.length}</span></div><p>Clique num cartão para ver o cadastro e {agree("deal", "os")} {term("deals", true)} de cada {term("customer", true)}.</p></div>
        {!readOnly && <button type="button" className="button button-primary" onClick={onNew}><Plus size={15} />{newWord("customer")} {term("customer", true)}</button>}
      </div>
      <div className="filter-toolbar">
        <div className="search-box"><Search size={16} /><input aria-label={`Buscar ${term("customer", true)}`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, telefone, e-mail, documento ou cidade…" />{search && <button title="Limpar busca" onClick={() => setSearch("")}><X size={14} /></button>}</div>
        {hasOthers && <div className="scope-switch" role="group"><button type="button" className={!onlyMine ? "active" : ""} onClick={() => setOnlyMine(false)}>Todos</button><button type="button" className={onlyMine ? "active" : ""} onClick={() => setOnlyMine(true)}>Meus</button></div>}
      </div>
      {loading ? <div className="loading-table"><LoaderCircle className="spin" size={20} />Carregando…</div>
        : shown.length === 0 ? (
          <div className="table-empty">
            <div className="empty-illustration"><IdCard size={24} /></div>
            <h3>{customers.length ? "Ninguém encontrado" : `${agree("customer", "Nenhum")} ${term("customer", true)} ${agree("customer", "cadastrado")} ainda`}</h3>
            <p>{customers.length ? "Tente outra busca." : `Cadastre aqui, ou abra ${agree("deal", "um")} ${term("deal", true)} no pipeline e use "Cadastrar ${term("customer", true)}".`}</p>
          </div>
        ) : (
          <div className="postcard-wall">
            {shown.map((customer) => (
              <button type="button" key={customer.id} className="postcard-mini" onClick={() => onOpen(customer)}>
                <span className="postcard-mini-stamp">{customer.name.trim().charAt(0).toLocaleUpperCase("pt-BR")}</span>
                <strong>{customer.name}</strong>
                {(customer.city || customer.district) && <span><MapPin size={11} />{[customer.district, [customer.city, customer.state].filter(Boolean).join("/")].filter(Boolean).join(" — ")}</span>}
                {customer.phone && <span><Phone size={11} />{customer.phone}</span>}
                {customer.email && <span><Mail size={11} />{customer.email}</span>}
                <span className="postcard-mini-foot">{customer.dealCount} {customer.dealCount === 1 ? term("deal", true) : term("deals", true)}{!customer.isMine && <em>{customer.ownerName}</em>}</span>
              </button>
            ))}
          </div>
        )}
    </section>
  );
}
