# Bookworm

A React + Vite frontend with an Express backend and a PostgreSQL database.

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) 24 or newer. The backend runs TypeScript directly with Node's built-in type stripping.
- [pnpm](https://pnpm.io/installation), e.g. `npm install -g pnpm`
- [Git](https://git-scm.com/)
- [PostgreSQL](https://www.postgresql.org/) 16 or newer

This project uses **pnpm** for both the frontend (repo root) and the backend (`server/`). Please don't commit `package-lock.json` or `yarn.lock` files.

### 1. Clone the repository

```bash
git clone <repo-url>
cd Bookworm
```

### Quick setup with Nix (optional)

If you have [Nix](https://nixos.org/download/) with flakes enabled, `flake.nix` provides Node.js 24, pnpm, TypeScript and PostgreSQL 16. Use it and you can skip steps 2, 3 and the `.env` file in step 4:

```bash
nix develop
```

```bash
db-start
```

Then continue at [step 4](#4-install-dependencies-and-set-up-the-database).

`db-start` sets up a local database the first time you run it. The data is stored in `.pgdata/` in the repo, which is gitignored. It creates the `bookworm` user and database, then starts Postgres on `localhost:5432`. The shell sets `DATABASE_URL` for you. Run `db-stop` to stop Postgres.

If you use [direnv](https://direnv.net/), the included `.envrc` loads the dev shell automatically when you `cd` into the repo. Run `direnv allow` once to enable it.

The flake supports macOS on Apple Silicon and Linux (x86_64 and aarch64). Intel Macs aren't supported because nixpkgs no longer builds for them.

Without Nix, follow the steps below.

### 2. Install PostgreSQL

Choose one option.

**macOS (Homebrew)**

```bash
brew install postgresql@16
brew services start postgresql@16
```

If `psql` isn't found afterwards, add Homebrew's Postgres to your PATH:

```bash
echo 'export PATH="$(brew --prefix postgresql@16)/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
```

**Ubuntu / Debian / WSL**

```bash
sudo apt update && sudo apt install postgresql
sudo service postgresql start
```

**Windows**

Download the installer from [postgresql.org/download/windows](https://www.postgresql.org/download/windows/). It installs the server and `psql` and asks you to set a password for the `postgres` user.

**Docker (any OS)**

```bash
docker run --name bookworm-db -e POSTGRES_USER=bookworm -e POSTGRES_PASSWORD=bookworm -e POSTGRES_DB=bookworm -p 5432:5432 -d postgres:16
```

If you use Docker, the database and user already exist, so skip step 3.

### 3. Create the database and user

Open a Postgres shell:

- macOS (Homebrew): `psql postgres`
- Linux: `sudo -u postgres psql`
- Windows: open "SQL Shell (psql)" from the Start menu

Then run:

```sql
CREATE USER bookworm WITH PASSWORD 'bookworm';
CREATE DATABASE bookworm OWNER bookworm;
\q
```

Check that you can connect:

```bash
psql postgres://bookworm:bookworm@localhost:5432/bookworm -c 'SELECT 1;'
```

### 4. Install dependencies and set up the database

Install dependencies for the frontend and the backend:

```bash
pnpm install
```

```bash
pnpm --dir server install
```

If you're not using the Nix shell, create the backend's `.env` file from the example. The defaults match the database from step 3:

```bash
cp server/.env.example server/.env
```

Create the tables from the schema:

```bash
pnpm --dir server db:push
```

### 5. Run the app

Start the backend and frontend together:

```bash
pnpm dev:all
```

- Frontend: <http://localhost:5173>
- API: <http://localhost:3001> (check it with <http://localhost:3001/api/health>)

In development, Vite forwards every request under `/api` to the Express server. Frontend code should therefore call relative URLs like `fetch('/api/books')` rather than `http://localhost:3001/...`. This avoids CORS issues and lets session cookies work.

You can also run the two halves in separate terminals with `pnpm dev:server` and `pnpm dev`.

> **macOS note:** the API uses port 3001 because macOS's AirPlay Receiver occupies port 5000.

### Changing the database schema

Tables are defined in TypeScript in [`server/src/db/schema.ts`](server/src/db/schema.ts) using [Drizzle ORM](https://orm.drizzle.team/). After editing the schema, or after pulling teammates' schema changes, sync your local database:

```bash
pnpm --dir server db:push
```

`db:push` compares `schema.ts` with your database and applies the difference directly; there are no migration files. If a change would delete data (for example dropping or renaming a column), it asks you to confirm first.

### Useful scripts

From the repo root:

| Command           | What it does                              |
| ----------------- | ----------------------------------------- |
| `pnpm dev:all`    | Start the backend and frontend together   |
| `pnpm dev`        | Start only the Vite dev server            |
| `pnpm dev:server` | Start only the Express server             |
| `pnpm build`      | Build the frontend into `dist/`           |
| `pnpm preview`    | Preview the production build              |
| `pnpm lint`       | Run ESLint                                |

From `server/` (or with `pnpm --dir server <script>` from the root):

| Command            | What it does                                        |
| ------------------ | --------------------------------------------------- |
| `pnpm dev`         | Start the API and restart it on file changes        |
| `pnpm start`       | Start the API without watching                      |
| `pnpm typecheck`   | Type-check the backend with `tsc`                   |
| `pnpm db:push`     | Sync the database with `schema.ts`                  |
| `pnpm db:studio`   | Open Drizzle Studio to browse the database          |

---

## About the Vite template

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

### React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

### Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
