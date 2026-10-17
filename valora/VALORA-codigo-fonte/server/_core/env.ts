// Values are read at use time so tests can stub process.env.
export const ENV = {
  get databaseUrl() { return process.env.DATABASE_URL ?? ""; },
  get sessionSecret() { return process.env.JWT_SECRET ?? ""; },
  // Sessions expire after this many hours (default: 12h, one working day).
  get sessionHours() {
    const hours = Number(process.env.SESSION_HOURS ?? "12");
    return Number.isFinite(hours) && hours > 0 ? hours : 12;
  },
  // "true" forces Secure cookies, "false" disables them; otherwise they follow the request protocol.
  get cookieSecure() { return process.env.COOKIE_SECURE ?? ""; },
  get isProduction() { return process.env.NODE_ENV === "production"; },
  /** Public address used in invitation links, e.g. https://valora.suaempresa.com.br */
  get appUrl() { return (process.env.APP_URL || `http://localhost:${process.env.PORT || "3000"}`).replace(/\/+$/, ""); },
  // SMTP for invitation e-mails. Without SMTP_HOST the app shows the link to copy instead.
  get smtpHost() { return process.env.SMTP_HOST ?? ""; },
  get smtpPort() { return Number(process.env.SMTP_PORT || "587"); },
  get smtpSecure() { return process.env.SMTP_SECURE === "true"; },
  get smtpUser() { return process.env.SMTP_USER ?? ""; },
  get smtpPass() { return process.env.SMTP_PASS ?? ""; },
  get smtpFrom() { return process.env.SMTP_FROM || process.env.SMTP_USER || ""; },
};

export const MIN_SESSION_SECRET_LENGTH = 32;
