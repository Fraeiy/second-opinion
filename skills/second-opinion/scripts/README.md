# Client helpers

The portable skill delegates validation and scoring to the repository command:
`npm run --silent risk:analyze -- <input.json|->`. Compatible agents should use
the shared `risk-policy.json`, `src/lib/skill-workflow.ts`, and `src/lib/risk-engine.ts`.
