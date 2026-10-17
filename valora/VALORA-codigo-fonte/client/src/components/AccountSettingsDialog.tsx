import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Camera, KeyRound, Target, UserRound } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { GoalSettings, ProfileSettings } from "@/lib/client-types";

type SettingsTab = "profile" | "goals" | "security";
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab: SettingsTab;
  profile: ProfileSettings;
  profileLoading: boolean;
  savingProfile: boolean;
  goals: GoalSettings;
  goalsLoading: boolean;
  savingGoals: boolean;
  monthLabel: string;
  onSaveProfile: (profile: ProfileSettings) => Promise<boolean>;
  onSaveGoals: (goals: GoalSettings) => Promise<boolean>;
  email: string;
  changingPassword: boolean;
  /** Resolves to an error message, or null when the password was changed. */
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<string | null>;
};

const EMPTY_PASSWORDS = { current: "", next: "", confirm: "" };

const MAX_AVATAR_DATA_URL = 400_000;
const MAX_SOURCE_IMAGE = 8 * 1024 * 1024;

async function prepareAvatar(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Escolha uma imagem JPG, PNG ou WebP.");
  if (file.size > MAX_SOURCE_IMAGE) throw new Error("A imagem original deve ter até 8 MB.");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Não foi possível abrir esta imagem."));
      image.src = objectUrl;
    });
    const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a imagem neste navegador.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    if (dataUrl.length > MAX_AVATAR_DATA_URL) throw new Error("A foto ficou muito grande. Escolha uma imagem mais simples.");
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function AccountSettingsDialog({
  open, onOpenChange, initialTab, profile, profileLoading, savingProfile,
  goals, goalsLoading, savingGoals, monthLabel, onSaveProfile, onSaveGoals,
  email, changingPassword, onChangePassword,
}: Props) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [profileDraft, setProfileDraft] = useState<ProfileSettings>(profile);
  const [goalDraft, setGoalDraft] = useState<GoalSettings>(goals);
  const [profileError, setProfileError] = useState("");
  const [goalError, setGoalError] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [passwords, setPasswords] = useState(EMPTY_PASSWORDS);
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setProfileDraft(profile);
    setGoalDraft(goals);
    setProfileError("");
    setGoalError("");
    setPasswords(EMPTY_PASSWORDS);
    setPasswordError("");
  }, [open, initialTab, profile, goals]);

  const choosePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setProfileError("");
    setPhotoBusy(true);
    try {
      const avatarDataUrl = await prepareAvatar(file);
      setProfileDraft((current) => ({ ...current, avatarDataUrl }));
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Não foi possível preparar a foto.");
    } finally {
      setPhotoBusy(false);
    }
  };

  const submitProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileError("");
    const nextProfile = {
      ...profileDraft,
      displayName: profileDraft.displayName.trim(),
      jobTitle: profileDraft.jobTitle.trim(),
    };
    if (!nextProfile.displayName) {
      setProfileError("Informe seu nome de exibição.");
      return;
    }
    if (await onSaveProfile(nextProfile)) onOpenChange(false);
    else setProfileError("Não foi possível salvar seu perfil. Tente novamente.");
  };

  const submitGoals = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setGoalError("");
    const valid = [goalDraft.monthlyContactTarget, goalDraft.monthlySaleTarget]
      .every((value) => Number.isInteger(value) && value >= 1 && value <= 100000);
    if (!valid) {
      setGoalError("Informe metas inteiras entre 1 e 100.000.");
      return;
    }
    if (await onSaveGoals(goalDraft)) onOpenChange(false);
    else setGoalError("Não foi possível salvar as metas. Tente novamente.");
  };

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError("");
    if (passwords.next.length < 8 || !/[A-Za-z]/.test(passwords.next) || !/\d/.test(passwords.next)) {
      setPasswordError("A nova senha deve ter pelo menos 8 caracteres, com letras e números.");
      return;
    }
    if (passwords.next !== passwords.confirm) {
      setPasswordError("A confirmação não confere com a nova senha.");
      return;
    }
    const error = await onChangePassword(passwords.current, passwords.next);
    if (error) setPasswordError(error);
    else onOpenChange(false);
  };

  const initials = profileDraft.displayName.trim().charAt(0).toLocaleUpperCase("pt-BR") || "V";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="client-dialog account-settings-dialog">
        <DialogHeader className="dialog-heading">
          <div className="dialog-icon"><UserRound size={19} /></div>
          <div><DialogTitle>Configurações da conta</DialogTitle><DialogDescription>Atualize sua identificação no VALORA, suas metas do mês e sua senha.</DialogDescription></div>
        </DialogHeader>

        <div className="account-settings-tabs" role="tablist" aria-label="Configurações da conta">
          <button type="button" role="tab" aria-selected={tab === "profile"} className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}><UserRound size={15} />Perfil</button>
          <button type="button" role="tab" aria-selected={tab === "goals"} className={tab === "goals" ? "active" : ""} onClick={() => setTab("goals")}><Target size={15} />Metas</button>
          <button type="button" role="tab" aria-selected={tab === "security"} className={tab === "security" ? "active" : ""} onClick={() => setTab("security")}><KeyRound size={15} />Senha</button>
        </div>

        {tab === "profile" ? (
          <form className="client-form account-settings-form" onSubmit={(event) => void submitProfile(event)}>
            <div className="profile-photo-row">
              <div className="profile-photo-preview" aria-label="Prévia da foto de perfil">
                {profileDraft.avatarDataUrl ? <img src={profileDraft.avatarDataUrl} alt="Foto de perfil" /> : <span>{initials}</span>}
              </div>
              <div className="profile-photo-actions">
                <strong>Foto do perfil</strong>
                <p>JPG, PNG ou WebP; será ajustada para até 512 px.</p>
                <label className="button button-outline profile-photo-button">
                  <Camera size={14} />{photoBusy ? "Preparando…" : "Escolher foto"}
                  <input type="file" accept="image/jpeg,image/png,image/webp" disabled={photoBusy || savingProfile} onChange={(event) => void choosePhoto(event)} />
                </label>
                {profileDraft.avatarDataUrl && <button type="button" className="profile-remove-photo" onClick={() => setProfileDraft((current) => ({ ...current, avatarDataUrl: null }))}>Remover foto</button>}
              </div>
            </div>

            {profileLoading && <p className="account-settings-loading">Carregando seus dados de perfil…</p>}
            <div className="form-grid">
              <label className="field field-span-2"><span>Nome de exibição <b>*</b></span><input autoComplete="name" required maxLength={100} value={profileDraft.displayName} onChange={(event) => setProfileDraft((current) => ({ ...current, displayName: event.target.value }))} placeholder="Seu nome" /></label>
              <label className="field field-span-2"><span>Função ou cargo na empresa</span><input maxLength={100} value={profileDraft.jobTitle} onChange={(event) => setProfileDraft((current) => ({ ...current, jobTitle: event.target.value }))} placeholder="Ex.: Consultora de crédito" /></label>
            </div>
            {profileError && <div className="form-error" role="alert">{profileError}</div>}
            <div className="form-actions"><button type="button" className="button button-ghost" onClick={() => onOpenChange(false)}>Cancelar</button><button type="submit" className="button button-primary" disabled={savingProfile || photoBusy}>{savingProfile ? "Salvando…" : "Salvar perfil"}</button></div>
          </form>
        ) : tab === "security" ? (
          <form className="client-form account-settings-form" onSubmit={(event) => void submitPassword(event)}>
            <div className="form-section-title"><span>Acesso</span><i /></div>
            <p className="account-settings-note">Você entra com o e-mail <strong>{email}</strong>. Ao trocar a senha, as sessões abertas em outros aparelhos são encerradas.</p>
            <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
            <div className="form-grid">
              <label className="field field-span-2"><span>Senha atual</span><input type="password" autoComplete="current-password" required maxLength={128} value={passwords.current} onChange={(event) => setPasswords((current) => ({ ...current, current: event.target.value }))} /></label>
              <label className="field"><span>Nova senha</span><input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={passwords.next} onChange={(event) => setPasswords((current) => ({ ...current, next: event.target.value }))} /></label>
              <label className="field"><span>Repita a nova senha</span><input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={passwords.confirm} onChange={(event) => setPasswords((current) => ({ ...current, confirm: event.target.value }))} /></label>
            </div>
            <p className="account-settings-note">Mínimo de 8 caracteres, com letras e números.</p>
            {passwordError && <div className="form-error" role="alert">{passwordError}</div>}
            <div className="form-actions"><button type="button" className="button button-ghost" onClick={() => onOpenChange(false)}>Cancelar</button><button type="submit" className="button button-primary" disabled={changingPassword}>{changingPassword ? "Alterando…" : "Alterar senha"}</button></div>
          </form>
        ) : (
          <form className="client-form account-settings-form" onSubmit={(event) => void submitGoals(event)}>
            <div className="form-section-title"><span>Metas de {monthLabel}</span><i /></div>
            <p className="account-settings-note">Defina seus objetivos do mês e acompanhe o progresso na visão inicial.</p>
            {goalsLoading ? <p className="account-settings-loading">Carregando suas metas…</p> : <div className="form-grid">
              <label className="field"><span>Meta de atendimentos</span><input type="number" min={1} max={100000} step={1} required value={goalDraft.monthlyContactTarget} onChange={(event) => setGoalDraft((current) => ({ ...current, monthlyContactTarget: Number(event.target.value) }))} /></label>
              <label className="field"><span>Meta de vendas fechadas</span><input type="number" min={1} max={100000} step={1} required value={goalDraft.monthlySaleTarget} onChange={(event) => setGoalDraft((current) => ({ ...current, monthlySaleTarget: Number(event.target.value) }))} /></label>
            </div>}
            {goalError && <div className="form-error" role="alert">{goalError}</div>}
            <div className="form-actions"><button type="button" className="button button-ghost" onClick={() => onOpenChange(false)}>Cancelar</button><button type="submit" className="button button-primary" disabled={savingGoals || goalsLoading}>{savingGoals ? "Salvando…" : "Salvar metas"}</button></div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
