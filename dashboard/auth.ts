import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { bridge } from "./lib/bridge";
export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: Boolean(process.env.AUTH_URL),
  providers: [
    Discord({
      clientId: process.env.AUTH_DISCORD_ID ?? "",
      clientSecret: process.env.AUTH_DISCORD_SECRET ?? "",
      authorization: { params: { scope: "identify guilds" } },
      checks: ["pkce", "state"],
    }),
  ],
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        const id = account.providerAccountId;
        await bridge(id, "/v1/account", { name: profile?.name ?? token.name ?? "Discord member" });
        token.sub = id;
        token.discordAccessToken = account.access_token;
        token.discordExpiresAt = account.expires_at ?? Math.floor(Date.now() / 1000) + 3600;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.id = token.sub ?? "";
      return {
        ...session,
        expires: new Date(
          Math.min(new Date(session.expires).getTime(), Number(token.discordExpiresAt) * 1000),
        ).toISOString(),
      };
    },
    redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      return new URL(url).origin === baseUrl ? url : baseUrl;
    },
  },
  logger: {
    error() {
      console.error(
        "Discord authentication failed. Check provider settings and the internal bridge.",
      );
    },
  },
});
