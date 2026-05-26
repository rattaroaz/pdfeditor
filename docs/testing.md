# Testing

## Frontend (Vitest)

```bash
npm run test
npm run test:coverage
```

- Tests live next to source (`*.test.ts`) or under `src/test/`
- Tauri APIs are mocked in `src/test/setup.ts`
- Use `@testing-library/react` for component tests

## Rust

```bash
cd src-tauri && cargo test
```

## E2E (planned)

Playwright + WebDriver for Tauri will be added in a later phase. Smoke-test manually:

1. Open a multi-page PDF
2. Highlight and draw annotations
3. Save and reopen — annotations restore from sidecar
4. Search text and navigate matches

## Coverage target

≥80% on frontend business logic (`src/lib`, `src/stores`, `src/services`).
