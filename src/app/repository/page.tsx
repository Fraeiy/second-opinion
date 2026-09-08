import { redirect } from "next/navigation";
import Link from "next/link";
export default function Repository() {
  const url = process.env.NEXT_PUBLIC_REPOSITORY_URL;
  if (url && /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(url)) redirect(url);
  return <main className="app-shell">
    <Link href="/">← Second Opinion</Link>
    <h1>Repository link awaiting configuration</h1>
    <p>This checkout has no configured GitHub remote. The publisher must set the actual repository URL before publication.</p>
    <Link href="/install">Installation instructions</Link>
  </main>;
}
