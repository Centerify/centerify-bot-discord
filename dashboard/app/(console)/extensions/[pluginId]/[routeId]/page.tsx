import { notFound } from "next/navigation";
import { Can } from "@/components/shell";
import { ExtensionPage } from "@/components/extension-page";
export default async function Page({
  params,
}: {
  params: Promise<{ pluginId: string; routeId: string }>;
}) {
  const { pluginId, routeId } = await params;
  if (!/^[a-z][a-z0-9-]{0,47}$/.test(pluginId) || !/^[a-z][a-z0-9-]{0,47}$/.test(routeId))
    notFound();
  return (
    <Can capability="plugins">
      <ExtensionPage pluginId={pluginId} routeId={routeId} />
    </Can>
  );
}
