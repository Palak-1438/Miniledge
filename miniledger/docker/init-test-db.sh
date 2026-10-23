#!/bin/sh
# Runs once when the Postgres volume is first created: adds an isolated database for automated tests.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -c "CREATE DATABASE miniledger_test OWNER \"$POSTGRES_USER\";"
