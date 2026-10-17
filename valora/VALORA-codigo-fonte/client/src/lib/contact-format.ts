export function normalizePhoneContact(value: string | null | undefined): string | null {
  const contact = value?.trim() ?? "";
  if (!contact || !/^[\d+\s().-]+$/.test(contact)) return null;
  const normalized = contact.replace(/[\s().-]/g, "");
  return /^\+?\d{8,15}$/.test(normalized) ? normalized : null;
}
