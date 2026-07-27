import { cn } from "@/lib/utils";

export interface RegistryScoreHexProps {
  score: number;
  size?: "sm" | "md" | "lg";
  delta?: number | null;
  className?: string;
}

/** Tessl-style glowing hex score badge. */
export function RegistryScoreHex({
  score,
  size = "md",
  delta,
  className,
}: RegistryScoreHexProps): JSX.Element {
  const dim =
    size === "lg"
      ? { w: 88, h: 96, text: "text-[32px]", sub: "text-[11px]" }
      : size === "sm"
        ? { w: 44, h: 48, text: "text-[15px]", sub: "text-[9px]" }
        : { w: 64, h: 70, text: "text-[22px]", sub: "text-[10px]" };

  return (
    <div className={cn("registry-score-hex inline-flex flex-col items-center", className)}>
      <svg
        width={dim.w}
        height={dim.h}
        viewBox="0 0 88 96"
        aria-label={`Score ${score}`}
        className="registry-score-hex-glow"
      >
        <polygon
          points="44,4 82,24 82,72 44,92 6,72 6,24"
          className="registry-hex-fill"
        />
        <polygon
          points="44,4 82,24 82,72 44,92 6,72 6,24"
          className="registry-hex-stroke"
          fill="none"
        />
        <text
          x="44"
          y="52"
          textAnchor="middle"
          className="fill-current font-semibold text-registry-accent"
          style={{ fontSize: size === "lg" ? 32 : size === "sm" ? 15 : 22 }}
        >
          {score}
        </text>
      </svg>
      {delta != null && delta > 0 ? (
        <span className={cn("registry-delta mt-0.5", dim.sub)}>↑ {delta.toFixed(2)}x</span>
      ) : null}
    </div>
  );
}
