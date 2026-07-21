import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe.runIf(platform() === "darwin")("MCP dogfood installer", () => {
  it("installs the allowlisted host and registers the stdio server in Codex", async () => {
    const temporaryHome = await mkdtemp(join(tmpdir(), "tabnexus-installer-"));
    const fakeBin = join(temporaryHome, "bin");
    const codexLog = join(temporaryHome, "codex.log");
    await mkdir(fakeBin, { recursive: true });
    const fakeCodex = join(fakeBin, "codex");
    await writeFile(fakeCodex, "#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$CODEX_LOG\"\n", "utf8");
    await chmod(fakeCodex, 0o755);

    const child = spawn(process.execPath, [
      resolve("scripts/install-native-host.mjs"),
      "--extension-id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "--codex"
    ], {
      env: {
        ...process.env,
        HOME: temporaryHome,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        CODEX_LOG: codexLog
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { output += chunk; });
    const code = await new Promise<number | null>((resolveClose, reject) => {
      child.once("error", reject);
      child.once("close", resolveClose);
    });
    expect(code).toBe(0);
    expect(output).toContain("Registered TabNexus in Codex");

    const manifest = JSON.parse(await readFile(join(
      temporaryHome,
      "Library",
      "Application Support",
      "Google",
      "Chrome",
      "NativeMessagingHosts",
      "com.tabnexus.bridge.json"
    ), "utf8"));
    expect(manifest).toMatchObject({
      name: "com.tabnexus.bridge",
      type: "stdio",
      allowed_origins: ["chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/"]
    });
    const calls = await readFile(codexLog, "utf8");
    expect(calls).toContain("mcp remove tabnexus");
    expect(calls).toContain("mcp add tabnexus --");
    expect(calls).toContain("agent/bridge/tabnexus-mcp.mjs");

    await rm(temporaryHome, { recursive: true, force: true });
  });
});
