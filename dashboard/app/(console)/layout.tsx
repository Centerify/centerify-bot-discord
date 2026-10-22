import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { demoEnabled } from "@/lib/session";
import { Shell } from "@/components/shell";
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const demo = demoEnabled() && (await cookies()).has("centerify-demo");
  if (!demo) {
    const session = await auth();
    if (!session?.user?.id || new Date(session.expires).getTime() <= Date.now()) redirect("/login");
  }
  return <Shell>{children}</Shell>;
}
