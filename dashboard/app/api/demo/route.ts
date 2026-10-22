import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { demoEnabled, sameOrigin } from "@/lib/session";
export async function POST(req: NextRequest) {
  if (!demoEnabled()) return NextResponse.json({ error: "Demo mode is disabled" }, { status: 404 });
  try {
    sameOrigin(req);
  } catch {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("centerify-demo", randomUUID(), {
    httpOnly: true,
    sameSite: "strict",
    secure: new URL(req.url).protocol === "https:",
    maxAge: 8 * 3600,
    path: "/",
  });
  return res;
}
export async function DELETE(req: NextRequest) {
  try {
    sameOrigin(req);
  } catch {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("centerify-demo");
  return res;
}
