export const COOKIE_NAME = "valora_session";
export const UNAUTHED_ERR_MSG = "Faça login para continuar (10001)";
export const NOT_ADMIN_ERR_MSG = "Você não tem permissão para esta ação (10002)";
export const VIEW_AS_READONLY_MSG = "Modo Ver como: somente leitura. Volte para a sua conta para fazer alterações.";

// Login identifiers. Both are stored normalized (trimmed, lowercase).
export const AGENCY_CODE_PATTERN = /^[a-z0-9._-]{1,20}$/;
export const USERNAME_PATTERN = /^[a-z0-9._@-]{1,64}$/;
export const normalizeLoginId = (value: string) => value.trim().toLowerCase();
export const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const COMPANY_ROLE_LABELS = {
  admin: "Administrador",
  manager: "Gerente da agência",
  leader: "Líder de grupo",
  member: "Usuário",
} as const;
export type CompanyRoleKey = keyof typeof COMPANY_ROLE_LABELS;

/** What each company role is allowed to see, in plain words for the UI. */
export const COMPANY_ROLE_SCOPE = {
  admin: "Vê o painel de agências (metas, atendimentos e vendas, sem dados de clientes) e gerencia agências, equipes, pessoas e convites.",
  manager: "Vê os funcionários e os atendimentos das equipes da sua agência e assume os casos técnicos.",
  leader: "Vê os atendimentos da sua equipe.",
  member: "Vê e edita apenas os próprios atendimentos.",
} as const;

export const SUPER_ADMIN_LABEL = "Super administrador";
export const INVITE_VALID_DAYS = 7;
