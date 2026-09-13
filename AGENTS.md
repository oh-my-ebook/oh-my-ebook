# Repository Guidelines

## Project Structure & Module Organization

This repository is a React 19 application using TypeScript and Vite. `src/main.tsx` mounts `src/App.tsx`; styles live in `src/index.css` and `src/App.css`. Keep imported images in `src/assets/` and static files served directly in `public/`. Colocate tests with source files, such as `src/App.test.tsx`; shared test setup lives in `src/test/setup.ts`. Build output goes to `dist/`, and coverage reports to `coverage/`. Spec Kit templates and scripts live in `.specify/`.

## Build, Test, and Development Commands

Use Node 24.x (pinned in `.node-version` and `.nvmrc`) and pnpm 12.4.1.

- `pnpm install --frozen-lockfile`: install locked dependencies and prepare Lefthook hooks.
- `pnpm dev`: start the Vite development server.
- `pnpm build`: type-check and produce the production bundle.
- `pnpm preview`: serve the built application locally.
- `pnpm check`: run formatting, lint, type, and unit-test checks.
- `pnpm test:watch`: run tests continuously during development.
- `pnpm test:coverage`: run tests with V8 coverage reports.
- `pnpm format` / `pnpm lint:fix`: apply formatting or lint fixes; review resulting changes.

## Coding Style & Naming Conventions

Use TypeScript and function components. Follow existing PascalCase component names (`App.tsx`) and camelCase variables and functions. Prettier uses two-space indentation, single quotes, no semicolons, trailing commas, LF endings, and a 100-character print width. Oxlint enforces React hook rules; warnings fail lint checks. Keep unused locals and parameters out of committed code.

## Testing Guidelines

Use Vitest with jsdom, React Testing Library, jest-dom, and user-event. Name tests `*.test.ts` or `*.test.tsx`. Test observable behavior through accessible queries and user interactions, following `src/App.test.tsx`. Run `pnpm test` for a single pass. CI collects coverage without a configured minimum threshold; add relevant regression tests for behavior changes.

## Commit & Pull Request Guidelines

Follow Conventional Commits: history includes `chore:`, `docs:`, and `ci:` with Korean descriptions. Commit headers and PR titles must pass commitlint and stay within 100 characters. Use `.github/pull_request_template.md`: describe the problem and resulting behavior, relevant decisions and limitations, and verification results. Remove instructional comments. Before requesting review, run `pnpm check`, `pnpm test:coverage`, and `pnpm build`.

## Security & Configuration

Use `.env.example` as the deployment configuration reference. Store Vercel credentials in GitHub Actions secrets and `VERCEL_DEPLOY_ENABLED` as a repository variable. Never commit credentials.
