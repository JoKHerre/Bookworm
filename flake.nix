{
  description = "Bookworm development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "aarch64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAllSystems (
        pkgs:
        let
          postgresql = pkgs.postgresql_16;

          # Local Postgres helpers. Data lives in ./.pgdata (gitignored).
          db-start = pkgs.writeShellScriptBin "db-start" ''
            set -e
            # TCP only: macOS caps Unix socket paths at 103 bytes, which deep repo paths exceed.
            PG_OPTS="-k ''' -c listen_addresses=localhost"
            if [ ! -d "$PGDATA" ]; then
              echo "Initializing database cluster in $PGDATA"
              initdb --auth=trust --username=postgres --no-locale --encoding=UTF8 "$PGDATA" > /dev/null
              pg_ctl start -l "$PGDATA/postgres.log" -o "$PG_OPTS"
              psql -h localhost -U postgres -c "CREATE USER bookworm WITH PASSWORD 'bookworm';"
              psql -h localhost -U postgres -c "CREATE DATABASE bookworm OWNER bookworm;"
            else
              pg_ctl status > /dev/null || pg_ctl start -l "$PGDATA/postgres.log" -o "$PG_OPTS"
            fi
            echo "Postgres running: $DATABASE_URL"
          '';

          db-stop = pkgs.writeShellScriptBin "db-stop" ''
            pg_ctl stop
          '';
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.nodejs_24
              pkgs.typescript
              pkgs.pnpm
              postgresql
              db-start
              db-stop
            ];

            shellHook = ''
              export PGDATA="$PWD/.pgdata"
              export PGHOST=localhost
              export DATABASE_URL="postgres://bookworm:bookworm@localhost:5432/bookworm"
              echo "Bookworm dev shell: node $(node --version), $(postgres --version)"
              echo "Run 'db-start' to start Postgres and 'db-stop' to stop it."
            '';
          };
        }
      );
    };
}
