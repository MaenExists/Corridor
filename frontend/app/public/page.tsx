import { cookies } from "next/headers";
import { PublicApp } from "@/components/public/PublicApp";
import { publicView } from "@/lib/publicData";
import { LangProvider } from "@/lib/i18n";
import { LANG_COOKIE, isLang } from "@/lib/strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Public · NarcoTrace" };

export default async function PublicPage() {
  const [view, jar] = await Promise.all([publicView(), cookies()]);
  const saved = jar.get(LANG_COOKIE)?.value;
  return (
    <LangProvider initial={isLang(saved) ? saved : "en"}>
      <PublicApp view={view} />
    </LangProvider>
  );
}
