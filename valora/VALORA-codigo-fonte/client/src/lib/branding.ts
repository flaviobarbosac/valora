import { COMPANY_ROLE_LABELS, type CompanyRoleKey } from "@shared/const";

// Company customization ("Personalizar"): role names, colors and logo.
// Labels live in a module-level map that Home refreshes on every render from the
// company's settings, so any component can call roleLabel(). Stage names live in
// each product's pipeline (lib/workspace).

let roleOverrides: Partial<Record<CompanyRoleKey, string>> = {};

export function setBrandLabels(roles: Record<string, string> | undefined) {
  roleOverrides = (roles ?? {}) as Partial<Record<CompanyRoleKey, string>>;
}

export function roleLabel(role: CompanyRoleKey) {
  return roleOverrides[role] || COMPANY_ROLE_LABELS[role];
}

export const DEFAULT_COLORS = { primary: "#13315c", dark: "#0b1f3a", accent: "#6fc8ef" } as const;

export const COLOR_PRESETS: { name: string; primary: string; dark: string; accent: string }[] = [
  { name: "Azul-marinho (padrão)", ...DEFAULT_COLORS },
  { name: "Vermelho", primary: "#b3121f", dark: "#5c0a10", accent: "#ffb4b9" },
  { name: "Verde", primary: "#0b6b3a", dark: "#073d22", accent: "#8fe3b4" },
  { name: "Laranja", primary: "#d35400", dark: "#6b2b00", accent: "#ffc48f" },
  { name: "Amarelo e azul", primary: "#0b3a8a", dark: "#071f4a", accent: "#ffd400" },
  { name: "Roxo", primary: "#5b2a86", dark: "#2e1446", accent: "#d6b8f5" },
  { name: "Grafite", primary: "#2f3a48", dark: "#161c24", accent: "#9fb3c8" },
];

const mix = (hex: string, target: number, amount: number) => {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.round(((value >> shift) & 255) * (1 - amount) + target * amount);
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, "0")).join("")}`;
};

/** Applies the company colors to the whole app (CSS variables on <html>). */
export function applyBrandColors(colors: { primary?: string | null; dark?: string | null; accent?: string | null } | null) {
  const root = document.documentElement.style;
  const primary = colors?.primary || DEFAULT_COLORS.primary;
  const dark = colors?.dark || DEFAULT_COLORS.dark;
  const accent = colors?.accent || DEFAULT_COLORS.accent;
  root.setProperty("--c-primary", primary);
  root.setProperty("--c-primary-dark", dark);
  root.setProperty("--c-primary-mid", mix(primary, 255, 0.18));
  root.setProperty("--c-primary-light", mix(primary, 255, 0.88));
  root.setProperty("--c-accent", accent);
  root.setProperty("--c-sidebar-active", mix(dark, 255, 0.1));
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark);
}
