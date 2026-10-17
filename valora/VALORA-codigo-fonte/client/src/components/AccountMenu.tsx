import { Bug, KeyRound, LogOut, Trash2, UserRound } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ProfileSettings } from "@/lib/client-types";

type Props = {
  profile: ProfileSettings;
  roleLabel: string;
  email: string;
  onOpenProfile: () => void;
  onChangePassword: () => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
  onReportBug: () => void;
};

export default function AccountMenu({ profile, roleLabel, email, onOpenProfile, onChangePassword, onLogout, onDeleteAccount, onReportBug }: Props) {
  const initial = profile.displayName.trim().charAt(0).toLocaleUpperCase("pt-BR") || "V";
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="top-avatar account-avatar-button" title="Minha conta" aria-label="Abrir menu da conta">
          {profile.avatarDataUrl ? <img src={profile.avatarDataUrl} alt="" /> : initial}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className="account-menu">
        <DropdownMenuLabel className="account-menu-header">
          <strong>{profile.displayName || "Usuário Valora"}</strong>
          <small>{email}</small>
          <span className="account-menu-role">{roleLabel}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onOpenProfile}><UserRound />Perfil e metas</DropdownMenuItem>
        <DropdownMenuItem onSelect={onChangePassword}><KeyRound />Mudar senha</DropdownMenuItem>
        <DropdownMenuItem onSelect={onReportBug}><Bug />Relatar erro</DropdownMenuItem>
        <DropdownMenuItem onSelect={onLogout}><LogOut />Sair da conta</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDeleteAccount}><Trash2 />Excluir conta</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
