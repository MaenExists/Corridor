"use client";

import { useEffect, useState } from "react";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/**
 * "Install app" in the header. Chrome, Edge and Android offer a real install prompt; iPhone and iPad have no
 * prompt, so the button explains Add to Home Screen. Hidden once the app runs installed.
 */
export function InstallButton({ label, iosHint }: { label: string; iosHint: string }) {
  const [prompt, setPrompt] = useState<PromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hint, setHint] = useState(false);
  const [installed, setInstalled] = useState(true);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone);
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as PromptEvent); };
    const onInstalled = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (installed || (!prompt && !ios)) return null;
  const onClick = async () => {
    if (prompt) { await prompt.prompt(); await prompt.userChoice; setPrompt(null); }
    else setHint(h => !h);
  };
  return (
    <div className="relative flex shrink-0">
      <button onClick={onClick} className="flex items-center gap-2 px-3 md:px-4 border-l border-ink label hover:bg-paper-2" title={label}>
        <svg viewBox="0 0 12 12" className="size-3" aria-hidden><path d="M6 1v7M3 5l3 3 3-3M1.5 10.5h9" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
        <span className="hidden sm:inline">{label}</span>
      </button>
      {hint && (
        <p className="absolute right-0 top-full z-[1200] w-64 mt-px p-3 bg-paper border border-ink text-[12.5px] leading-snug">{iosHint}</p>
      )}
    </div>
  );
}
