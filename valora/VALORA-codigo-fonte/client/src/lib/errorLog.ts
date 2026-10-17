// Keeps the last technical errors of this page so a bug report can include them
// (only if the person agrees in the "Relatar erro" dialog).
const MAX_ENTRIES = 25;
const entries: string[] = [];

function push(kind: string, message: unknown) {
  const text = message instanceof Error ? `${message.name}: ${message.message}\n${message.stack ?? ""}` : String(message);
  entries.push(`[${new Date().toISOString()}] ${kind}: ${text.slice(0, 2000)}`);
  if (entries.length > MAX_ENTRIES) entries.shift();
}

export function installErrorLog() {
  window.addEventListener("error", (event) => push("erro", event.error ?? event.message));
  window.addEventListener("unhandledrejection", (event) => push("promessa", event.reason));
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    push("console", args.map((arg) => (arg instanceof Error ? `${arg.message}` : typeof arg === "string" ? arg : (() => { try { return JSON.stringify(arg); } catch { return String(arg); } })())).join(" "));
    original(...args);
  };
}

export function technicalSnapshot() {
  return [
    `Página: ${window.location.pathname}${window.location.search}`,
    `Tela: ${window.innerWidth}x${window.innerHeight}`,
    `Data: ${new Date().toLocaleString("pt-BR")}`,
    "",
    entries.length ? "Últimos erros:" : "Nenhum erro técnico registrado nesta página.",
    ...entries,
  ].join("\n");
}
