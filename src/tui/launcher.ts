import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export type CodexLaunch = {
  command: string;
  args: string[];
  resolvedExecutable: string;
  platform: NodeJS.Platform;
  windowsVerbatimArguments?: boolean;
};

export function normalizeRepositoryCwd(cwd: string): string {
  return path.resolve(cwd);
}

export function selectWindowsCodexExecutable(whereOutput: string): string | undefined {
  const candidates = whereOutput
    .split(/\r?\n/)
    .map((candidate) => candidate.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);

  return candidates.find((candidate) => path.extname(candidate).toLowerCase() === ".exe")
    ?? candidates.find((candidate) => path.extname(candidate).toLowerCase() === ".cmd")
    ?? candidates.find((candidate) => path.extname(candidate).toLowerCase() === ".bat");
}

function findCodexOnPath(pathValue = process.env.PATH ?? ""): string | undefined {
  const names = ["codex.exe", "codex.cmd", "codex.bat"];
  const matches = pathValue
    .split(path.delimiter)
    .map((directory) => directory.trim().replace(/^"|"$/g, ""))
    .filter(Boolean)
    .flatMap((directory) => names.map((name) => path.join(directory, name)))
    .filter((candidate) => existsSync(candidate));

  return matches.find((candidate) => path.extname(candidate).toLowerCase() === ".exe")
    ?? matches.find((candidate) => path.extname(candidate).toLowerCase() === ".cmd")
    ?? matches.find((candidate) => path.extname(candidate).toLowerCase() === ".bat");
}

function whereCodex(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("where.exe", ["codex"], { windowsHide: true }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

export function createCodexLaunch(
  resolvedExecutable: string,
  platform: NodeJS.Platform = process.platform,
  comSpec = process.env.ComSpec ?? process.env.COMSPEC ?? "cmd.exe",
): CodexLaunch {
  const extension = path.extname(resolvedExecutable).toLowerCase();
  if (platform === "win32" && (extension === ".cmd" || extension === ".bat")) {
    const commandLine = `""${resolvedExecutable.replaceAll('"', '""')}" app-server --stdio"`;
    return {
      command: comSpec,
      args: ["/d", "/s", "/c", commandLine],
      resolvedExecutable,
      platform,
      windowsVerbatimArguments: true,
    };
  }

  return {
    command: resolvedExecutable,
    args: ["app-server", "--stdio"],
    resolvedExecutable,
    platform,
  };
}

export async function resolveCodexLaunch(
  platform: NodeJS.Platform = process.platform,
): Promise<CodexLaunch> {
  if (platform !== "win32") return createCodexLaunch("codex", platform);

  let resolvedExecutable: string | undefined;
  try {
    resolvedExecutable = selectWindowsCodexExecutable(await whereCodex());
  } catch {
    // Some managed Windows environments restrict where.exe directory enumeration.
  }
  resolvedExecutable ??= findCodexOnPath();
  if (!resolvedExecutable) {
    throw new Error("where.exe codex did not return a supported .exe, .cmd, or .bat executable");
  }
  return createCodexLaunch(resolvedExecutable, platform);
}

export function appServerStartupError(error: unknown, cwd: string, launch?: CodexLaunch): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(
    `Codex App Server unavailable: ${message} `
      + `(resolved executable: ${launch?.resolvedExecutable ?? "unresolved"}; platform: ${process.platform}; cwd: ${cwd})`,
  );
}
