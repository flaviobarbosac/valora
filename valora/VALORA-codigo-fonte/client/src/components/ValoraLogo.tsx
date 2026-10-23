import { useId } from "react";

const VALORA_SYMBOL = "/assets/valora-symbol-final.png";

type Props = {
  compact?: boolean;
  /** "dark" for navy backgrounds (sidebar, login panel), "light" for white ones. */
  variant?: "light" | "dark";
  size?: "default" | "large";
};

/** VALORA wordmark: geometric letters with the "A" drawn without a crossbar, as in the brand artwork. */
function Wordmark({ variant }: { variant: "light" | "dark" }) {
  const gradientId = `valora-gradient-${useId().replace(/:/g, "")}`;
  const [from, to] = variant === "dark" ? ["#2f7fe0", "#36d6ec"] : ["#0d3f8f", "#1fb6d9"];
  const lambda = (x: number) => `M${x + 18} 0H${x + 32}L${x + 50} 50H${x + 37}L${x + 25} 15L${x + 13} 50H${x}Z`;
  return (
    <svg className="valora-name" viewBox="0 0 313 50" role="img" aria-label="VALORA">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="313" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <g fill={`url(#${gradientId})`} fillRule="evenodd">
        <path d="M0 0H13L25 35L37 0H50L32 50H18Z" />
        <path d={lambda(56)} />
        <path d="M114 0H126V39H152V50H114Z" />
        <path d="M183 0A25 25 0 1 1 183 50A25 25 0 1 1 183 0ZM183 11A14 14 0 1 0 183 39A14 14 0 1 0 183 11Z" />
        <path d="M215 0H239A15.5 15.5 0 0 1 247 29L258 50H244.5L235 31H227V50H215ZM227 10.5V20.5H239A5 5 0 0 0 239 10.5Z" />
        <path d={lambda(263)} />
      </g>
    </svg>
  );
}

export default function ValoraLogo({ compact = false, variant = "light", size = "default", tagline }: Props & { tagline?: string }) {
  return (
    <div className={`valora-brand valora-brand-${variant} ${compact ? "valora-brand-compact" : ""} ${size === "large" ? "valora-brand-large" : ""}`} aria-label="VALORA Pipeline de vendas">
      <img className="valora-mark" src={VALORA_SYMBOL} alt="" aria-hidden="true" />
      <div className="valora-wordmark">
        <Wordmark variant={variant} />
        {!compact && <span className="valora-tagline">{tagline || "PIPELINE DE VENDAS"}</span>}
      </div>
    </div>
  );
}
