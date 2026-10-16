Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

For user-facing bugs and workflows:

- Define the expected sequence from the user's perspective, including what appears after each action and what the server must accept.
- Reproduce the reported state with the same route, role, data, and action before changing code. Inspect the full UI state when a screenshot shows only part of the page.
- Trace the behavior across callers, props and their runtime defaults, render conditions, async state, API requests, and backend authorization. An explanation must account for the observed behavior before you edit.
- Add a focused regression check for the failure when practical, then verify the requested behavior in the running UI when available. A passing build or API test does not prove that a control is visible or usable.
- If direct UI verification is unavailable, state exactly what was verified and what remains unverified. Do not present an inferred UI outcome as confirmed.

## 5. Engineering principles

- Read the relevant existing code before making changes.
- Implement the smallest complete solution to the requested task.
- Follow existing project conventions.
- Do not add speculative features, dependencies, or abstractions.
- Keep unrelated code and formatting unchanged.
- Ask when ambiguity materially affects scope or behavior.
  Otherwise, proceed with a reasonable assumption and report it.
- Verify the changed behavior with appropriate checks.
- Report what changed, what was verified, and any remaining limitations.

## 6. Document Editor Development

For work on `/documents/{guid}/edit`, read `PRD-kop-footer-editor-frontend.md` and the backend's `PRD-editor-dokumen-backend.md` before changing the editor workflow. Confirm the backend API contract in code; a PRD proposal is not proof that an endpoint or field already exists.

- Keep the document title, letterhead image, Tiptap body, and footer image as distinct UI sections. Letterhead and footer are optional draft data, not Tiptap body blocks. Users prepare their own images; do not add cropping. Enforce the agreed 1200 px maximum image width.
- Treat the generated PDF preview as the source of truth for page count, page numbers, letterhead/footer placement, and signature positions. Do not infer final page boundaries from Tiptap height. Add an explicit page break control only when the backend accepts and renders that block.
- Let letterhead and footer each target all pages or selected page ranges. Validate input visibly, preserve unsaved changes, and do not silently discard invalid or out-of-range selections.
- Follow the existing draft revision, autosave, conversion polling, and preview invalidation flow. When backend processing finishes, update the editor or preview automatically; users should not need to click **Periksa status versi**. Never use a stale preview for signature placement or publishing.
- Check editor content against what the backend can save and render. Complex tables, images inside cells, and imported layouts must produce a clear limitation/error until both sides support them. Do not present a Tiptap rendering as a guarantee of PDF fidelity.
- Treat imported DOCX/PDF images as body content unless the backend explicitly identifies them as letterhead/footer candidates and the user confirms their use.
- For this editor work, respect the user's request to avoid `git diff` and `npm run type-check` unless they ask for either. Do not add tests when the user has expressly excluded them for the task.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
