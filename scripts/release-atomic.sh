#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ACTION="${1:-dry-run}"
REQUESTED_REVISION="${2:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${VESSEL_ROOT:-/root/.openclaw/workspace/Vessel_tracking}"
RELEASE_ROOT="${VESSEL_RELEASE_ROOT:-/var/lib/vessel-tracking/app}"
RELEASES_DIR="$RELEASE_ROOT/releases"
CURRENT_LINK="$RELEASE_ROOT/current"
PREVIOUS_LINK="$RELEASE_ROOT/previous"
MANIFEST_DIR="$RELEASE_ROOT/manifests"
BACKUP_DIR="${VESSEL_BACKUP_DIR:-/var/lib/vessel-tracking/backups}"
DEDICATED_PM2_HOME="/var/lib/vessel-tracking/pm2"
PM2_HOME="${PM2_HOME:-$DEDICATED_PM2_HOME}"
BACKEND_ENV_FILE="${VESSEL_BACKEND_ENV_FILE:-/etc/vessel-tracking/vessel-tracking.env}"
VESSEL_LOG_DIR="${VESSEL_LOG_DIR:-/var/log/vessel-tracking}"
PG_CONTAINER="${PG_CONTAINER:-vessel_tracking-postgres-1}"
PG_USER="${PG_USER:-vessel_user}"
PG_DATABASE="${PG_DATABASE:-vessel_tracking}"
PM2_BIN="${PM2_BIN:-pm2}"
RELEASE_GATE_SCRIPT="$SCRIPT_DIR/release-gates.mjs"
CANONICAL_EXTERNAL_URL="https://vessel.ttacom.net"
LOCAL_BASE_URL="http://127.0.0.1:5173"

workspace=""
switched=0
old_current=""
old_previous=""
target_release=""
candidate_sha=""
backup_file="none"
backup_checksum="none"
migration_status="not-started"
smoke_status="not-run"
manifest_path=""
failure_handled=0

usage() {
  printf 'Usage: %s [dry-run|deploy|rollback] [candidate-revision]\n' "$0" >&2
  printf 'Deploy requires APPROVE_RELEASE=YES; rollback requires APPROVE_ROLLBACK=YES.\n' >&2
}

case "$ACTION" in
  dry-run|deploy|rollback) ;;
  *) usage; exit 64 ;;
esac

resolve_link() {
  local link="$1"
  if [[ -L "$link" ]]; then readlink -f "$link"; fi
}

assert_release_target() {
  local target="$1"
  [[ -n "$target" && -d "$target" ]] || { printf 'Missing release target: %s\n' "$target" >&2; return 1; }
  case "$target" in
    "$RELEASES_DIR"/*) ;;
    *) printf 'Refusing target outside versioned releases: %s\n' "$target" >&2; return 1 ;;
  esac
}

atomic_link() {
  local target="$1" link="$2" temporary="${2}.new.$$"
  rm -f "$temporary"
  ln -s "$target" "$temporary"
  if ! mv -Tf "$temporary" "$link"; then
    rm -f "$temporary"
    return 1
  fi
}

pm2_vessel() {
  env -i \
    PATH="$PATH" \
    PM2_HOME="$PM2_HOME" \
    VESSEL_BACKEND_ENV_FILE="$BACKEND_ENV_FILE" \
    VESSEL_LOG_DIR="$VESSEL_LOG_DIR" \
    "$PM2_BIN" "$@"
}

require_pm2_maintenance_approval() {
  local reason="$1"
  if [[ "${VESSEL_PM2_MAINTENANCE_OVERRIDE:-}" != "YES" ]]; then
    printf '%s; set VESSEL_PM2_MAINTENANCE_OVERRIDE=YES only in an approved maintenance window.\n' "$reason" >&2
    return 1
  fi
  if [[ "${APPROVE_PM2_MAINTENANCE:-}" != "YES" ]]; then
    printf '%s; separate approval APPROVE_PM2_MAINTENANCE=YES is required.\n' "$reason" >&2
    return 1
  fi
  printf 'WARNING: approved PM2 maintenance override: %s\n' "$reason" >&2
}

assert_pm2_scope() {
  local inventory unexpected
  if [[ "$PM2_HOME" != "$DEDICATED_PM2_HOME" ]]; then
    require_pm2_maintenance_approval \
      "Refusing non-dedicated PM2_HOME '$PM2_HOME' (required: '$DEDICATED_PM2_HOME')"
  fi

  # A first invocation can spawn the PM2 daemon. Without --silent PM2 writes
  # coloured startup banners to stdout before the JSON inventory.
  inventory="$(pm2_vessel jlist --silent)"
  unexpected="$(printf '%s' "$inventory" | node -e '
let input = "";
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  const apps = JSON.parse(input);
  if (!Array.isArray(apps)) throw new Error("PM2 jlist did not return an array");
  const allowed = new Set(["vessel-backend", "vessel-frontend"]);
  const names = [...new Set(apps.map((app) => String(app?.name || "<unnamed>"))
    .filter((name) => !allowed.has(name)))];
  process.stdout.write(names.join(","));
});
')"
  if [[ -n "$unexpected" ]]; then
    require_pm2_maintenance_approval "Unexpected PM2 inventory entries: $unexpected"
  fi
}

run_legacy_baseline_preflight() {
  local probe domain_table_count migrations_table_exists baseline_succeeded="f"
  probe="$(docker exec "$PG_CONTAINER" psql -X -v ON_ERROR_STOP=1 \
    -U "$PG_USER" -d "$PG_DATABASE" -At -F $'\t' -c '
SELECT
  count(*)::integer,
  (to_regclass('"'"'public."_prisma_migrations"'"'"') IS NOT NULL)
FROM information_schema.tables
WHERE table_schema = '"'"'public'"'"'
  AND table_type = '"'"'BASE TABLE'"'"'
  AND table_name IN (
    '"'"'Vessel'"'"', '"'"'Position'"'"', '"'"'Incident'"'"', '"'"'Port'"'"',
    '"'"'Account'"'"', '"'"'VesselAccount'"'"', '"'"'SystemConfig'"'"', '"'"'ApiUsage'"'"',
    '"'"'ZoneEvent'"'"', '"'"'SharedView'"'"', '"'"'ShippingLane'"'"'
  );')"
  IFS=$'\t' read -r domain_table_count migrations_table_exists <<< "$probe"
  if [[ "$migrations_table_exists" == "t" ]]; then
    baseline_succeeded="$(docker exec "$PG_CONTAINER" psql -X -v ON_ERROR_STOP=1 \
      -U "$PG_USER" -d "$PG_DATABASE" -At -c '
SELECT EXISTS (
  SELECT 1 FROM "_prisma_migrations"
  WHERE migration_name = '"'"'20260715100000_baseline'"'"'
    AND finished_at IS NOT NULL
    AND rolled_back_at IS NULL
);')"
  fi
  printf '%s\t%s\t%s\n' "$domain_table_count" "$migrations_table_exists" "$baseline_succeeded" \
    | node "$RELEASE_GATE_SCRIPT" baseline
}

write_manifest() {
  local result="$1" timestamp
  [[ -d "$MANIFEST_DIR" ]] || return 0
  timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  manifest_path="$MANIFEST_DIR/${timestamp//[:]/-}_${candidate_sha}_${ACTION}.manifest"
  {
    printf 'timestamp=%s\n' "$timestamp"
    printf 'action=%s\n' "$ACTION"
    printf 'result=%s\n' "$result"
    printf 'candidate_sha=%s\n' "$candidate_sha"
    printf 'release_path=%s\n' "$target_release"
    printf 'previous_target=%s\n' "${old_current:-none}"
    printf 'backup_path=%s\n' "$backup_file"
    printf 'backup_sha256=%s\n' "$backup_checksum"
    printf 'migration_status=%s\n' "$migration_status"
    printf 'smoke_results=%s\n' "$smoke_status"
  } > "$manifest_path"
  chmod 0600 "$manifest_path"
}

activate_current() {
  local expected="$1"
  [[ "$(resolve_link "$CURRENT_LINK")" == "$expected" ]] || {
    printf 'current symlink does not resolve to expected target\n' >&2
    return 1
  }
  pm2_vessel startOrReload "$CURRENT_LINK/ecosystem.config.cjs" --update-env
  env -i \
    PATH="$PATH" \
    PM2_HOME="$PM2_HOME" \
    VESSEL_BACKEND_ENV_FILE="$BACKEND_ENV_FILE" \
    VESSEL_DB_WAIT_MAX_MS="${VESSEL_DB_WAIT_MAX_MS:-120000}" \
    EXPECTED_RELEASE_PATH="$expected" \
    BASE_URL="$LOCAL_BASE_URL" \
    EXTERNAL_URL="$CANONICAL_EXTERNAL_URL" \
    "$CURRENT_LINK/scripts/production-smoke.sh"
  pm2_vessel save
}

restore_after_failure() {
  if [[ "$failure_handled" == "1" ]]; then return 0; fi
  failure_handled=1
  trap - ERR
  trap '' INT TERM HUP
  set +e
  if [[ "$switched" == "1" ]]; then
    if [[ -n "$old_current" ]]; then
      atomic_link "$old_current" "$CURRENT_LINK"
    else
      rm -f "$CURRENT_LINK"
    fi
    if [[ -n "$old_previous" ]]; then
      atomic_link "$old_previous" "$PREVIOUS_LINK"
    else
      rm -f "$PREVIOUS_LINK"
    fi
    if [[ -n "$old_current" ]]; then
      activate_current "$old_current"
    else
      pm2_vessel delete vessel-backend vessel-frontend
      pm2_vessel save
    fi
    smoke_status="failed-restored-previous"
  else
    smoke_status="failed-before-activation"
  fi
  write_manifest "failed"
  switched=0
}

cleanup_workspace() {
  [[ -n "$workspace" ]] && rm -rf "$workspace"
  return 0
}

on_error() {
  local code=$?
  restore_after_failure
  cleanup_workspace
  printf 'Release failed (exit %s); current was restored when activation had begun.\n' "$code" >&2
  exit "$code"
}

on_signal() {
  local signal="$1" code="$2"
  restore_after_failure
  cleanup_workspace
  printf 'Release interrupted by %s (exit %s); current was restored when activation had begun.\n' "$signal" "$code" >&2
  exit "$code"
}
trap on_error ERR
trap 'on_signal INT 130' INT
trap 'on_signal TERM 143' TERM
trap 'on_signal HUP 129' HUP
trap cleanup_workspace EXIT

[[ -d "$ROOT/.git" || -f "$ROOT/.git" ]] || { printf 'VESSEL_ROOT is not a Git worktree\n' >&2; exit 66; }
for command in git npm npx docker "$PM2_BIN" curl sha256sum tar readlink node env install chmod; do
  command -v "$command" >/dev/null
 done

old_current="$(resolve_link "$CURRENT_LINK")"
old_previous="$(resolve_link "$PREVIOUS_LINK")"

if [[ "$ACTION" == "rollback" ]]; then
  target_release="$old_previous"
  assert_release_target "$target_release"
  [[ "$target_release" != "$old_current" ]] || { printf 'Refusing rollback to the active release.\n' >&2; exit 67; }
  candidate_sha="$(<"$target_release/.vessel-release-sha")"
elif [[ "$ACTION" == "deploy" ]]; then
  if [[ -n "$(git -C "$ROOT" status --porcelain)" ]]; then
    printf 'Refusing release from a dirty worktree; commit and review the candidate first.\n' >&2
    exit 66
  fi
  if [[ ! "$REQUESTED_REVISION" =~ ^[[:xdigit:]]{40}$ ]]; then
    printf 'Real deploy requires a full 40-hex immutable commit SHA.\n' >&2
    exit 64
  fi
  candidate_sha="$(git -C "$ROOT" rev-parse --verify "$REQUESTED_REVISION^{commit}")"
  if [[ "$candidate_sha" != "${REQUESTED_REVISION,,}" ]]; then
    printf 'Requested SHA does not resolve exactly to the reviewed commit.\n' >&2
    exit 66
  fi
  git -C "$ROOT" cat-file -e "$candidate_sha^{commit}"
  target_release="$RELEASES_DIR/$candidate_sha"
else
  if [[ -n "$(git -C "$ROOT" status --porcelain)" ]]; then
    printf 'Refusing release from a dirty worktree; commit and review the candidate first.\n' >&2
    exit 66
  fi
  candidate_sha="$(git -C "$ROOT" rev-parse --verify "${REQUESTED_REVISION:-HEAD}^{commit}")"
  git -C "$ROOT" cat-file -e "$candidate_sha^{commit}"
  target_release="$RELEASES_DIR/$candidate_sha"
fi

[[ "$candidate_sha" =~ ^[[:xdigit:]]{40}$ ]] || {
  printf 'Release metadata does not contain a full 40-hex commit SHA.\n' >&2
  exit 66
}

if [[ "$ACTION" == "dry-run" ]]; then
  printf 'DRY RUN (no filesystem, database, PM2, or network changes)\n'
  printf 'candidate_sha=%s\nrelease_path=%s\ncurrent_target=%s\nprevious_target=%s\n' \
    "$candidate_sha" "$target_release" "${old_current:-none}" "${old_previous:-none}"
  printf 'plan=preflight -> isolated candidate build/test -> migration plan -> verified backup -> migrate deploy -> readiness -> atomic current switch -> vessel-only PM2 reload -> smoke -> pm2 save -> manifest\n'
  exit 0
fi

if [[ "$ACTION" == "deploy" && "${APPROVE_RELEASE:-}" != "YES" ]]; then
  printf 'Refusing deploy without APPROVE_RELEASE=YES\n' >&2
  exit 65
fi
if [[ "$ACTION" == "rollback" && "${APPROVE_ROLLBACK:-}" != "YES" ]]; then
  printf 'Refusing rollback without APPROVE_ROLLBACK=YES\n' >&2
  exit 65
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  DATABASE_URL="$(
    cd "$SCRIPT_DIR/../backend"
    VESSEL_BACKEND_ENV_FILE="$BACKEND_ENV_FILE" node --input-type=module -e '
import { loadBackendEnv } from "./wait-for-db.js";
const databaseUrl = loadBackendEnv().DATABASE_URL;
if (!databaseUrl) process.exit(65);
process.stdout.write(databaseUrl);
'
  )"
  export DATABASE_URL
fi
if [[ -z "${VESSEL_DB_WAIT_MAX_MS:-}" && -f "$BACKEND_ENV_FILE" ]]; then
  VESSEL_DB_WAIT_MAX_MS="$(
    cd "$SCRIPT_DIR/../backend"
    VESSEL_BACKEND_ENV_FILE="$BACKEND_ENV_FILE" node --input-type=module -e '
import { loadBackendEnv } from "./wait-for-db.js";
process.stdout.write(loadBackendEnv().VESSEL_DB_WAIT_MAX_MS || "120000");
'
  )"
  export VESSEL_DB_WAIT_MAX_MS
fi
[[ -n "${DATABASE_URL:-}" ]] || { printf 'DATABASE_URL is required\n' >&2; exit 65; }
assert_pm2_scope

# All command, source, cleanliness, approval, target, and environment checks above
# happen before versioned-release, backup, database, symlink, or PM2 side effects.
workspace="$(mktemp -d -t vessel-release.XXXXXX)"
install -d -m 0700 "$RELEASES_DIR" "$MANIFEST_DIR" "$BACKUP_DIR"

if [[ "$ACTION" == "deploy" && ! -d "$target_release" ]]; then
  stage="$workspace/release"
  mkdir -p "$stage"
  git -C "$ROOT" archive "$candidate_sha" | tar -x -C "$stage"
  printf '%s\n' "$candidate_sha" > "$stage/.vessel-release-sha"

  npm --prefix "$stage/backend" ci
  npm --prefix "$stage/frontend" ci
  npm --prefix "$stage/backend" test
  npm --prefix "$stage/frontend" test
  npm --prefix "$stage/frontend" run build
  npm --prefix "$stage/frontend" prune --omit=dev --no-save
  (cd "$stage/backend" && npx prisma validate && npx prisma generate)
  npm --prefix "$stage/backend" run auth:migrate:dry-run
  printf '%s\n' "$candidate_sha" > "$stage/.vessel-readiness"

  node "$RELEASE_GATE_SCRIPT" migrations "$stage/backend/prisma/migrations"
  run_legacy_baseline_preflight
  # Read-only migration plan must complete before the first database backup/write.
  (cd "$stage/backend" && npx prisma migrate diff \
    --from-schema-datasource prisma/schema.prisma \
    --to-schema-datamodel prisma/schema.prisma \
    --script > "$workspace/migration-plan.sql")
  migration_status="planned"
else
  assert_release_target "$target_release"
  [[ -f "$target_release/.vessel-release-sha" ]]
  [[ "$(<"$target_release/.vessel-release-sha")" == "$candidate_sha" ]]
  [[ -f "$target_release/.vessel-readiness" ]]
  [[ "$(<"$target_release/.vessel-readiness")" == "$candidate_sha" ]]
  [[ -f "$target_release/frontend/dist/index.html" ]]
  [[ -f "$target_release/frontend/server.mjs" ]]
  [[ -f "$target_release/backend/prisma/schema.prisma" ]]
  [[ -d "$target_release/backend/node_modules/@prisma/client" ]]
  [[ -f "$target_release/ecosystem.config.cjs" ]]
  [[ -x "$target_release/scripts/production-smoke.sh" ]]
  if [[ "$ACTION" == "deploy" ]]; then
    node "$RELEASE_GATE_SCRIPT" migrations "$target_release/backend/prisma/migrations"
    run_legacy_baseline_preflight
  fi
  (cd "$target_release/backend" && npx prisma migrate diff \
    --from-schema-datasource prisma/schema.prisma \
    --to-schema-datamodel prisma/schema.prisma \
    --script > "$workspace/migration-plan.sql")
  migration_status="planned-no-down-migration"
fi

timestamp="$(date -u +%Y%m%d_%H%M%S)"
backup_file="$BACKUP_DIR/vessel_tracking_${timestamp}_${ACTION}.dump"
docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DATABASE" -Fc > "$backup_file"
chmod 0600 "$backup_file"
test -s "$backup_file"
docker exec -i "$PG_CONTAINER" pg_restore -l < "$backup_file" > "${backup_file}.manifest"
chmod 0600 "${backup_file}.manifest"
test -s "${backup_file}.manifest"
read -r backup_checksum _ < <(sha256sum "$backup_file")
[[ "$backup_checksum" =~ ^[[:xdigit:]]{64}$ ]]

if [[ "$ACTION" == "deploy" ]]; then
  if [[ ! -d "$target_release" ]]; then mv "$stage" "$target_release"; fi
  (cd "$target_release/backend" && npx prisma migrate deploy)
  migration_status="deployed"
else
  migration_status="not-applied-rollback"
fi

# Tests/build/Prisma validation above are the candidate readiness gate. current is
# changed only after that gate and the verified backup have both passed.
switched=1
if [[ -n "$old_current" ]]; then atomic_link "$old_current" "$PREVIOUS_LINK"; fi
atomic_link "$target_release" "$CURRENT_LINK"
activate_current "$target_release"
smoke_status="passed"
write_manifest "success"
switched=0
printf '%s completed: candidate=%s current=%s manifest=%s\n' \
  "$ACTION" "$candidate_sha" "$target_release" "$manifest_path"
