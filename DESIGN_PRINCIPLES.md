# Design Principles

This document captures the current design principles for this project and should guide future development decisions.

## 1. Keep core business logic independent from UI and external services

Packing, parsing, sorting, and other domain rules should live in plain TypeScript modules with minimal framework or integration coupling.

- UI code should focus on rendering, state orchestration, and user interaction.
- Service code should focus on external integrations such as Scryfall.
- Domain code should own the application's business rules and transformations.

## 2. Prefer Carbon-first UI decisions

Use IBM Carbon components, tokens, and interaction patterns by default. Exceptions are allowed, but they should be intentional and justified.

- Prefer Carbon components over custom UI when they meet the need.
- Prefer Carbon spacing, typography, and color tokens where possible.
- Treat deviations from Carbon as explicit tradeoffs, not accidental drift.

## 3. Follow idiomatic modern Vue and TypeScript conventions

Default to current, idiomatic Vue 3 and TypeScript patterns unless there is a strong reason not to.

- Prefer standard Vue composition patterns over ad hoc alternatives.
- Use TypeScript in ways that improve safety, clarity, and maintainability.
- Treat non-idiomatic patterns as conscious exceptions.

## 4. Test business behavior, not just implementation

Unit tests should protect important business behavior and rules, not merely increase coverage metrics.

- Prioritize tests for packing rules, parsing outcomes, sorting behavior, and edge cases.
- Focus test effort more heavily on domain logic than on thin UI wiring.
- Use coverage as a signal, not as the primary goal.
