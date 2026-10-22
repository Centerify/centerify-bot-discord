import { signIn } from "@/auth";
import { demoEnabled } from "@/lib/session";
import { LoginDemo } from "@/components/login-demo";
import { ArrowUpRight, Check, Command, GitBranch, Shield, Ticket } from "lucide-react";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const configured = Boolean(
    process.env.AUTH_DISCORD_ID &&
    process.env.AUTH_DISCORD_SECRET &&
    process.env.AUTH_SECRET &&
    process.env.AUTH_URL,
  );
  return (
    <div className="login-page">
      <div className="login-brand brand">
        <span className="brand-mark">
          <span />
        </span>
        <span>centerify.</span>
      </div>
      <div className="login-grid">
        <div className="login-copy">
          <div className="eyebrow">
            <span className="status-dot" /> A GOOD PLACE FOR YOUR COMMUNITY
          </div>
          <h1>
            Less managing.
            <br />
            More <em>belonging.</em>
          </h1>
          <p>
            Your members, conversations, and little moments of connection. Bring it all together in
            one thoughtful workspace.
          </p>
          <div className="login-features">
            {[
              [Shield, "A safer community"],
              [Ticket, "Support that feels personal"],
              [GitBranch, "Your ideas, on autopilot"],
            ].map(([Icon, label]) => {
              const I = Icon as typeof Shield;
              return (
                <span key={String(label)}>
                  <I size={18} />
                  {String(label)}
                  <Check size={14} />
                </span>
              );
            })}
          </div>
          <div className="login-footnote">Built for Discord. Made for the people in it.</div>
        </div>
        <div className="login-card">
          <span className="login-symbol">
            <Command size={31} />
          </span>
          <h2>Welcome to your workspace.</h2>
          <p>Sign in with Discord to find your servers and make yourself at home.</p>
          {params.error && (
            <div className="notice notice-error" role="alert">
              Sign in could not complete. Check your Discord application, callback URL, and bot
              connection, then try again.
            </div>
          )}
          <form
            action={async () => {
              "use server";
              await signIn("discord", { redirectTo: "/" });
            }}
          >
            <button className="button button-primary discord-signin" disabled={!configured}>
              <svg
                width="21"
                height="18"
                viewBox="0 0 24 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M20 2a19 19 0 0 0-5-2l-.6 1.2a18 18 0 0 0-5 0L9 0a19 19 0 0 0-5 2C1 6 0 10 .4 14a20 20 0 0 0 6 3l1.1-1.8-1.7-.8.4-.3a14 14 0 0 0 11.6 0l.4.3-1.7.8 1.1 1.8a20 20 0 0 0 6-3C24 9 23 5 20 2ZM8 12c-1 0-1.8-.9-1.8-2S7 8 8 8s1.8.9 1.8 2S9 12 8 12Zm8 0c-1 0-1.8-.9-1.8-2S15 8 16 8s1.8.9 1.8 2S17 12 16 12Z" />
              </svg>
              Continue with Discord <ArrowUpRight size={17} />
            </button>
          </form>
          {!configured && (
            <p className="connection-hint">
              OAuth isn’t configured yet. Follow the dashboard setup guide to connect a Discord
              application.
            </p>
          )}
          {demoEnabled() && (
            <>
              <div className="login-divider">
                <span>or take a look around</span>
              </div>
              <LoginDemo />
            </>
          )}
          <div className="login-security">
            <Shield size={14} />
            <span>Secure sign in. We only request your identity and server list.</span>
          </div>
        </div>
      </div>
      <footer>
        Community management, with a human touch.<span>Centerify © {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}
