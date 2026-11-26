import Link from "next/link";

export const metadata = { title: "Public · NarcoTrace" };

export default function PublicPage() {
  return (
    <div className="min-h-dvh grid place-items-center p-6">
      <div className="max-w-[520px] border border-ink bg-paper">
        <p className="px-5 py-3 border-b border-ink label text-mute">Public · next</p>
        <div className="px-5 py-6">
          <h1 className="text-[28px] leading-tight tracking-[-0.02em] font-medium">Recovery access map is being rebuilt.</h1>
          <p className="mt-3 text-[14px] text-ink-2 leading-relaxed">
            The public view will show, square kilometre by square kilometre, where people live far from de-addiction help.
          </p>
        </div>
        <Link href="/enforcement" className="block px-5 py-3 border-t border-ink label hover:bg-ink hover:text-paper">← Enforcement map</Link>
      </div>
    </div>
  );
}
