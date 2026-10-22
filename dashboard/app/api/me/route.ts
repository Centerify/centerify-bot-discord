import { NextRequest, NextResponse } from "next/server";
import { identity, sameOrigin } from "@/lib/session";
import { bridge, ApiError } from "@/lib/bridge";
import { demoState } from "@/lib/demo";
import type { Account, Guild } from "@/lib/types";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    const user = await identity(req);
    if (user.demo) {
      const s = demoState(req.cookies.get("centerify-demo")!.value);
      return NextResponse.json(
        {
          user: { id: user.id, name: user.name, demo: true },
          guilds: s.guilds,
          account: s.account,
          installUrl: null,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const [installed, account] = await Promise.all([
      bridge<Guild[]>(user.id, "/v1/guilds"),
      bridge<Account>(user.id, "/v1/account"),
    ]);
    const guilds = [...installed];
    let after = "";
    for (let page = 0; page < 5; page++) {
      const response = await fetch(
        `https://discord.com/api/v10/users/@me/guilds?limit=200${after ? `&after=${after}` : ""}`,
        {
          headers: { Authorization: `Bearer ${user.accessToken}` },
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        },
      );
      if (response.status === 401)
        throw new ApiError(401, "Discord authorization expired. Sign in again.");
      if (!response.ok)
        throw new ApiError(
          response.status === 429 ? 429 : 503,
          "Discord could not return your servers. Please retry shortly.",
        );
      const discord = z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            icon: z.string().nullable(),
            permissions: z.string(),
            owner: z.boolean().optional(),
          }),
        )
        .parse(await response.json());
      for (const g of discord) {
        if (!guilds.some((i) => i.id === g.id) && (g.owner || (BigInt(g.permissions) & 40n) !== 0n))
          guilds.push({
            id: g.id,
            name: g.name,
            icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null,
            installed: false,
            verified: false,
            memberCount: 0,
            capabilities: [],
          });
      }
      if (discord.length < 200) break;
      after = discord.at(-1)!.id;
    }
    const id = process.env.AUTH_DISCORD_ID,
      installUrl = id
        ? `https://discord.com/oauth2/authorize?client_id=${id}&scope=bot%20applications.commands&permissions=0`
        : null;
    return NextResponse.json(
      { user: { id: user.id, name: user.name, demo: false }, guilds, account, installUrl },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof ApiError ? error.message : "Could not load your account" },
      { status: error instanceof ApiError ? error.status : 500 },
    );
  }
}
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    const user = await identity(req);
    const input = z
      .object({ theme: z.enum(["dark", "night", "light", "system"]) })
      .strict()
      .parse(await req.json());
    let account;
    if (user.demo) {
      account = demoState(req.cookies.get("centerify-demo")!.value).account;
      account.theme = input.theme;
    } else account = await bridge(user.id, "/v1/account", input);
    return NextResponse.json(account);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Account update failed" },
      { status: error instanceof ApiError ? error.status : 400 },
    );
  }
}
