import Link from "next/link";
import { Mark } from "@/components/Header";

export default function Home() {
  return (
    <div className="min-h-dvh grid grid-rows-[56px_1fr_auto]">
      <header className="grid grid-cols-[auto_1fr_auto] border-b border-ink">
        <div className="flex items-center gap-2.5 px-5 border-r border-ink">
          <Mark /><span className="font-semibold text-[15px] tracking-[-0.01em]">NarcoTrace</span>
        </div>
        <div />
        <div className="flex items-center px-5 border-l border-ink label text-mute">Kerala · Hackfinity 2026</div>
      </header>

      <main className="grid lg:grid-cols-[1.1fr_1fr_1fr]">
        <section className="px-6 lg:px-10 py-12 lg:py-16 border-b lg:border-b-0 lg:border-r border-ink flex flex-col justify-between gap-10">
          <div>
            <p className="label text-mute mb-6">01 · What it is</p>
            <h1 className="text-[44px] lg:text-[64px] leading-[0.98] tracking-[-0.035em] font-medium">
              Where drugs turn up next, and where help is far away.
            </h1>
          </div>
          <p className="max-w-[46ch] text-[15px] text-ink-2 leading-relaxed">
            NarcoTrace learns from years of reported drug seizures across Kerala. It shows enforcement teams where the
            next seizures are most likely, and shows the public where recovery services are hardest to reach.
          </p>
        </section>

        <Door href="/enforcement" index="02" title="Enforcement" line="Where reported seizures are most likely in the next four weeks, why those places, and how often the forecast is right."
          cta="Open the map" live />
        <Door href="/public" index="03" title="Public" line="Where people live far from de-addiction help, and the nearest centres from any spot, for families and health services."
          cta="Open the map" live />
      </main>

      <footer className="grid grid-cols-2 lg:grid-cols-4 border-t border-ink text-[12px] text-ink-2">
        {["Built from public sources only", "No person or address is scored", "A planning aid, not an order", "Unflagged is not proven safe"].map((t, i) => (
          <p key={t} className={`px-5 py-3 ${i ? "border-l border-ink" : ""} cross`}>{t}</p>
        ))}
      </footer>
    </div>
  );
}

function Door({ href, index, title, line, cta, live }: {
  href: string; index: string; title: string; line: string; cta: string; live?: boolean;
}) {
  return (
    <Link href={href} className="group relative px-6 lg:px-10 py-12 lg:py-16 border-b lg:border-b-0 lg:border-r last:border-r-0 border-ink flex flex-col justify-between gap-10 hover:bg-ink hover:text-paper transition-colors duration-200">
      <div>
        <p className="label opacity-60 mb-6">{index} · {live ? "Live" : "Next"}</p>
        <h2 className="text-[36px] leading-none tracking-[-0.03em] font-medium">{title}</h2>
        <p className="mt-5 max-w-[34ch] text-[15px] leading-relaxed opacity-80">{line}</p>
      </div>
      <div className="flex items-center justify-between border-t border-current pt-4">
        <span className="label">{cta}</span>
        <span className="text-[22px] transition-transform duration-200 group-hover:translate-x-1">→</span>
      </div>
      {live && <span className="absolute top-6 right-6 size-3 bg-signal" aria-hidden />}
    </Link>
  );
}
