import { afterEach, expect, test, vi } from "vitest";
import { readCommandAttachment } from "../../../src/services/customCommands/CustomCommandImport.js";
import { CUSTOM_COMMAND_LIMITS as L } from "../../../src/lib/customCommands/constants.js";
const attachment = {
  name: "commands.json",
  size: 100,
  url: "https://cdn.discordapp.com/attachments/123/456/commands.json",
};
afterEach(() => vi.unstubAllGlobals());
test("imports only Discord-hosted bounded attachments and refuses redirects", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response('{"version":1,"commands":[]}'));
  vi.stubGlobal("fetch", fetch);
  expect(await readCommandAttachment(attachment as never)).toContain(
    '"version":1',
  );
  expect(fetch).toHaveBeenCalledWith(
    expect.any(URL),
    expect.objectContaining({
      redirect: "error",
      signal: expect.any(AbortSignal),
    }),
  );
  for (const patch of [
    { url: "https://127.0.0.1/attachments/a" },
    { url: "file:///etc/passwd" },
    { url: "https://cdn.discordapp.com.evil.test/attachments/a" },
    { url: "https://cdn.discordapp.com/other/a" },
    { size: L.importBytes + 1 },
    { name: "commands.exe" },
  ])
    await expect(
      readCommandAttachment({ ...attachment, ...patch } as never),
    ).rejects.toThrow();
  expect(fetch).toHaveBeenCalledOnce();
});
test("the downloaded stream is bounded independently of reported attachment size", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(new Uint8Array(L.importBytes + 1))),
  );
  await expect(readCommandAttachment(attachment as never)).rejects.toThrow(
    "too large",
  );
});
