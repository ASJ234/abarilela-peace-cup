"use client";

import { useEffect, useState } from "react";

/**
 * Live countdown to a kick-off (date + optional time, in the viewer's local time).
 * Renders a stable placeholder on the server, then ticks in the browser.
 */
export function Countdown({ date, kickoff }: { date: string; kickoff: string | null }) {
  const target = new Date(`${date}T${kickoff ?? "00:00"}:00`).getTime();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0); // start right after hydration
    const id = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);

  const parts = now == null ? null : split(target - now);
  const ended = parts == null ? false : target - now! <= 0;

  return (
    <div aria-live="off" className="flex justify-center gap-2 sm:gap-3">
      {ended ? (
        <p className="text-lg font-bold">{kickoff ? "Kicking off now!" : "Match day today!"}</p>
      ) : (
        (["days", "hrs", "min", "sec"] as const).map((unit, i) => (
          <div key={unit} className="min-w-14 rounded-lg bg-white/15 px-2 py-2 text-center backdrop-blur-sm sm:min-w-16">
            <div className="num text-2xl font-black leading-none sm:text-3xl">
              {parts ? String(parts[i]).padStart(2, "0") : "--"}
            </div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider opacity-80">{unit}</div>
          </div>
        ))
      )}
    </div>
  );
}

function split(ms: number): [number, number, number, number] {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60];
}
