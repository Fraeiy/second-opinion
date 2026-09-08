import { readFileSync } from "node:fs";
import Link from "next/link";
export default function Install() {
  const instructions = readFileSync("docs/INSTALL.md", "utf8");
  return <main className="app-shell">
    <Link href="/">← Second Opinion</Link>
    <h1>Install the portable safety skill</h1>
    <p>Binance authentication stays in Codex CLI or Claude Code. This website is a simulated demo.</p>
    <pre style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, maxWidth: 960 }}>{instructions}</pre>
    <Link href="/repository">GitHub repository</Link>
  </main>;
}
