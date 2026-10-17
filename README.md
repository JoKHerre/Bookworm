# Bookworm

A React + Vite frontend with an Express backend and a PostgreSQL database.

## Prerequisites

- [Node.js](https://nodejs.org/) 24 or newer (the backend runs TypeScript directly via Node's type stripping)
- [pnpm](https://pnpm.io/installation)
- [PostgreSQL](https://www.postgresql.org/) 16 or newer

Both the frontend (repo root) and the backend (`server/`) use pnpm. Don't commit `package-lock.json` or `yarn.lock`.

## Setup

```bash
git clone <repo-url>
cd Bookworm
```

### Database

#### Option A: Nix

With [Nix](https://nixos.org/download/) flakes enabled, the dev shell provides Node.js, pnpm, TypeScript and PostgreSQL 16, and sets `DATABASE_URL` for you:

```bash
nix develop
db-start
```

The first `db-start` creates the `bookworm` user and database, with data stored in `.pgdata/` (gitignored). Later runs just start Postgres on `localhost:5432`. Stop it with `db-stop`.

With [direnv](https://direnv.net/), run `direnv allow` once and the shell loads automatically

Then skip ahead to [Install and run](#install-and-run).

#### Option B: Native Postgres

Install and start Postgres.

macOS (Homebrew):

```bash
brew install postgresql@16
brew services start postgresql@16
```

Ubuntu / Debian:

```bash
sudo apt update && sudo apt install postgresql
sudo service postgresql start
```

Then create the user and database (macOS: `psql postgres`; Linux: `sudo -u postgres psql`):

```sql
CREATE USER bookworm WITH PASSWORD 'bookworm';
CREATE DATABASE bookworm OWNER bookworm;
```

Check the connection:

```bash
psql postgres://bookworm:bookworm@localhost:5432/bookworm -c 'SELECT 1;'
```

#### Option C: Docker

```bash
docker run --name bookworm-db -e POSTGRES_USER=bookworm -e POSTGRES_PASSWORD=bookworm -e POSTGRES_DB=bookworm -p 5432:5432 -d postgres:16
```

### Install and run

```bash
pnpm install
pnpm --dir server install
```

Outside the Nix shell, create the backend's env file. The defaults match the database above:

```bash
cp server/.env.example server/.env
```

Create the tables, then start everything:

```bash
pnpm --dir server db:push
pnpm dev:all
```

- Frontend: <http://localhost:5173>
- API: <http://localhost:3001> 

## Database schema

Tables are defined in [`server/src/db/schema.ts`](server/src/db/schema.ts) with [Drizzle ORM](https://orm.drizzle.team/). After editing the schema, or after pulling someone else's schema changes, sync your local database:

```bash
pnpm --dir server db:push
```

`db:push` diffs `schema.ts` against your database and applies the changes directly, with no migration files. It asks for confirmation before anything that would delete data.

## Scripts

From the repo root:

| Command           | Description                                  |
| ----------------- | -------------------------------------------- |
| `pnpm dev:all`    | Run the backend and frontend together        |
| `pnpm dev`        | Run only the Vite dev server                 |
| `pnpm dev:server` | Run only the Express server                  |
| `pnpm build`      | Build the frontend into `dist/`              |
| `pnpm preview`    | Preview the production build                 |
| `pnpm lint`       | Run ESLint                                   |
| `pnpm typecheck`  | Type-check the frontend and backend          |

From `server/` (or `pnpm --dir server <script>` from the root):

| Command          | Description                                  |
| ---------------- | -------------------------------------------- |
| `pnpm dev`       | Run the API, restarting on file changes      |
| `pnpm start`     | Run the API without watching                 |
| `pnpm typecheck` | Type-check the backend                       |
| `pnpm db:push`   | Sync the database with `schema.ts`           |
| `pnpm db:studio` | Open Drizzle Studio to browse the database   |
