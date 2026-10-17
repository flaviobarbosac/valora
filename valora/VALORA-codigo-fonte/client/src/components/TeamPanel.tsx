import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import {
  Building2, Check, Copy, LoaderCircle, LogOut, Mail, MailCheck, Pencil, Plus, RefreshCw, Trash2,
  UserPlus, UserRound, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { COMPANY_ROLE_LABELS, COMPANY_ROLE_SCOPE, INVITE_VALID_DAYS, type CompanyRoleKey } from "@shared/const";
import { useAppDialog } from "@/components/AppDialogs";
import { trpc } from "@/lib/trpc";
import { roleLabel } from "@/lib/branding";
import type { AppRouter } from "../../../server/routers";

type OrgData = inferRouterOutputs<AppRouter>["organization"]["me"];
type Agency = { id: number; name: string };
type Team = { id: number; name: string; agencyId: number };
type Placement = { role: CompanyRoleKey; agencyId: number | null; teamId: number | null };

const ROLES = Object.keys(COMPANY_ROLE_LABELS) as CompanyRoleKey[];
const errorMessage = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;

function encodePlacement(placement: Pick<Placement, "agencyId" | "teamId">) {
  if (placement.teamId) return `t:${placement.teamId}`;
  if (placement.agencyId) return `a:${placement.agencyId}`;
  return "none";
}

function decodePlacement(value: string, teams: Team[]): Pick<Placement, "agencyId" | "teamId"> {
  const [kind, raw] = value.split(":");
  const id = Number(raw);
  if (kind === "t") return { teamId: id, agencyId: teams.find((team) => team.id === id)?.agencyId ?? null };
  if (kind === "a") return { agencyId: id, teamId: null };
  return { agencyId: null, teamId: null };
}

/** First valid placement for a role, so switching roles never leaves an impossible combination. */
function defaultPlacementFor(role: CompanyRoleKey, current: Pick<Placement, "agencyId" | "teamId">, agencies: Agency[], teams: Team[]) {
  if (role === "admin") return { agencyId: null, teamId: null };
  if (role === "manager") return { agencyId: current.agencyId ?? agencies[0]?.id ?? null, teamId: null };
  if (role === "leader") {
    const team = teams.find((item) => item.id === current.teamId) ?? teams.find((item) => item.agencyId === current.agencyId) ?? teams[0];
    return { agencyId: team?.agencyId ?? null, teamId: team?.id ?? null };
  }
  return current;
}

function PlacementSelect({ role, value, onChange, agencies, teams, label }: {
  role: CompanyRoleKey; value: string; onChange: (value: string) => void; agencies: Agency[]; teams: Team[]; label: string;
}) {
  if (role === "admin") return <select aria-label={label} disabled value="none"><option value="none">Empresa toda</option></select>;
  return (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      {role === "member" && <option value="none">Sem equipe</option>}
      {role === "leader" && !teams.length && <option value="none">Crie uma equipe primeiro</option>}
      {role === "manager" && !agencies.length && <option value="none">Crie uma agência primeiro</option>}
      {agencies.map((agency) => {
        const agencyTeams = teams.filter((team) => team.agencyId === agency.id);
        return (
          <optgroup key={agency.id} label={agency.name}>
            {role !== "leader" && <option value={`a:${agency.id}`}>{role === "manager" ? agency.name : `${agency.name} (sem equipe)`}</option>}
            {role !== "manager" && agencyTeams.map((team) => <option key={team.id} value={`t:${team.id}`}>{team.name}</option>)}
          </optgroup>
        );
      })}
    </select>
  );
}

function placementText(placement: Pick<Placement, "role" | "agencyId" | "teamId">, agencies: Agency[], teams: Team[]) {
  if (placement.role === "admin") return "Empresa toda";
  const team = teams.find((item) => item.id === placement.teamId);
  const agency = agencies.find((item) => item.id === (team?.agencyId ?? placement.agencyId));
  if (team) return `${agency?.name ?? "Agência"} › ${team.name}`;
  if (agency) return agency.name;
  return "Sem equipe";
}

function IndependentCard() {
  const utils = trpc.useUtils();
  const create = trpc.organization.createCompany.useMutation();
  const [name, setName] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await create.mutateAsync({ name });
      await utils.organization.me.invalidate();
      await utils.clients.list.invalidate();
      toast.success("Empresa criada. Agora cadastre agências, equipes e convide as pessoas.");
    } catch (error) {
      toast.error(errorMessage(error, "Não foi possível criar a empresa."));
    }
  };
  return (
    <div className="team-grid">
      <article className="panel team-panel">
        <div className="team-panel-heading"><span className="team-icon"><UserRound size={18} /></span><div><h2>Você trabalha de forma independente</h2><p>Seus atendimentos são só seus e ninguém mais os vê.</p></div></div>
        <ul className="team-bullets">
          <li>Para entrar na equipe de alguém, peça um convite ao administrador da empresa. O link chega no seu e-mail.</li>
          <li>Se você é quem organiza o time, crie a empresa ao lado. Você vira o administrador e pode convidar gerentes, líderes e usuários.</li>
        </ul>
      </article>
      <article className="panel team-panel">
        <div className="team-panel-heading"><span className="team-icon"><Building2 size={18} /></span><div><h2>Criar uma empresa</h2><p>Organize agências e equipes e convide pessoas por e-mail.</p></div></div>
        <form className="team-inline-form" onSubmit={(event) => void submit(event)}>
          <label className="field"><span>Nome da empresa</span><input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Banco Exemplo — Regional Sul" /></label>
          <button type="submit" className="button button-primary" disabled={create.isPending || name.trim().length < 2}>{create.isPending ? "Criando…" : <><Plus size={15} />Criar empresa</>}</button>
        </form>
      </article>
    </div>
  );
}

function StructureSection({ agencies, teams, members }: { agencies: Agency[]; teams: Team[]; members: { agencyId: number | null; teamId: number | null }[] }) {
  const utils = trpc.useUtils();
  const refresh = () => utils.organization.me.invalidate();
  const createAgency = trpc.organization.createAgency.useMutation();
  const createTeam = trpc.organization.createTeam.useMutation();
  const renameAgency = trpc.organization.renameAgency.useMutation();
  const renameTeam = trpc.organization.renameTeam.useMutation();
  const deleteAgency = trpc.organization.deleteAgency.useMutation();
  const deleteTeam = trpc.organization.deleteTeam.useMutation();
  const [agencyName, setAgencyName] = useState("");
  const [teamDrafts, setTeamDrafts] = useState<Record<number, string>>({});
  const dialog = useAppDialog();

  const run = async (action: () => Promise<unknown>, success: string, failure: string) => {
    try { await action(); await refresh(); toast.success(success); return true; } catch (error) { toast.error(errorMessage(error, failure)); return false; }
  };
  const rename = async (kind: "agência" | "equipe", current: string, save: (name: string) => Promise<unknown>) => {
    const next = await dialog.askText({ title: `Renomear ${kind}`, label: `Nome da ${kind}`, initialValue: current, minLength: 2, confirmLabel: "Salvar nome" });
    if (next && next !== current) await run(() => save(next), "Nome atualizado.", "Não foi possível renomear.");
  };
  const remove = async (kind: "agência" | "equipe", name: string, action: () => Promise<unknown>) => {
    const ok = await dialog.confirm({ title: `Excluir a ${kind} ${name}?`, description: kind === "agência" ? "Só dá para excluir agências sem equipes e sem pessoas." : "Só dá para excluir equipes sem pessoas.", confirmLabel: "Excluir", danger: true });
    if (ok) await run(action, kind === "agência" ? "Agência excluída." : "Equipe excluída.", `Não foi possível excluir a ${kind}.`);
  };

  return (
    <article className="panel team-panel">
      <div className="team-panel-heading"><span className="team-icon"><Building2 size={18} /></span><div><h2>Agências e equipes</h2><p>Cada agência tem um gerente; cada equipe, um líder de grupo.</p></div></div>
      <form className="team-inline-form" onSubmit={(event) => { event.preventDefault(); void run(() => createAgency.mutateAsync({ name: agencyName }), "Agência criada.", "Não foi possível criar a agência.").then((ok) => ok && setAgencyName("")); }}>
        <label className="field"><span>Nova agência</span><input value={agencyName} maxLength={120} onChange={(event) => setAgencyName(event.target.value)} placeholder="Ex.: Agência Centro" /></label>
        <button type="submit" className="button button-outline" disabled={agencyName.trim().length < 2 || createAgency.isPending}><Plus size={15} />Adicionar</button>
      </form>
      {!agencies.length && <p className="team-empty">Nenhuma agência ainda. Crie a primeira para montar as equipes.</p>}
      <div className="agency-list">
        {agencies.map((agency) => {
          const agencyTeams = teams.filter((team) => team.agencyId === agency.id);
          const people = members.filter((member) => member.agencyId === agency.id).length;
          return (
            <section className="agency-card" key={agency.id}>
              <header>
                <strong>{agency.name}</strong><small>{agencyTeams.length} {agencyTeams.length === 1 ? "equipe" : "equipes"} · {people} {people === 1 ? "pessoa" : "pessoas"}</small>
                <span className="icon-actions">
                  <button type="button" title="Renomear agência" aria-label={`Renomear ${agency.name}`} onClick={() => void rename("agência", agency.name, (name) => renameAgency.mutateAsync({ id: agency.id, name }))}><Pencil size={14} /></button>
                  <button type="button" className="danger" title="Excluir agência" aria-label={`Excluir ${agency.name}`} onClick={() => void remove("agência", agency.name, () => deleteAgency.mutateAsync({ id: agency.id }))}><Trash2 size={14} /></button>
                </span>
              </header>
              <ul className="team-chips">
                {agencyTeams.map((team) => {
                  const teamPeople = members.filter((member) => member.teamId === team.id).length;
                  return (
                    <li key={team.id}>
                      <Users size={13} /><span>{team.name}</span><small>{teamPeople}</small>
                      <button type="button" title="Renomear equipe" aria-label={`Renomear ${team.name}`} onClick={() => void rename("equipe", team.name, (name) => renameTeam.mutateAsync({ id: team.id, name }))}><Pencil size={12} /></button>
                      <button type="button" className="danger" title="Excluir equipe" aria-label={`Excluir ${team.name}`} onClick={() => void remove("equipe", team.name, () => deleteTeam.mutateAsync({ id: team.id }))}><X size={12} /></button>
                    </li>
                  );
                })}
              </ul>
              <form className="team-chip-form" onSubmit={(event) => {
                event.preventDefault();
                const name = teamDrafts[agency.id] ?? "";
                void run(() => createTeam.mutateAsync({ agencyId: agency.id, name }), "Equipe criada.", "Não foi possível criar a equipe.")
                  .then((ok) => ok && setTeamDrafts((current) => ({ ...current, [agency.id]: "" })));
              }}>
                <input aria-label={`Nova equipe em ${agency.name}`} value={teamDrafts[agency.id] ?? ""} maxLength={120} onChange={(event) => setTeamDrafts((current) => ({ ...current, [agency.id]: event.target.value }))} placeholder="Nova equipe…" />
                <button type="submit" disabled={(teamDrafts[agency.id] ?? "").trim().length < 2 || createTeam.isPending}><Plus size={13} />Equipe</button>
              </form>
            </section>
          );
        })}
      </div>
    </article>
  );
}

type Member = NonNullable<Extract<OrgData, { members: unknown }>["members"]>[number];

function MemberRow({ member, isAdmin, isMe, agencies, teams, positions }: { member: Member; isAdmin: boolean; isMe: boolean; agencies: Agency[]; teams: Team[]; positions: { id: number; name: string; level: CompanyRoleKey }[] }) {
  const utils = trpc.useUtils();
  const setPosition = trpc.features.setMemberPosition.useMutation();
  const changePosition = async (value: string) => {
    try {
      await setPosition.mutateAsync({ openId: member.openId, positionId: value ? Number(value) : null });
      await Promise.all([utils.organization.me.invalidate(), utils.features.branding.invalidate()]);
      toast.success(`${member.name}: cargo atualizado.`);
    } catch (error) {
      toast.error(errorMessage(error, "Não foi possível mudar o cargo."));
    }
  };
  const update = trpc.organization.updateMember.useMutation();
  const remove = trpc.organization.removeMember.useMutation();
  const dialog = useAppDialog();
  const [draft, setDraft] = useState<Placement>({ role: member.role, agencyId: member.agencyId, teamId: member.teamId });
  useEffect(() => setDraft({ role: member.role, agencyId: member.agencyId, teamId: member.teamId }), [member.role, member.agencyId, member.teamId]);
  const dirty = draft.role !== member.role || encodePlacement(draft) !== encodePlacement(member);

  const save = async () => {
    try {
      await update.mutateAsync({ openId: member.openId, ...draft });
      await utils.organization.me.invalidate();
      await utils.clients.list.invalidate();
      toast.success(`${member.name}: perfil atualizado.`);
    } catch (error) {
      toast.error(errorMessage(error, "Não foi possível atualizar."));
    }
  };
  const removeMember = async () => {
    if (!(await dialog.confirm({ title: `Remover ${member.name} da empresa?`, description: "A conta e os atendimentos dessa pessoa continuam existindo, mas ela passa a trabalhar sozinha.", confirmLabel: "Remover", danger: true }))) return;
    try {
      await remove.mutateAsync({ openId: member.openId });
      await utils.organization.me.invalidate();
      toast.success(`${member.name} foi removido da empresa.`);
    } catch (error) {
      toast.error(errorMessage(error, "Não foi possível remover."));
    }
  };

  return (
    <tr>
      <td><div className="member-name"><span className="client-avatar">{member.name.charAt(0).toUpperCase()}</span><span><strong>{member.name}{isMe && <em> (você)</em>}</strong>{isAdmin && <small>{member.email || "sem e-mail"}</small>}</span></div></td>
      <td>{isAdmin ? (
        <select aria-label={`Perfil de ${member.name}`} value={draft.role} onChange={(event) => {
          const role = event.target.value as CompanyRoleKey;
          setDraft((current) => ({ role, ...defaultPlacementFor(role, current, agencies, teams) }));
        }}>{ROLES.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select>
      ) : <span className={`role-badge role-${member.role}`}>{roleLabel(member.role)}</span>}</td>
      <td>{isAdmin
        ? <PlacementSelect label={`Lotação de ${member.name}`} role={draft.role} value={encodePlacement(draft)} onChange={(value) => setDraft((current) => ({ ...current, ...decodePlacement(value, teams) }))} agencies={agencies} teams={teams} />
        : <span className="muted-cell">{placementText(member, agencies, teams)}</span>}</td>
      {isAdmin && <td><select aria-label={`Cargo de ${member.name}`} value={member.positionId ?? ""} disabled={setPosition.isPending} onChange={(event) => void changePosition(event.target.value)}><option value="">Sem cargo</option>{positions.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}</select></td>}
      {isAdmin && <td><div className="row-actions">
        {dirty && <button type="button" className="save-action" title="Salvar alterações" aria-label={`Salvar ${member.name}`} disabled={update.isPending} onClick={() => void save()}><Check size={16} /></button>}
        {dirty && <button type="button" title="Desfazer" aria-label="Desfazer alterações" onClick={() => setDraft({ role: member.role, agencyId: member.agencyId, teamId: member.teamId })}><RefreshCw size={14} /></button>}
        {!isMe && <button type="button" className="delete-action" title="Remover da empresa" aria-label={`Remover ${member.name}`} onClick={() => void removeMember()}><X size={16} /></button>}
      </div></td>}
    </tr>
  );
}

function InviteSection({ agencies, teams, mailConfigured, invitations }: {
  agencies: Agency[]; teams: Team[]; mailConfigured: boolean;
  invitations: { id: number; email: string; role: CompanyRoleKey; agencyId: number | null; teamId: number | null; expiresAt: string | Date }[];
}) {
  const utils = trpc.useUtils();
  const invite = trpc.organization.invite.useMutation();
  const resend = trpc.organization.resendInvite.useMutation();
  const revoke = trpc.organization.revokeInvite.useMutation();
  const dialog = useAppDialog();
  const [email, setEmail] = useState("");
  const [placement, setPlacement] = useState<Placement>({ role: "member", agencyId: null, teamId: null });
  const [result, setResult] = useState<{ email: string; link: string; emailSent: boolean } | null>(null);

  const copy = async (link: string) => {
    try { await navigator.clipboard.writeText(link); toast.success("Link copiado."); } catch { toast.info("Não deu para copiar automaticamente. Selecione o link no campo e copie com Ctrl+C."); }
  };
  const showResult = (address: string, response: { link: string; emailSent: boolean }) => {
    setResult({ email: address, ...response });
    toast[response.emailSent ? "success" : "info"](response.emailSent ? `Convite enviado para ${address}.` : "Convite criado. Copie o link e envie para a pessoa.");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const response = await invite.mutateAsync({ email, ...placement });
      await utils.organization.me.invalidate();
      showResult(email.trim().toLowerCase(), response);
      setEmail("");
    } catch (error) {
      toast.error(errorMessage(error, "Não foi possível criar o convite."));
    }
  };

  return (
    <article className="panel team-panel">
      <div className="team-panel-heading"><span className="team-icon"><UserPlus size={18} /></span><div><h2>Convidar pessoas</h2><p>O convite vale por {INVITE_VALID_DAYS} dias e só pode ser aceito pelo e-mail convidado.</p></div></div>
      {!mailConfigured && <div className="team-note"><Mail size={15} /><span>O envio de e-mail ainda não está configurado (SMTP no arquivo <code>.env</code>). Os convites funcionam do mesmo jeito: copie o link e mande por WhatsApp ou pelo seu e-mail.</span></div>}
      <form className="invite-form" onSubmit={(event) => void submit(event)}>
        <label className="field invite-email"><span>E-mail</span><input type="email" required value={email} maxLength={320} onChange={(event) => setEmail(event.target.value)} placeholder="pessoa@empresa.com.br" /></label>
        <label className="field"><span>Perfil</span><select value={placement.role} onChange={(event) => {
          const role = event.target.value as CompanyRoleKey;
          setPlacement((current) => ({ role, ...defaultPlacementFor(role, current, agencies, teams) }));
        }}>{ROLES.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></label>
        <label className="field"><span>Lotação</span><PlacementSelect label="Lotação do convidado" role={placement.role} value={encodePlacement(placement)} onChange={(value) => setPlacement((current) => ({ ...current, ...decodePlacement(value, teams) }))} agencies={agencies} teams={teams} /></label>
        <button type="submit" className="button button-primary" disabled={invite.isPending || !email.trim()}>{invite.isPending ? <><LoaderCircle className="spin" size={15} />Criando…</> : <><MailCheck size={15} />{mailConfigured ? "Enviar convite" : "Criar convite"}</>}</button>
      </form>
      <p className="team-hint">{COMPANY_ROLE_SCOPE[placement.role]}</p>

      {result && (
        <div className="invite-result">
          <div><strong>{result.emailSent ? `E-mail enviado para ${result.email}` : `Link do convite para ${result.email}`}</strong>
            <small>{result.emailSent ? "Se a pessoa não encontrar, peça para olhar no spam ou envie o link abaixo." : "Envie este link para a pessoa. Ele não será mostrado de novo."}</small></div>
          <div className="invite-link-row"><input readOnly value={result.link} onFocus={(event) => event.target.select()} aria-label="Link do convite" /><button type="button" className="button button-outline" onClick={() => void copy(result.link)}><Copy size={14} />Copiar</button></div>
        </div>
      )}

      {invitations.length > 0 && (
        <div className="pending-invites">
          <h3>Convites pendentes</h3>
          <ul>
            {invitations.map((item) => (
              <li key={item.id}>
                <span><strong>{item.email}</strong><small>{roleLabel(item.role)} · {placementText(item, agencies, teams)} · vence em {new Date(item.expiresAt).toLocaleDateString("pt-BR")}</small></span>
                <span className="icon-actions">
                  <button type="button" title="Gerar novo link e reenviar" aria-label={`Reenviar convite para ${item.email}`} disabled={resend.isPending} onClick={async () => {
                    try { const response = await resend.mutateAsync({ id: item.id }); await utils.organization.me.invalidate(); showResult(item.email, response); } catch (error) { toast.error(errorMessage(error, "Não foi possível reenviar.")); }
                  }}><RefreshCw size={14} /></button>
                  <button type="button" className="danger" title="Cancelar convite" aria-label={`Cancelar convite para ${item.email}`} onClick={async () => {
                    if (!(await dialog.confirm({ title: `Cancelar o convite de ${item.email}?`, description: "O link enviado deixa de funcionar.", confirmLabel: "Cancelar convite", danger: true }))) return;
                    try { await revoke.mutateAsync({ id: item.id }); await utils.organization.me.invalidate(); toast.success("Convite cancelado."); } catch (error) { toast.error(errorMessage(error, "Não foi possível cancelar.")); }
                  }}><Trash2 size={14} /></button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

export default function TeamPanel({ myOpenId }: { myOpenId?: string }) {
  const utils = trpc.useUtils();
  const query = trpc.organization.me.useQuery(undefined, { retry: false });
  const rename = trpc.organization.renameCompany.useMutation();
  const leave = trpc.organization.leave.useMutation();
  const branding = trpc.features.branding.useQuery(undefined, { retry: false });
  const dialog = useAppDialog();
  const data = query.data;
  const members = useMemo(() => (data && "members" in data && data.members ? data.members : []), [data]);

  if (query.isLoading) return <div className="loading-table"><LoaderCircle className="spin" size={20} />Carregando sua empresa…</div>;
  if (query.isError) return <div className="notice notice-error"><span>Não foi possível carregar os dados da empresa.</span><button onClick={() => void query.refetch()}>Tentar novamente</button></div>;
  if (!data || !data.membership || !("company" in data) || !data.company) return <IndependentCard />;

  const { membership, company, agencies, teams, invitations, mailConfigured } = data;
  const isAdmin = membership.role === "admin";
  const me = members.find((member) => member.openId === myOpenId);

  const leaveCompany = async () => {
    const onlyAdminAlone = isAdmin && members.length === 1;
    const message = onlyAdminAlone
      ? `Você é a única pessoa em ${company.name}. Sair vai excluir a empresa, as agências e as equipes. Seus atendimentos continuam com você. Continuar?`
      : `Sair de ${company.name}? Você passa a trabalhar sozinho e deixa de ver os atendimentos da equipe.`;
    if (!(await dialog.confirm({ title: `Sair de ${company.name}?`, description: message, confirmLabel: "Sair da empresa", danger: true }))) return;
    try {
      await leave.mutateAsync();
      await utils.organization.me.invalidate();
      await utils.clients.list.invalidate();
      toast.success("Você saiu da empresa.");
    } catch (error) {
      toast.error(errorMessage(error, "Não foi possível sair da empresa."));
    }
  };

  return (
    <div className="team-page">
      <article className="panel team-panel team-company">
        <div className="team-panel-heading">
          <span className="team-icon"><Building2 size={18} /></span>
          <div><h2>{company.name}</h2><p>Você é <b>{roleLabel(membership.role)}</b>{me && membership.role !== "admin" ? ` · ${placementText(me, agencies, teams)}` : ""}. {COMPANY_ROLE_SCOPE[membership.role]}</p></div>
          <span className="team-company-actions">
            {isAdmin && <button type="button" className="button button-outline" onClick={async () => {
              const name = await dialog.askText({ title: "Renomear empresa", label: "Nome da empresa", initialValue: company.name, minLength: 2, confirmLabel: "Salvar nome" });
              if (!name || name === company.name) return;
              try {
                await rename.mutateAsync({ name });
                await utils.organization.me.invalidate();
                toast.success("Nome atualizado.");
              } catch (error) {
                toast.error(errorMessage(error, "Não foi possível renomear."));
              }
            }}><Pencil size={14} />Renomear</button>}
            <button type="button" className="button button-ghost" onClick={() => void leaveCompany()} disabled={leave.isPending}><LogOut size={14} />Sair da empresa</button>
          </span>
        </div>
      </article>

      {isAdmin && <StructureSection agencies={agencies} teams={teams} members={members} />}

      <article className="panel team-panel">
        <div className="team-panel-heading"><span className="team-icon"><Users size={18} /></span><div><h2>{isAdmin ? "Pessoas da empresa" : "Sua equipe"}</h2><p>{isAdmin ? "Defina o perfil e a lotação de cada pessoa. A mudança vale na hora." : "Pessoas que trabalham com você."}</p></div><span className="soft-count">{members.length}</span></div>
        <div className="table-scroll"><table className="clients-table members-table">
          <thead><tr><th>Pessoa</th><th>Perfil</th><th>Agência / equipe</th>{isAdmin && <th>Cargo</th>}{isAdmin && <th><span className="sr-only">Ações</span></th>}</tr></thead>
          <tbody>{members.map((member) => <MemberRow key={member.openId} member={member} isAdmin={isAdmin} isMe={member.openId === myOpenId} agencies={agencies} teams={teams} positions={branding.data?.positions ?? []} />)}</tbody>
        </table></div>
      </article>

      {isAdmin && <InviteSection agencies={agencies} teams={teams} mailConfigured={mailConfigured} invitations={invitations} />}
    </div>
  );
}
