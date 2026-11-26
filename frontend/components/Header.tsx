import Link from "next/link";

export function Mark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <rect x="1" y="1" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1 12h22M12 1v22" stroke="currentColor" strokeWidth="1" />
      <rect x="13.5" y="4" width="6" height="6" fill="#ff3b26" />
    </svg>
  );
}

const SECTIONS = [{ id: "enforcement", label: "Enforcement" }, { id: "public", label: "Public" }] as const;

/** One row of ruled cells shared by every screen. */
export function Header({ section, tagline, updated }: {
  section: "enforcement" | "public"; tagline: string; updated?: string;
}) {
  return (
    <header className="grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_auto_1fr_auto] border-b border-ink">
      <Link href="/" className="flex items-center gap-2.5 px-4 md:px-5 border-r border-ink">
        <Mark />
        <span className="font-semibold tracking-[-0.01em] text-[15px]">NarcoTrace</span>
      </Link>
      <nav className="flex" aria-label="Sections">
        {SECTIONS.map((s, i) => s.id === section
          ? <span key={s.id} aria-current="page"
              className={`flex items-center px-3 md:px-5 border-ink bg-ink text-paper label ${i ? "md:border-r" : "border-r"}`}>{s.label}</span>
          : <Link key={s.id} href={`/${s.id}`}
              className={`flex items-center px-3 md:px-5 border-ink label text-ink-2 hover:bg-paper-2 ${i ? "md:border-r" : "border-r"}`}>{s.label}</Link>)}
      </nav>
      <div className="hidden md:flex items-center px-5 text-[13px] text-ink-2">{tagline}</div>
      {updated && (
        <div className="hidden sm:flex items-center gap-4 px-5 border-l border-ink cross">
          <span className="label text-mute">Updated</span>
          <span className="text-[13px] tabular">{updated}</span>
        </div>
      )}
    </header>
  );
}
