import { PublicApp } from "@/components/public/PublicApp";
import { publicView } from "@/lib/publicData";

export const dynamic = "force-dynamic";
export const metadata = { title: "Public · NarcoTrace" };

export default async function PublicPage() {
  const view = await publicView();
  return <PublicApp view={view} />;
}
