# Design Principles

Follow these principles when making development decisions in this project.

## 1. Keep core business logic independent from UI and external services

- Domain code (packing, parsing, sorting) must live in plain TypeScript modules, decoupled from frameworks and integrations.
- Domain modules (`src/domain/**`) must not import from `src/ui` or `src/services`; enforce this boundary with lint rules where practical, not just code review.
- UI code handles rendering, state orchestration, and user interaction only.
- Service code handles external integrations (e.g. Scryfall) only.

## 2. Prefer Carbon-first UI decisions

- Default to IBM Carbon components, tokens, and interaction patterns.
- Prefer Carbon spacing, typography, and color tokens over custom styling.
- Treat deviations from Carbon as explicit, justified tradeoffs, not accidental drift.

## 3. Follow idiomatic modern Vue and TypeScript conventions

- Use `<script setup>` with the Composition API for all Vue components; do not use the Options API.
- Never use `any`. Use `unknown` plus explicit narrowing (type guards, validation) instead, including at boundaries that parse external input (CSV rows, Scryfall JSON).
- Use TypeScript to improve safety, clarity, and maintainability, not just satisfy the compiler.
- Treat non-idiomatic patterns as conscious, justified exceptions.

## 4. Test business behavior, not just implementation

- Prioritize tests for packing rules, parsing outcomes, sorting behavior, and edge cases.
- Weight test effort toward domain logic over thin UI wiring.
- Use coverage as a signal, not a goal.

## 5. Normalize input data to Scryfall conventions before applying business logic

- Translate external input into Scryfall-aligned names, set codes, and identifiers via `src/domain/sets.ts` (`normalizeInventorySet`, `normalizeSetName`) before any other domain logic runs.
- Use a single canonical representation once data enters the domain layer.
- Do not spread format-translation rules across packing, sorting, or other downstream logic.

## 6. Use descriptive names throughout the codebase

- Prefer names that communicate business meaning over implementation detail.
- Avoid abbreviations, acronyms, and single-letter variable names.
- Never shorten a name if it reduces clarity.

## 7. Prefer established design patterns when they fit the problem

- Prefer well-known patterns (including Gang of Four patterns) over inventing custom approaches, when they clarify responsibilities and collaboration.
- Use patterns to simplify reasoning, not to add ceremony.
- Apply patterns intentionally; do not force them where they don't fit.

## 8. Handle errors loudly and explicitly

- Domain and service code should throw clear, descriptive errors for invalid or unexpected input (malformed CSV rows, missing Scryfall data) rather than silently defaulting or swallowing failures.
- UI code should catch these errors at the boundary and surface them to the user clearly.
- Do not use silent fallbacks that hide bad data or broken assumptions.

## 9. Design for large datasets from the start

- Packing, sorting, and parsing logic should scale to large inventories and the full Scryfall card/set dataset without significant slowdown.
- Prefer indexed lookups (e.g. maps keyed by id) over repeated linear scans.
- Treat performance regressions on large datasets as bugs, not acceptable tradeoffs.
