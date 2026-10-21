# Frontend (Next.js + shadcn/ui)

```bash
pnpm install
cp .env.example .env.local   # BACKEND_URL, default http://localhost:8000
pnpm dev                     # http://localhost:3000
```

`/api/*` is proxied to the FastAPI backend (see `next.config.ts`), so the httpOnly auth cookie is first-party.

| path | folder |
|---|---|
| login / register | `src/app/(auth)` |
| customer portal | `src/app/portal`, `src/components/portal` |
| review queue, team queue, tickets, ticket workspace (MDXEditor draft editor) | `src/app/app/{inbox,team,tickets}`, `src/components/tickets` |
| admin console | `src/app/app/admin`, `src/components/admin` |
| shared: API client, types (mirror `docs/api-contract.md`), hooks, badges, data table | `src/lib`, `src/components/shared`, `src/components/shell` |

Checks: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`.
