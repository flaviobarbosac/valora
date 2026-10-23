import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Briefcase, ImagePlus, LoaderCircle, Palette, Pencil, Plus, RotateCcw, Save, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { COMPANY_ROLE_LABELS, type CompanyRoleKey } from "@shared/const";
import { useAppDialog } from "@/components/AppDialogs";
import { PrefsSettings, ProductsSettings } from "@/components/WorkspaceSettings";
import { useWorkspace } from "@/lib/workspace";
import { COLOR_PRESETS, DEFAULT_COLORS, applyBrandColors, roleLabel } from "@/lib/branding";
import { trpc } from "@/lib/trpc";

const ROLES = Object.keys(COMPANY_ROLE_LABELS) as CompanyRoleKey[];
const MAX_LOGO = 300_000;

async function prepareLogo(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Use uma imagem JPG, PNG ou WebP.");
  if (file.size > 8 * 1024 * 1024) throw new Error("A imagem original deve ter até 8 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Não foi possível abrir a imagem.")); image.src = url; });
    const scale = Math.min(1, 360 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    // WebP keeps transparency and is small; PNG is the fallback.
    let data = canvas.toDataURL("image/webp", 0.9);
    if (!data.startsWith("data:image/webp")) data = canvas.toDataURL("image/png");
    if (data.length > MAX_LOGO * 1.35) throw new Error("A logo ficou grande demais. Use uma imagem mais simples.");
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** People who work on their own customize only their pipelines and wording. */
export function PersonalCustomizePanel() {
  const { data } = useWorkspace();
  if (!data) return <div className="loading-table"><LoaderCircle className="spin" size={20} />Carregando…</div>;
  return <div className="team-page"><ProductsSettings data={data} agencies={[]} /><PrefsSettings prefs={data.prefs} /></div>;
}

export default function CustomizePanel({ agencies }: { agencies: { id: number; name: string }[] }) {
  const workspace = useWorkspace();
  const utils = trpc.useUtils();
  const dialog = useAppDialog();
  const query = trpc.features.branding.useQuery(undefined, { retry: false });
  const save = trpc.features.saveBranding.useMutation();
  const createPosition = trpc.features.createPosition.useMutation();
  const updatePosition = trpc.features.updatePosition.useMutation();
  const deletePosition = trpc.features.deletePosition.useMutation();
  const data = query.data;

  const [displayName, setDisplayName] = useState("");
  const [colors, setColors] = useState({ primary: DEFAULT_COLORS.primary as string, dark: DEFAULT_COLORS.dark as string, accent: DEFAULT_COLORS.accent as string });
  const [logo, setLogo] = useState<string | null>(null);
  const [roleLabels, setRoleLabels] = useState<Record<string, string>>({});
  const [newPosition, setNewPosition] = useState({ name: "", level: "member" as CompanyRoleKey });

  useEffect(() => {
    if (!data) return;
    setDisplayName(data.displayName ?? "");
    setColors({ primary: data.primaryColor ?? DEFAULT_COLORS.primary, dark: data.darkColor ?? DEFAULT_COLORS.dark, accent: data.accentColor ?? DEFAULT_COLORS.accent });
    setLogo(data.logoDataUrl);
    setRoleLabels(data.roleLabels);
  }, [data]);

  // Live preview while choosing colors; the saved colors come back when leaving the page.
  useEffect(() => { applyBrandColors(colors); }, [colors]);
  const saved = useRef(data);
  saved.current = data;
  useEffect(() => () => {
    const current = saved.current;
    applyBrandColors(current ? { primary: current.primaryColor, dark: current.darkColor, accent: current.accentColor } : null);
  }, []);

  if (query.isLoading || !data) return <div className="loading-table"><LoaderCircle className="spin" size={20} />Carregando…</div>;

  const chooseLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try { setLogo(await prepareLogo(file)); } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível usar a imagem."); }
  };

  const submit = async () => {
    try {
      await save.mutateAsync({
        displayName: displayName.trim() || null,
        primaryColor: colors.primary, darkColor: colors.dark, accentColor: colors.accent,
        logoDataUrl: logo, roleLabels,
      });
      await utils.features.branding.invalidate();
      toast.success("Personalização salva. Todos da empresa já veem as mudanças.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    }
  };

  const reset = () => {
    setColors({ ...DEFAULT_COLORS }); setLogo(null); setDisplayName(""); setRoleLabels({});
    toast.info("Valores padrão carregados. Clique em Salvar para aplicar.");
  };

  const addPosition = async () => {
    try { await createPosition.mutateAsync(newPosition); setNewPosition({ name: "", level: "member" }); await utils.features.branding.invalidate(); toast.success("Cargo criado."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível criar o cargo."); }
  };
  const renamePosition = async (id: number, name: string, level: CompanyRoleKey) => {
    const next = await dialog.askText({ title: "Renomear cargo", label: "Nome do cargo", initialValue: name, minLength: 2, maxLength: 80 });
    if (!next || next === name) return;
    try { await updatePosition.mutateAsync({ id, name: next, level }); await utils.features.branding.invalidate(); toast.success("Cargo atualizado."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível atualizar."); }
  };
  const changeLevel = async (id: number, name: string, level: CompanyRoleKey) => {
    try { await updatePosition.mutateAsync({ id, name, level }); await utils.features.branding.invalidate(); toast.success("Nível de acesso do cargo atualizado. Vale para as próximas atribuições."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível atualizar."); }
  };
  const removePosition = async (id: number, name: string) => {
    if (!(await dialog.confirm({ title: `Excluir o cargo ${name}?`, description: "Só é possível excluir cargos que ninguém usa.", confirmLabel: "Excluir", danger: true }))) return;
    try { await deletePosition.mutateAsync({ id }); await utils.features.branding.invalidate(); toast.success("Cargo excluído."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível excluir."); }
  };

  return (
    <div className="team-page">
      <article className="panel team-panel">
        <div className="team-panel-heading"><span className="team-icon"><Palette size={18} /></span><div><h2>Identidade da empresa</h2><p>Deixe o VALORA com a cara da sua empresa. As mudanças valem para todas as pessoas da empresa.</p></div>
          <span className="team-company-actions"><button type="button" className="button button-ghost" onClick={reset}><RotateCcw size={14} />Padrão</button><button type="button" className="button button-primary" onClick={() => void submit()} disabled={save.isPending}><Save size={14} />{save.isPending ? "Salvando…" : "Salvar"}</button></span></div>
        <div className="customize-grid">
          <div className="customize-block">
            <label className="field"><span>Nome exibido no topo</span><input maxLength={120} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={data.companyName} /></label>
            <div className="logo-row">
              <div className="logo-preview">{logo ? <img src={logo} alt="Logo da empresa" /> : <span>Sem logo</span>}</div>
              <div className="profile-photo-actions">
                <strong>Logo</strong>
                <p>JPG, PNG ou WebP. Aparece no topo, no lugar da marca VALORA.</p>
                <label className="button button-outline profile-photo-button"><ImagePlus size={14} />Escolher logo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void chooseLogo(event)} /></label>
                {logo && <button type="button" className="profile-remove-photo" onClick={() => setLogo(null)}>Remover logo</button>}
              </div>
            </div>
          </div>
          <div className="customize-block">
            <span className="customize-label">Cores do app</span>
            <div className="color-presets">{COLOR_PRESETS.map((preset) => (
              <button type="button" key={preset.name} className={`color-preset ${preset.primary === colors.primary && preset.accent === colors.accent ? "active" : ""}`} onClick={() => setColors({ primary: preset.primary, dark: preset.dark, accent: preset.accent })} title={preset.name}>
                <i style={{ background: preset.dark }} /><i style={{ background: preset.primary }} /><i style={{ background: preset.accent }} /><span>{preset.name}</span>
              </button>
            ))}</div>
            <div className="color-inputs">
              <label><input type="color" value={colors.primary} onChange={(event) => setColors((current) => ({ ...current, primary: event.target.value }))} /><span>Principal (botões)</span></label>
              <label><input type="color" value={colors.dark} onChange={(event) => setColors((current) => ({ ...current, dark: event.target.value }))} /><span>Escura (menu lateral)</span></label>
              <label><input type="color" value={colors.accent} onChange={(event) => setColors((current) => ({ ...current, accent: event.target.value }))} /><span>Destaque</span></label>
            </div>
            <p className="team-hint">Você já está vendo a prévia. Salve para aplicar para todos.</p>
          </div>
        </div>
      </article>

      {workspace.data && <ProductsSettings data={workspace.data} agencies={agencies} />}
      {workspace.data && <PrefsSettings prefs={workspace.data.prefs} />}

      <div className="team-grid">
        <article className="panel team-panel">
          <div className="team-panel-heading"><span className="team-icon"><Tags size={18} /></span><div><h2>Nomes dos perfis</h2><p>Use os nomes da sua empresa. As permissões continuam as mesmas.</p></div></div>
          <div className="label-list">{ROLES.map((role) => (
            <label className="field" key={role}><span>{COMPANY_ROLE_LABELS[role]}</span><input maxLength={40} value={roleLabels[role] ?? ""} placeholder={COMPANY_ROLE_LABELS[role]} onChange={(event) => setRoleLabels((current) => ({ ...current, [role]: event.target.value }))} /></label>
          ))}</div>
        </article>
      </div>

      <article className="panel team-panel">
        <div className="team-panel-heading"><span className="team-icon"><Briefcase size={18} /></span><div><h2>Cargos</h2><p>Crie os cargos da sua empresa (ex.: Atendente, Consultor Sênior, Supervisor). Cada cargo tem um nível de acesso, que define o que a pessoa vê. As promoções usam estes cargos.</p></div></div>
        <div className="team-inline-form">
          <label className="field"><span>Novo cargo</span><input maxLength={80} value={newPosition.name} onChange={(event) => setNewPosition((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Consultor Sênior" /></label>
          <label className="field"><span>Nível de acesso</span><select value={newPosition.level} onChange={(event) => setNewPosition((current) => ({ ...current, level: event.target.value as CompanyRoleKey }))}>{ROLES.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></label>
          <button type="button" className="button button-outline" disabled={newPosition.name.trim().length < 2 || createPosition.isPending} onClick={() => void addPosition()}><Plus size={14} />Adicionar</button>
        </div>
        {data.positions.length === 0 ? <p className="team-empty">Nenhum cargo ainda.</p> : (
          <ul className="position-list">{data.positions.map((position) => (
            <li key={position.id}>
              <strong>{position.name}</strong>
              <select aria-label={`Nível de ${position.name}`} value={position.level} onChange={(event) => void changeLevel(position.id, position.name, event.target.value as CompanyRoleKey)}>{ROLES.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select>
              <span className="icon-actions">
                <button type="button" title="Renomear" aria-label={`Renomear ${position.name}`} onClick={() => void renamePosition(position.id, position.name, position.level)}><Pencil size={14} /></button>
                <button type="button" className="danger" title="Excluir" aria-label={`Excluir ${position.name}`} onClick={() => void removePosition(position.id, position.name)}><Trash2 size={14} /></button>
              </span>
            </li>
          ))}</ul>
        )}
      </article>
    </div>
  );
}
