#!/bin/sh
(
set -eu

# Runs only on the first initialization of the PostgreSQL data volume.
# The bot and migration job never receive the PostgreSQL superuser password.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 --set=app_password="$CENTERIFY_DB_PASSWORD" <<'SQL'
CREATE ROLE centerify LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'app_password';
ALTER DATABASE centerify OWNER TO centerify;
GRANT ALL ON SCHEMA public TO centerify;
SQL
)
