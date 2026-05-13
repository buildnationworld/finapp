# PesaPilot AI

> **An AI Financial Operating System for emerging-market mobile money.**
> Not a budgeting app. PesaPilot turns M-Pesa, Airtel Money, Equity, and KCB
> SMS into structured intelligence — a multi-agent system that categorizes,
> forecasts, flags fraud, and answers questions with **cited transactions**,
> not hallucinated numbers.

This is a hackathon build, deliberately scoped to one surface (web PWA), one
region (Kenya / KES), and four agents. The architecture leaves seams for the
larger spec (Android, browser extension, WhatsApp/Telegram, voice, OCR,
multi-region), but those are not implemented here. See **Cut from spec** below.

---

## What's inside

| Surface          | Status |
| ---------------- | ------ |
| Landing + login  | ✅ |
| SMS import + parser preview | ✅ |
| Transactions UI  | ✅ |
| AI insights + audit log | ✅ |
| Dashboard + charts | ✅ |
| Fraud + forecast | ✅ |
| Copilot chat | ✅ |
| PDF reports      | ✅ |
| CSV/PDF/OCR ingestion | ⏳ Next step |

## Architecture

Single Next.js 15 App Router app, with API route handlers and the agent runtime
living in the same process. The brief asked for NestJS / Express; we chose one
service because doubling the deploy surface buys nothing for a hackathon.

```
Browser  ─►  Next.js 15 (App Router)
              ├── /(marketing)       Landing
              ├── /login             Credentials sign-in
              └── /(app)             Authenticated shell
                  ├── /dashboard     KPIs, charts, insights
                  ├── /import        SMS paste + parser preview
                  ├── /transactions  Filterable table + drawer
                  ├── /copilot       Streaming chat w/ tool-use
                  ├── /insights      Fraud + forecast feed
                  ├── /reports       PDF export
                  └── /audit         Glass-box agent decisions
                  ▲
                  │  Server Actions / Route Handlers
                  ▼
          Agent runtime  (src/lib/agents/*)
            ├── Extraction      regex-first SMS normalization
            ├── Categorization  heuristic financial taxonomy
            ├── Fraud           duplicate + round-number anomaly rules
            └── Forecast        moving-average spend projection
                  ▲
                  │
          ┌───────┴───────┐
       Postgres 16          Redis
       + pgvector            (BullMQ queue)
```

### Multi-agent design

Every agent returns `{ result, confidence, explanation, modelId, latencyMs }`
and the orchestrator persists this to the `AuditLog` table. That single
discipline is how the brief's "Governance & Explainability Agent" is realized
— the **/audit** page reads the log and renders the trail. No black-box AI.

### LLM stack

- **Gemini 2.5 Flash** (free tier) for all agent reasoning and the copilot
- **Gemini embeddings** (`gemini-embedding-001`, 768 dims) into pgvector for RAG
- Provider abstraction in `src/lib/llm/gemini.ts` so swapping to Groq / Ollama
  is a one-file change

---

## Run it

```bash
# Prereqs: Node 20+, Docker, a free Gemini API key
# https://aistudio.google.com/app/apikey

cp .env.example .env
# paste your GEMINI_API_KEY into .env

npm install
npm run docker:up                  # postgres + pgvector + redis
npm run db:migrate -- --name init  # creates schema + vector extension
npm run db:seed                    # demo user + categories

npm run dev
```

Open <http://localhost:3000>, sign in with:

- **Email**: `demo@pesapilot.ai`
- **Password**: `demo1234`

### Useful scripts

| Script            | What it does                          |
| ----------------- | -------------------------------------- |
| `npm run dev`     | Next.js dev server with Turbopack     |
| `npm run build`   | Production build                       |
| `npm run test`    | Vitest — SMS parser regression checks  |
| `npm run lint`    | Biome lint + format check              |
| `npm run db:studio` | Prisma Studio                        |
| `npm run db:reset` | Wipe + re-migrate + re-seed           |
| `npm run docker:up` / `:down` | Postgres + Redis stack    |

---

## Stack

- **Framework** — Next.js 15 (App Router, React 19, TypeScript)
- **UI** — Tailwind, shadcn primitives, Framer Motion, Recharts, Lucide
- **Auth** — Auth.js v5 (NextAuth), credentials + JWT sessions
- **DB** — Postgres 16 + pgvector (Docker), Prisma ORM
- **Queue** — Redis + BullMQ (agent jobs land async on import)
- **LLM** — `@google/genai` → Gemini 2.5 Flash + Gemini embeddings
- **PDF** — `@react-pdf/renderer` (in-process, no headless browser)
- **Lint** — Biome
- **Tests** — Vitest

---

## Cut from the spec (and why)

These were in the brief but are deliberately not built for the hackathon
demo. The architecture leaves seams to add them; each line below is a "next
step", not a bug:

| Cut                              | Where the seam is |
| -------------------------------- | ----------------- |
| Android native app               | Same backend API — wrap with React Native or Kotlin |
| Browser extension                | `/api/import/sms` already accepts batch SMS  |
| WhatsApp / Telegram bots         | Insights generated by agents — pipe to a webhook   |
| Voice assistant                  | Copilot endpoint already streams text — add Whisper + TTS |
| OCR receipts, invoice extraction | `ImportedDocument` + `ImportSource` enum ready     |
| Multi-region SMS (NG, GH)        | Parsers are pluggable in `src/lib/parsers/`        |
| OAuth providers (Google, etc.)   | Auth.js v5 supports — add provider in `auth.ts`    |
| Role-based access, SME tenants   | Single-user demo; would need `Organization` model  |
| Lending eligibility, SME dashboard | Belongs in a separate product surface            |

---

## Security & privacy

- All transaction data stays in your Postgres instance — no third-party data
  exfil. Gemini sees only the redacted text passed in agent prompts.
- Passwords are bcrypt-hashed at cost 10.
- Sessions are JWT, signed with `AUTH_SECRET`.
- The audit log records every prompt and response — there is no AI surface in
  the app that isn't traceable.

This is a demo — not yet hardened for production (no rate limits on the
copilot, no row-level security, no encryption at rest beyond Postgres
defaults). The hardening list lives in `docs/security.md` (TBD).

---

## License

Source-available for the hackathon. License TBD.
