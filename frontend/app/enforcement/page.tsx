import { EnforcementApp } from "@/components/enforcement/EnforcementApp";
import { enforcementView } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Enforcement · NarcoTrace" };

export default async function EnforcementPage() {
  const view = await enforcementView();
  return <EnforcementApp view={view} />;
}
