import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Boxes, LayoutList, ListChecks, LoaderCircle, MessageSquareText, Plus, RotateCcw, Save, Settings2, Trash2, Workflow } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_TERMS, FIELD_TYPES, FIELD_TYPE_LABELS, HANDOFF_STAGE_KEY, STAGE_COLORS, STAGE_KINDS, STAGE_KIND_LABELS, TERM_KEYS,
  makeKey, productConfigProblem, templateByKey, type FieldDef, type ProductConfig, type StageDef, type TermKey, type WorkspacePrefs,
} from "@shared/pipeline";
import { useAppDialog } from "@/components/AppDialogs";
import { trpc } from "@/lib/trpc";
import type { Product, WorkspaceData } from "@/lib/workspace";

const move = <T,>(list: T[], index: number, delta: number) => {
  const next = [...list];
  const target = index + delta;
  if (target < 0 || target >= next.length) return list;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

const TERM_LABELS: Record<TermKey, string> = {
  customer: "Cliente (singular)", customers: "Clientes (plural)", deal: "Atendimento (singular)", deals: "Atendimentos (plural)", sale: "Venda (singular)", sales: "Vendas (plural)",
};

const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** Comma-separated options, kept as typed while editing. */
function OptionsInput({ options, onChange }: { options: string[]; onChange: (options: string[]) => void }) {
  const [raw, setRaw] = useState(options.join(", "));
  const parse = (value: string) => Array.from(new Set(value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean))).slice(0, 30);
  useEffect(() => { if (parse(raw).join("|") !== options.join("|")) setRaw(options.join(", ")); }, [options]);
  return <input className="ws-options" value={raw} placeholder="Opções separadas por vírgula" onChange={(event) => { setRaw(event.target.value); onChange(parse(event.target.value)); }} />;
}

/** Extra fields of an atendimento (per product) or of the customer registry. */
export function FieldListEditor({ fields, onChange, cardOption }: { fields: FieldDef[]; onChange: (fields: FieldDef[]) => void; cardOption: boolean }) {
  const update = (index: number, patch: Partial<FieldDef>) => onChange(fields.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  const add = () => onChange([...fields, { key: makeKey("Novo campo", fields.map((field) => field.key)), label: "Novo campo", type: "text" }]);
  return (
    <div className="ws-list">
      {fields.length === 0 && <p className="team-empty">Nenhum campo extra.</p>}
      {fields.map((field, index) => (
        <div className="ws-row ws-row-field" key={field.key}>
          <input aria-label="Nome do campo" maxLength={60} value={field.label} onChange={(event) => update(index, { label: event.target.value })} />
          <select aria-label="Tipo do campo" value={field.type} onChange={(event) => update(index, { type: event.target.value as FieldDef["type"], options: event.target.value === "select" ? field.options ?? [] : undefined })}>{FIELD_TYPES.map((type) => <option key={type} value={type}>{FIELD_TYPE_LABELS[type]}</option>)}</select>
          {field.type === "select" ? <OptionsInput options={field.options ?? []} onChange={(options) => update(index, { options })} /> : <span className="ws-options-placeholder" />}
          <label className="ws-check"><input type="checkbox" checked={Boolean(field.required)} onChange={(event) => update(index, { required: event.target.checked })} />Obrigatório</label>
          {cardOption && <label className="ws-check"><input type="checkbox" checked={Boolean(field.showOnCard)} onChange={(event) => update(index, { showOnCard: event.target.checked })} />No cartão</label>}
          <span className="icon-actions">
            <button type="button" title="Subir" aria-label="Subir" onClick={() => onChange(move(fields, index, -1))}><ArrowUp size={13} /></button>
            <button type="button" title="Descer" aria-label="Descer" onClick={() => onChange(move(fields, index, 1))}><ArrowDown size={13} /></button>
            <button type="button" className="danger" title="Excluir" aria-label={`Excluir ${field.label}`} onClick={() => onChange(fields.filter((_, i) => i !== index))}><Trash2 size={13} /></button>
          </span>
        </div>
      ))}
      <button type="button" className="button button-outline ws-add" disabled={fields.length >= 25} onClick={add}><Plus size={14} />Adicionar campo</button>
    </div>
  );
}

function StageListEditor({ stages, onChange, allowHandoff }: { stages: StageDef[]; onChange: (stages: StageDef[]) => void; allowHandoff: boolean }) {
  const update = (index: number, patch: Partial<StageDef>) => onChange(stages.map((stage, i) => (i === index ? { ...stage, ...patch } : stage)));
  const hasHandoff = stages.some((stage) => stage.kind === "handoff");
  const add = () => {
    // New stages go before the first closing stage.
    const at = stages.findIndex((stage) => stage.kind === "won" || stage.kind === "lost");
    const stage: StageDef = { key: makeKey("Nova etapa", stages.map((item) => item.key)), label: "Nova etapa", color: "blue", kind: "open" };
    onChange(at < 0 ? [...stages, stage] : [...stages.slice(0, at), stage, ...stages.slice(at)]);
  };
  const toggleHandoff = () => {
    if (hasHandoff) { onChange(stages.filter((stage) => stage.kind !== "handoff")); return; }
    const at = stages.findIndex((stage) => stage.kind === "won" || stage.kind === "lost");
    const stage: StageDef = { key: HANDOFF_STAGE_KEY, label: "Caso técnico", color: "orange", kind: "handoff" };
    onChange(at < 0 ? [...stages, stage] : [...stages.slice(0, at), stage, ...stages.slice(at)]);
  };
  return (
    <div className="ws-list">
      {stages.map((stage, index) => (
        <div className="ws-row ws-row-stage" key={stage.key}>
          <span className="ws-order">{index + 1}</span>
          <div className="ws-colors" role="radiogroup" aria-label={`Cor de ${stage.label}`}>{STAGE_COLORS.map((color) => <button type="button" key={color} role="radio" aria-checked={stage.color === color} aria-label={color} className={`ws-swatch stage-${color} ${stage.color === color ? "active" : ""}`} onClick={() => update(index, { color })} />)}</div>
          <input aria-label="Nome da etapa" maxLength={60} value={stage.label} onChange={(event) => update(index, { label: event.target.value })} />
          {stage.kind === "handoff"
            ? <span className="ws-kind-fixed">{STAGE_KIND_LABELS.handoff}</span>
            : <select aria-label="Tipo da etapa" value={stage.kind} onChange={(event) => update(index, { kind: event.target.value as StageDef["kind"] })}>{STAGE_KINDS.filter((kind) => kind !== "handoff").map((kind) => <option key={kind} value={kind}>{STAGE_KIND_LABELS[kind]}</option>)}</select>}
          <span className="icon-actions">
            <button type="button" title="Mover para a esquerda" aria-label="Subir" onClick={() => onChange(move(stages, index, -1))}><ArrowUp size={13} /></button>
            <button type="button" title="Mover para a direita" aria-label="Descer" onClick={() => onChange(move(stages, index, 1))}><ArrowDown size={13} /></button>
            <button type="button" className="danger" title="Excluir" aria-label={`Excluir ${stage.label}`} disabled={stages.length <= 3} onClick={() => onChange(stages.filter((_, i) => i !== index))}><Trash2 size={13} /></button>
          </span>
        </div>
      ))}
      <div className="ws-list-actions">
        <button type="button" className="button button-outline ws-add" disabled={stages.length >= 14} onClick={add}><Plus size={14} />Adicionar etapa</button>
        {(allowHandoff || hasHandoff) && <label className="ws-check"><input type="checkbox" checked={hasHandoff} onChange={toggleHandoff} />Etapa de caso técnico (a gerência da agência assume)</label>}
      </div>
    </div>
  );
}

function ProductEditor({ product, canDelete, isCompany, onSaved, onDeleted }: { product: Product; canDelete: boolean; isCompany: boolean; onSaved: () => Promise<void>; onDeleted: () => Promise<void> }) {
  const dialog = useAppDialog();
  const save = trpc.workspace.saveProduct.useMutation();
  const remove = trpc.workspace.deleteProduct.useMutation();
  const [name, setName] = useState(product.name);
  const [color, setColor] = useState(product.color ?? "#13315c");
  const [config, setConfig] = useState<ProductConfig>(product.config);
  const [itemsText, setItemsText] = useState(product.config.items.join("\n"));
  useEffect(() => { setName(product.name); setColor(product.color ?? "#13315c"); setConfig(product.config); setItemsText(product.config.items.join("\n")); }, [product]);

  const draft: ProductConfig = { ...config, items: Array.from(new Set(itemsText.split("\n").map((item) => item.trim()).filter(Boolean))).slice(0, 60) };
  const problem = productConfigProblem(draft);
  const dirty = name !== product.name || color !== (product.color ?? "#13315c") || JSON.stringify(draft) !== JSON.stringify(product.config);
  const set = <K extends keyof ProductConfig>(key: K, value: ProductConfig[K]) => setConfig((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    if (problem) { toast.error(problem); return; }
    try {
      await save.mutateAsync({ id: product.id, name: name.trim(), color, config: draft });
      await onSaved();
      toast.success("Pipeline salvo. Todos que vendem este produto já veem as mudanças.");
    } catch (error) { toast.error(errorText(error, "Não foi possível salvar.")); }
  };
  const restore = async () => {
    const template = templateByKey(product.template);
    if (!(await dialog.confirm({ title: `Voltar ao modelo "${template.name}"?`, description: "Etapas, campos, motivos e catálogo voltam ao padrão do modelo. Nada é salvo até você clicar em Salvar." }))) return;
    setConfig(structuredClone(template.config)); setItemsText(template.config.items.join("\n"));
  };
  const destroy = async () => {
    if (!(await dialog.confirm({ title: `Excluir o produto ${product.name}?`, description: "Só é possível excluir produtos sem atendimentos e sem agências.", confirmLabel: "Excluir", danger: true }))) return;
    try { await remove.mutateAsync({ id: product.id }); await onDeleted(); toast.success("Produto excluído."); }
    catch (error) { toast.error(errorText(error, "Não foi possível excluir.")); }
  };

  const reasons = config.reasons;
  return (
    <div className="ws-editor">
      <div className="ws-editor-head">
        <label className="field"><span>Nome do produto</span><input maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="field ws-color"><span>Cor</span><input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
        <label className="field"><span>Como chamar o item vendido</span><input maxLength={40} value={config.itemLabel} onChange={(event) => set("itemLabel", event.target.value)} placeholder="Produto vendido" /></label>
      </div>
      <div className="ws-preview" aria-label="Prévia do pipeline">{draft.stages.map((stage) => <span key={stage.key} className={`ws-preview-stage ws-kind-${stage.kind}`}><i className={`stage-dot stage-${stage.color}`} />{stage.label || "—"}</span>)}</div>

      <h3 className="ws-section"><Workflow size={15} />Etapas do pipeline</h3>
      <p className="team-hint">A primeira etapa recebe os atendimentos novos. Etapas de "Fechou" marcam a venda; "Não fechou" pede o motivo. Etapas com atendimentos não podem ser excluídas.</p>
      <StageListEditor stages={config.stages} onChange={(stages) => set("stages", stages)} allowHandoff={isCompany} />

      <h3 className="ws-section"><LayoutList size={15} />Campos do atendimento</h3>
      <p className="team-hint">Informações que a equipe preenche em cada atendimento deste produto. Marque "No cartão" para mostrar no pipeline.</p>
      <FieldListEditor fields={config.fields} onChange={(fields) => set("fields", fields)} cardOption />

      <h3 className="ws-section"><MessageSquareText size={15} />Motivos de não fechar</h3>
      <p className="team-hint">Marque "Retornar" nos motivos de quem ficou indeciso: ele entra em "Deve retornar de novo".</p>
      <div className="ws-list">
        {reasons.map((reason, index) => (
          <div className="ws-row ws-row-reason" key={reason.key}>
            <input aria-label="Motivo" maxLength={60} value={reason.label} onChange={(event) => set("reasons", reasons.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)))} />
            <label className="ws-check"><input type="checkbox" checked={Boolean(reason.callback)} onChange={(event) => set("reasons", reasons.map((item, i) => (i === index ? { ...item, callback: event.target.checked } : item)))} />Retornar</label>
            <span className="icon-actions">
              <button type="button" title="Subir" aria-label="Subir" onClick={() => set("reasons", move(reasons, index, -1))}><ArrowUp size={13} /></button>
              <button type="button" title="Descer" aria-label="Descer" onClick={() => set("reasons", move(reasons, index, 1))}><ArrowDown size={13} /></button>
              <button type="button" className="danger" title="Excluir" aria-label={`Excluir ${reason.label}`} onClick={() => set("reasons", reasons.filter((_, i) => i !== index))}><Trash2 size={13} /></button>
            </span>
          </div>
        ))}
        <button type="button" className="button button-outline ws-add" disabled={reasons.length >= 25} onClick={() => set("reasons", [...reasons, { key: makeKey("Novo motivo", reasons.map((item) => item.key)), label: "Novo motivo" }])}><Plus size={14} />Adicionar motivo</button>
      </div>

      <h3 className="ws-section"><ListChecks size={15} />Catálogo do que é vendido</h3>
      <p className="team-hint">Um item por linha. Aparece como sugestão no campo "{config.itemLabel || "Produto vendido"}" (a equipe também pode digitar outro).</p>
      <textarea className="ws-items" rows={4} value={itemsText} onChange={(event) => setItemsText(event.target.value)} placeholder={"Ex.:\nPlano básico\nPlano completo"} />

      {problem && <div className="form-error">{problem}</div>}
      <div className="ws-editor-actions">
        {canDelete && <button type="button" className="button button-ghost danger-text" onClick={() => void destroy()}><Trash2 size={14} />Excluir produto</button>}
        <button type="button" className="button button-ghost" onClick={() => void restore()}><RotateCcw size={14} />Voltar ao modelo</button>
        <button type="button" className="button button-primary" disabled={!dirty || save.isPending || Boolean(problem)} onClick={() => void submit()}><Save size={14} />{save.isPending ? "Salvando…" : "Salvar pipeline"}</button>
      </div>
    </div>
  );
}

/** Produtos e pipelines: what the company (or the independent person) sells, each with its own pipeline. */
export function ProductsSettings({ data, agencies }: { data: WorkspaceData; agencies: { id: number; name: string }[] }) {
  const utils = trpc.useUtils();
  const create = trpc.workspace.createProduct.useMutation();
  const products = data.products.filter((product) => product.inWorkspace);
  const [selectedId, setSelectedId] = useState<number | null>(products[0]?.id ?? null);
  const [adding, setAdding] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: "", template: data.templates[0]?.key ?? "generico" });
  const selected = products.find((product) => product.id === selectedId) ?? products[0] ?? null;
  const refresh = async () => { await Promise.all([utils.workspace.get.invalidate(), utils.clients.list.invalidate(), utils.organization.me.invalidate()]); };

  const add = async () => {
    try {
      const { id } = await create.mutateAsync({ name: newProduct.name.trim(), template: newProduct.template });
      await refresh();
      setSelectedId(id); setAdding(false); setNewProduct({ name: "", template: data.templates[0]?.key ?? "generico" });
      toast.success(data.scope === "company" ? "Produto criado. Escolha as agências que vão vendê-lo em Minha empresa." : "Produto criado.");
    } catch (error) { toast.error(errorText(error, "Não foi possível criar o produto.")); }
  };

  return (
    <article className="panel team-panel">
      <div className="team-panel-heading"><span className="team-icon"><Boxes size={18} /></span><div><h2>Produtos e pipelines</h2><p>{data.scope === "company" ? "Cadastre o que a empresa vende. Cada agência vende um produto e trabalha com o pipeline dele (escolha em Minha empresa)." : "Escolha o tipo de pipeline com que você trabalha e ajuste tudo do seu jeito."}</p></div>
        {data.canEdit && <span className="team-company-actions"><button type="button" className="button button-outline" onClick={() => setAdding((current) => !current)}><Plus size={14} />Novo produto</button></span>}</div>
      {adding && (
        <div className="ws-new-product">
          <label className="field"><span>Nome do produto</span><input maxLength={80} value={newProduct.name} onChange={(event) => setNewProduct((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Consórcio, Planos de saúde, Apartamentos" /></label>
          <span className="customize-label">Comece de um modelo</span>
          <div className="template-grid">{data.templates.map((template) => (
            <button type="button" key={template.key} className={`template-card ${newProduct.template === template.key ? "active" : ""}`} onClick={() => setNewProduct((current) => ({ ...current, template: template.key, name: current.name || template.name }))}>
              <i style={{ background: template.color }} /><strong>{template.name}</strong><small>{template.description}</small>
            </button>
          ))}</div>
          <div className="ws-editor-actions"><button type="button" className="button button-ghost" onClick={() => setAdding(false)}>Cancelar</button><button type="button" className="button button-primary" disabled={newProduct.name.trim().length < 2 || create.isPending} onClick={() => void add()}><Plus size={14} />Criar produto</button></div>
        </div>
      )}
      <div className="ws-products">
        <div className="ws-product-tabs" role="tablist">{products.map((product) => {
          const sellers = agencies.filter((agency) => product.agencyIds.includes(agency.id)).map((agency) => agency.name);
          return (
            <button type="button" role="tab" aria-selected={selected?.id === product.id} key={product.id} className={`ws-product-tab ${selected?.id === product.id ? "active" : ""}`} onClick={() => setSelectedId(product.id)}>
              <i style={{ background: product.color ?? "#13315c" }} /><span><strong>{product.name}</strong><small>{data.scope === "company" ? (sellers.length ? sellers.join(", ") : "Nenhuma agência") : `${product.config.stages.length} etapas`}</small></span>
            </button>
          );
        })}</div>
        {selected && (data.canEdit
          ? <ProductEditor key={selected.id} product={selected} canDelete={products.length > 1} isCompany={data.scope === "company"} onSaved={refresh} onDeleted={async () => { setSelectedId(null); await refresh(); }} />
          : <div className="ws-preview">{selected.config.stages.map((stage) => <span key={stage.key} className="ws-preview-stage"><i className={`stage-dot stage-${stage.color}`} />{stage.label}</span>)}</div>)}
      </div>
    </article>
  );
}

/** Vocabulário, cadastro de clientes e lembretes. */
export function PrefsSettings({ prefs }: { prefs: WorkspacePrefs }) {
  const utils = trpc.useUtils();
  const save = trpc.workspace.savePrefs.useMutation();
  const [draft, setDraft] = useState<WorkspacePrefs>(prefs);
  useEffect(() => { setDraft(prefs); }, [prefs]);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(prefs), [draft, prefs]);

  const submit = async () => {
    try {
      await save.mutateAsync({ ...draft, terms: Object.fromEntries(Object.entries(draft.terms).map(([key, value]) => [key, (value ?? "").trim()])) });
      await utils.workspace.get.invalidate();
      toast.success("Preferências salvas.");
    } catch (error) { toast.error(errorText(error, "Não foi possível salvar.")); }
  };

  return (
    <article className="panel team-panel">
      <div className="team-panel-heading"><span className="team-icon"><Settings2 size={18} /></span><div><h2>Vocabulário, cadastro e lembretes</h2><p>Use as palavras do seu negócio (ex.: "Paciente", "Aluno", "Oportunidade", "Matrícula") e escolha o que o cadastro de clientes pede.</p></div>
        <span className="team-company-actions"><button type="button" className="button button-ghost" onClick={() => setDraft((current) => ({ ...current, terms: {}, dealFeminine: false, customerFeminine: false }))}><RotateCcw size={14} />Palavras padrão</button><button type="button" className="button button-primary" disabled={!dirty || save.isPending} onClick={() => void submit()}><Save size={14} />{save.isPending ? "Salvando…" : "Salvar"}</button></span></div>
      <div className="label-list ws-terms">{TERM_KEYS.map((key) => (
        <label className="field" key={key}><span>{TERM_LABELS[key]}</span><input maxLength={30} value={draft.terms[key] ?? ""} placeholder={DEFAULT_TERMS[key]} onChange={(event) => setDraft((current) => ({ ...current, terms: { ...current.terms, [key]: event.target.value } }))} /></label>
      ))}</div>
      <div className="ws-checks">
        <label className="ws-check"><input type="checkbox" checked={draft.dealFeminine} onChange={(event) => setDraft((current) => ({ ...current, dealFeminine: event.target.checked }))} />A palavra do atendimento é feminina ("Nova oportunidade")</label>
        <label className="ws-check"><input type="checkbox" checked={draft.customerFeminine} onChange={(event) => setDraft((current) => ({ ...current, customerFeminine: event.target.checked }))} />A palavra do cliente é feminina ("Nova paciente")</label>
      </div>
      <div className="ws-editor-head">
        <label className="field"><span>Frase no menu lateral</span><input maxLength={40} value={draft.tagline} placeholder="PIPELINE DE VENDAS" onChange={(event) => setDraft((current) => ({ ...current, tagline: event.target.value }))} /></label>
        <label className="field"><span>Lembrete de ligar após (dias sem retorno marcado)</span><input type="number" min={0} max={60} value={draft.reminderDays} onChange={(event) => setDraft((current) => ({ ...current, reminderDays: Math.max(0, Math.min(60, Number(event.target.value) || 0)) }))} /><small className="team-hint">0 desliga o lembrete.</small></label>
        <label className="ws-check ws-check-inline"><input type="checkbox" checked={draft.showGoals} onChange={(event) => setDraft((current) => ({ ...current, showGoals: event.target.checked }))} />Mostrar metas mensais na visão geral</label>
      </div>
      <h3 className="ws-section"><LayoutList size={15} />Campos extras do cadastro de clientes</h3>
      <p className="team-hint">Nome, endereço, telefone, e-mail, documento e nascimento já fazem parte do cadastro. Acrescente o que mais precisar (ex.: renda, profissão, convênio).</p>
      <FieldListEditor fields={draft.customerFields} onChange={(customerFields) => setDraft((current) => ({ ...current, customerFields }))} cardOption={false} />
    </article>
  );
}

export function WorkspaceSettingsLoading() {
  return <div className="loading-table"><LoaderCircle className="spin" size={20} />Carregando…</div>;
}
