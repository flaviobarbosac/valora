// "Ver como": a super administrator browses the app as another person, read-only.
// The chosen person lives in sessionStorage (this tab only) and travels to the
// server in a header that is honoured only for super administrators.
const KEY = "valora-view-as";
export const VIEW_AS_HEADER = "x-valora-view-as";

export function getViewAs(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function reloadHome() {
  // A full reload drops every cached query from the previous identity.
  window.location.assign("/");
}

export function startViewAs(openId: string) {
  try { sessionStorage.setItem(KEY, openId); } catch { return; }
  reloadHome();
}

export function stopViewAs({ reload = true } = {}) {
  try { sessionStorage.removeItem(KEY); } catch { /* storage unavailable */ }
  if (reload) reloadHome();
}
