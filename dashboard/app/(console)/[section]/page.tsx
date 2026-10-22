import { notFound } from "next/navigation";
import { Can } from "@/components/shell";
import { MembersPage } from "@/components/members";
import { ModerationPage } from "@/components/moderation";
import { TicketsPage } from "@/components/tickets";
import { CommandsPage } from "@/components/commands";
import { SettingsPage } from "@/components/settings";
import { PluginsPage } from "@/components/plugins";
import { BuilderPage } from "@/components/builder";
import { ActivityPage } from "@/components/activity";
import { AccountPage } from "@/components/account";
export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  switch (section) {
    case "members":
      return (
        <Can capability="moderation">
          <MembersPage />
        </Can>
      );
    case "moderation":
      return (
        <Can capability="moderation">
          <ModerationPage />
        </Can>
      );
    case "tickets":
      return (
        <Can capability="tickets">
          <TicketsPage />
        </Can>
      );
    case "commands":
      return (
        <Can capability="commands">
          <CommandsPage />
        </Can>
      );
    case "settings":
      return (
        <Can capability="settings">
          <SettingsPage />
        </Can>
      );
    case "plugins":
      return (
        <Can capability="plugins">
          <PluginsPage />
        </Can>
      );
    case "builder":
      return (
        <Can capability="commands">
          <BuilderPage />
        </Can>
      );
    case "audit":
      return (
        <Can capability="settings">
          <ActivityPage />
        </Can>
      );
    case "account":
      return <AccountPage />;
    default:
      notFound();
  }
}
