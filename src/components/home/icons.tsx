import type { SVGProps } from "react";

/**
 * Small icons the icon set (lucide) doesn't have. They match lucide's style:
 * 24×24 grid, currentColor, 2px strokes, so they sit next to lucide icons.
 */

/** A football: ball outline with the centre panel and seams. */
export function BallIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m12 7.5 4.3 3.1-1.6 5h-5.4l-1.6-5z" fill="currentColor" fillOpacity={0.15} />
      <path d="M12 7.5V2.5M16.3 10.6l4.6-1.6M14.7 15.6l2.9 4M9.3 15.6l-2.9 4M7.7 10.6 3.1 9" />
    </svg>
  );
}

/** A yellow or red card, drawn as a small upright rectangle (steadier than emoji across phones). */
export function CardChip({ color, className = "" }: { color: "yellow" | "red"; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-3.5 w-2.5 shrink-0 rounded-[2px] align-[-2px] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)] ${
        color === "yellow" ? "bg-[#f5c518]" : "bg-[#dc2626]"
      } ${className}`}
    />
  );
}
