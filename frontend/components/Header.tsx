"use client";

import Link from "next/link";
import { useLang } from "@/lib/i18n";

export function Mark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <rect x="1" y="1" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1 12h22M12 1v22" stroke="currentColor" strokeWidth="1" />
      <rect x="13.5" y="4" width="6" height="6" fill="var(--color-signal)" />
    </svg>
  );
}

const SECTIONS = ["enforcement", "public"] as const;

/** One row of ruled cells shared by every screen. */
export function Header({ section, tagline, updated, languages }: {
  section: "enforcement" | "public"; tagline: string; updated?: string;
  /** Show the English / Malayalam switch (public side). */
  languages?: boolean;
}) {
  const { t, lang, setLang } = useLang();
  return (
    <header className={`grid border-b border-ink ${languages ? "grid-cols-[auto_1fr_auto_auto] md:grid-cols-[auto_auto_1fr_auto_auto]" : "grid-cols-[auto_1fr_auto] md:grid-cols-[auto_auto_1fr_auto]"}`}>
      <Link href="/" className="flex items-center gap-2.5 px-4 md:px-5 border-r border-ink">
        <Mark />
        <span className="font-semibold tracking-[-0.01em] text-[15px]">NarcoTrace</span>
      </Link>
      <nav className="flex" aria-label="Sections">
        {SECTIONS.map((id, i) => id === section
          ? <span key={id} aria-current="page"
              className={`flex items-center px-3 md:px-5 border-ink label ${id === "enforcement" ? "bg-signal text-paper font-semibold" : "bg-ink text-paper"} ${i ? "md:border-r" : "border-r"}`}>{t.sections[id]}</span>
          : <Link key={id} href={`/${id}`}
              className={`flex items-center px-3 md:px-5 border-ink label text-ink-2 hover:bg-paper-2 ${i ? "md:border-r" : "border-r"}`}>{t.sections[id]}</Link>)}
      </nav>
      <div className="hidden md:flex items-center px-5 text-[13px] text-ink-2 min-w-0"><span className="truncate lg:whitespace-normal">{tagline}</span></div>
      {updated && (
        <div className="hidden sm:flex items-center gap-4 px-5 border-l border-ink cross">
          {section === "enforcement"
            ? <span className="label text-electric flex items-center gap-2"><i className="pulse block size-2 rounded-full bg-electric" />Live</span>
            : <span className="label text-mute">{t.updated}</span>}
          <span className="text-[13px] tabular">{updated}</span>
        </div>
      )}
      {languages && (
        <button onClick={() => setLang(lang === "en" ? "ml" : "en")} aria-label={t.switchLabel}
          lang={lang === "en" ? "ml" : "en"}
          className="flex items-center px-3 md:px-5 border-l border-ink text-[13px] hover:bg-ink hover:text-paper">
          {t.switchTo}
        </button>
      )}
    </header>
  );
}
