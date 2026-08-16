# Task for worker

You are a delegated subagent running from a fork of the parent session. Treat the inherited conversation as reference-only context, not a live thread to continue. Do not continue or answer prior messages as if they are waiting for a reply. Your sole job is to execute the task below and return a focused result for that task using your tools.

Task:
Implement the user's attached requirements directly in the existing project. You are the sole writer. First inspect the current architecture and preserve all existing auth/tenant isolation/Prisma SQLite/OpenRouter/Gmail SMTP/human approval/suppression/follow-up/duplicate-send/Global Pause/email editing behavior. Build a complete import system for CSV, XLSX and public Google Sheets with /leads/import multi-step UI, drag/drop, safe server-side parsing, mapping, preview, counts, validation, duplicate handling, limits, normalization, injection protection, and commit. Add a pragmatic premium responsive redesign across shell, dashboard, leads, import, lead/editor, settings, auth, follow-ups, with unified CSS design system, accessible/reduced-motion interactions, command palette and useful micro-interactions. Avoid unnecessary heavy animation dependencies; no real email sends. Add robust tests for import formats/security/mapping/limits/isolation and preserve all existing tests. Run typecheck, tests, lint, build, and safe smoke/E2E workflows; fix failures. Report exact files/dependencies/results and residual risks. Do not expose or alter credentials. Use the scout/planner/reviewer findings in the inherited context, especially current import gaps and safety invariants.

## Acceptance Contract
Acceptance level: verified
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Implement the requested change without widening scope
- criterion-2: Return evidence sufficient for an independent acceptance review

Required evidence: changed-files, tests-added, commands-run, validation-output, residual-risks, no-staged-files

Review gate: required by reviewer.

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
`criteriaSatisfied[].status` must be exactly one of: satisfied, not-satisfied, not-applicable.
`commandsRun[].result` must be exactly one of: passed, failed, not-run.
`manualNotes` and `notes` are optional strings; an empty string means no note and does not satisfy `manual-notes` evidence.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    },
    {
      "id": "criterion-2",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```