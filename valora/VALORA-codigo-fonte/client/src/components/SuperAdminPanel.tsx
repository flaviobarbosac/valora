import { useMemo, useState } from "react";
import { Building2, Eye, LoaderCircle, Search, ShieldCheck, UserCheck, UserX, Users, X } from "lucide-react";
import { startViewAs } from "@/lib/viewAs";
import { useAppDialog } from "@/components/AppDialogs";
import { toast } from "sonner";
import { COMPANY_ROLE_LABELS, SUPER_ADMIN_LABEL } from "@shared/const";
import { trpc } from "@/lib/trpc";

const dateTime = (value: string | Date) => new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function SuperAdminPanel({ myOpenId }: { myOpenId?: string }) {
  const utils = trpc.useUtils();
  const users = trpc.superAdmin.users.useQuery(undefined, { retry: false });
  const companies = trpc.superAdmin.companies.useQuery(undefined, { retry: false });
  const setActive = trpc.superAdmin.setUserActive.useMutation();
  const dialog = useAppDialog();
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");

  const rows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return (users.data ?? []).filter((user) => {
      const matches = !query || [user.name, user.email ?? "", user.companyName ?? ""].some((part) => part.toLocaleLowerCase("pt-BR").includes(query));
      const company = companyFilter === "all" || (companyFilter === "none" ? !user.companyName : user.companyName === companyFilter);
      return matches && company;
    });
  }, [users.data, search, companyFilter]);

  const toggle = async (openId: string, name: string, active: boolean) => {
    if (!active && !(await dialog.confirm({ title: `Desativar ${name}?`, description: "A pessoa não consegue mais entrar até ser reativada.", confirmLabel: "Desativar", danger: true }))) return;
    try {
      await setActive.mutateAsync({ openId, active });
      await utils.superAdmin.users.invalidate();
      toast.success(active ? `${name} foi reativado.` : `${name} foi desativado.`);
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : "Não foi possível alterar.");
    }
  };

  const total = users.data?.length ?? 0;
  const independent = (users.data ?? []).filter((user) => !user.companyName).length;
  const inactive = (users.data ?? []).filter((user) => !user.canSignIn).length;

  return (
    <div className="team-page">
      <section className="stats-grid admin-stats" aria-label="Resumo do sistema">
        <article className="stat-card"><div className="stat-top"><span className="stat-icon blue"><Users size={18} /></span></div><p className="stat-label">Usuários</p><div className="stat-value-row"><strong>{total}</strong></div><p className="stat-note">Contas cadastradas</p></article>
        <article className="stat-card"><div className="stat-top"><span className="stat-icon teal"><Building2 size={18} /></span></div><p className="stat-label">Empresas</p><div className="stat-value-row"><strong>{companies.data?.length ?? 0}</strong></div><p className="stat-note">Com agências e equipes</p></article>
        <article className="stat-card"><div className="stat-top"><span className="stat-icon violet"><UserCheck size={18} /></span></div><p className="stat-label">Independentes</p><div className="stat-value-row"><strong>{independent}</strong></div><p className="stat-note">Trabalham sozinhos</p></article>
        <article className="stat-card"><div className="stat-top"><span className="stat-icon amber"><UserX size={18} /></span></div><p className="stat-label">Sem acesso</p><div className="stat-value-row"><strong>{inactive}</strong></div><p className="stat-note">Desativados ou sem senha</p></article>
      </section>

      <section className="panel records-panel">
        <div className="records-heading"><div><div className="panel-heading-title"><h2>Todos os usuários</h2><span className="recent-badge">{SUPER_ADMIN_LABEL.toUpperCase()}</span></div><p>Você vê as contas de todo o sistema. Use <b>Ver como</b> para abrir o app exatamente como uma pessoa enxerga (administrador, gerente, líder ou usuário), só para leitura.</p></div></div>
        <div className="filter-toolbar">
          <div className="search-box"><Search size={16} /><input aria-label="Buscar usuário" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, e-mail ou empresa…" />{search && <button title="Limpar busca" onClick={() => setSearch("")}><X size={14} /></button>}</div>
          <label className="period-select"><Building2 size={15} /><select aria-label="Filtrar por empresa" value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}>
            <option value="all">Todas as empresas</option><option value="none">Sem empresa</option>
            {(companies.data ?? []).map((company) => <option key={company.id} value={company.name}>{company.name} ({company.memberCount})</option>)}
          </select></label>
        </div>
        {users.isLoading ? <div className="loading-table"><LoaderCircle className="spin" size={20} />Carregando usuários…</div> : (
          <div className="table-scroll"><table className="clients-table">
            <thead><tr><th>Pessoa</th><th>Empresa</th><th>Perfil</th><th>Último acesso</th><th>Situação</th><th><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>{rows.map((user) => (
              <tr key={user.openId}>
                <td><div className="member-name"><span className="client-avatar">{user.name.charAt(0).toUpperCase()}</span><span><strong>{user.name}{user.openId === myOpenId && <em> (você)</em>}</strong><small>{user.email || "sem e-mail"}</small></span></div></td>
                <td>{user.companyName ? <span><strong className="cell-strong">{user.companyName}</strong><small className="cell-sub">{[user.agencyName, user.teamName].filter(Boolean).join(" › ") || "Empresa toda"}</small></span> : <span className="muted-cell">Independente</span>}</td>
                <td>{user.systemRole === "super_admin" ? <span className="role-badge role-super"><ShieldCheck size={12} />{SUPER_ADMIN_LABEL}</span> : user.companyRole ? <span className={`role-badge role-${user.companyRole}`}>{COMPANY_ROLE_LABELS[user.companyRole]}</span> : <span className="role-badge role-member">Usuário</span>}</td>
                <td className="muted-cell">{dateTime(user.lastSignedIn)}</td>
                <td><span className={`mini-tag ${user.canSignIn ? "tag-green" : "tag-amber"}`}><span className="tag-dot" />{user.isActive ? (user.canSignIn ? "Ativo" : !user.emailVerified ? "E-mail não confirmado" : "Sem senha") : "Desativado"}</span></td>
                <td><div className="row-actions">{user.openId !== myOpenId && <button type="button" className="view-as-action" title="Ver o app como esta pessoa (somente leitura)" aria-label={`Ver como ${user.name}`} onClick={() => startViewAs(user.openId)}><Eye size={15} /><span>Ver como</span></button>}{user.openId !== myOpenId && (user.isActive
                  ? <button type="button" className="delete-action" title="Desativar acesso" aria-label={`Desativar ${user.name}`} onClick={() => void toggle(user.openId, user.name, false)}><UserX size={16} /></button>
                  : <button type="button" className="save-action" title="Reativar acesso" aria-label={`Reativar ${user.name}`} onClick={() => void toggle(user.openId, user.name, true)}><UserCheck size={16} /></button>)}</div></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <div className="table-bottom"><span>Exibindo {rows.length} de {total} usuários</span><span>Novos super administradores só pelo terminal: pnpm usuarios promover</span></div>
      </section>
    </div>
  );
}
