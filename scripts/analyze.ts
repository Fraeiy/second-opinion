import { readFileSync } from "node:fs";
import { runSkillWorkflow } from "../src/lib/skill-workflow";
try {
  const path = process.argv[2];
  if (!path) throw new Error("Usage: npm run risk:analyze -- <input.json|->");
  const raw = readFileSync(path === "-" ? 0 : path, "utf8");
  console.log(JSON.stringify(runSkillWorkflow(JSON.parse(raw.replace(/^\uFEFF/, ""))), null, 2));
} catch (error) {
  // Never echo input payloads, account values or credentials in errors.
  console.error(JSON.stringify({ executionLabel: "blocked", orderSubmitted: false,
    error: error instanceof Error && error.name !== "ZodError" ? error.message : "Invalid risk input schema" }));
  process.exitCode = 1;
}
