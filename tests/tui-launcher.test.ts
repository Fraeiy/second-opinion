import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCodexLaunch, normalizeRepositoryCwd, selectWindowsCodexExecutable } from "@/tui/launcher";

describe("Codex App Server launcher", () => {
  it("prefers a native Windows executable from where.exe output", () => {
    const output = [
      String.raw`C:\Users\trader\AppData\Roaming\npm\codex.cmd`,
      String.raw`C:\Program Files\Codex\codex.exe`,
    ].join("\r\n");

    expect(selectWindowsCodexExecutable(output)).toBe(String.raw`C:\Program Files\Codex\codex.exe`);
  });

  it("launches a Windows cmd shim through ComSpec with piped-RPC arguments intact", () => {
    const executable = String.raw`C:\Users\trader\AppData\Roaming\npm\codex.cmd`;
    const launch = createCodexLaunch(executable, "win32", String.raw`C:\Windows\System32\cmd.exe`);

    expect(launch).toEqual({
      command: String.raw`C:\Windows\System32\cmd.exe`,
      args: ["/d", "/s", "/c", `""${executable}" app-server --stdio"`],
      resolvedExecutable: executable,
      platform: "win32",
      windowsVerbatimArguments: true,
    });
  });

  it("keeps Unix launch support direct and shell-free", () => {
    expect(createCodexLaunch("codex", "linux")).toEqual({
      command: "codex",
      args: ["app-server", "--stdio"],
      resolvedExecutable: "codex",
      platform: "linux",
    });
  });

  it("normalizes the repository working directory to an absolute platform path", () => {
    const normalized = normalizeRepositoryCwd(".");
    expect(normalized).toBe(path.resolve("."));
    expect(path.isAbsolute(normalized)).toBe(true);
    if (process.platform === "win32") expect(normalized).toMatch(/^[A-Za-z]:\\/);
  });
});
