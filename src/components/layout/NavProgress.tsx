"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/** A loading placeholder (components/ui/Skeleton.tsx LoadingRegion) is on screen. */
const placeholderShowing = () => document.querySelector('main [aria-busy="true"]') != null;

/**
 * A thin bar across the top of the screen while a new page loads. It starts on
 * any click on a link to another page of this site (header, buttons, tabs,
 * season switcher…) and finishes once the new page's content is shown: the
 * address has changed and no loading placeholder is left.
 */
export function NavProgress() {
  const here = `${usePathname()}?${useSearchParams().toString()}`;
  // The page we were on when a link was clicked, and whether the new page's content has arrived.
  const [from, setFrom] = useState<string | null>(null);
  const [contentShown, setContentShown] = useState(false);
  const arrived = from != null && from !== here;
  const phase = from == null ? "idle" : arrived && contentShown ? "done" : "loading";

  // Start: a plain left click on an internal link to a different page. Listened to in the
  // capture phase, because Next.js links cancel the click to navigate without a reload.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return; // same page or #anchor
      setContentShown(false);
      setFrom(`${window.location.pathname}?${new URLSearchParams(window.location.search).toString()}`);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // After the address changes, wait for the loading placeholder (if any) to be replaced.
  useEffect(() => {
    if (!arrived || contentShown) return;
    const check = () => { if (!placeholderShowing()) setContentShown(true); };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    const first = window.requestAnimationFrame(check);
    return () => { observer.disconnect(); window.cancelAnimationFrame(first); };
  }, [arrived, contentShown]);

  // Hide after finishing, and never leave the bar stuck if a navigation is cancelled.
  useEffect(() => {
    if (phase === "idle") return;
    const t = window.setTimeout(() => setFrom(null), phase === "done" ? 350 : 20000);
    return () => window.clearTimeout(t);
  }, [phase]);

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px] transition-opacity duration-150 ${
        phase === "idle" ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* Grows towards 85% while loading (slowing down), jumps to full when done, then fades. */}
      <div
        className={`h-full w-full bg-accent shadow-[0_0_8px_var(--accent)] ${
          phase === "loading" ? "motion-safe:animate-[nav-progress_8s_cubic-bezier(0.1,0.7,0.2,1)_forwards]" : ""
        }`}
      />
    </div>
  );
}
