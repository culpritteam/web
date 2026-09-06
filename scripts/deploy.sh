#!/usr/bin/env bash
# Safe deploy script for the VPS. Pulls a prebuilt image from GHCR and switches the running
# container to it — never builds, never runs npm/prisma generate/compilation of any kind.
#
# Usage:
#   ./scripts/deploy.sh sha-abc1234   # recommended for production — immutable, reproducible
#   ./scripts/deploy.sh latest        # convenience tag, floats to the newest main-branch build
#
# Run from the directory that holds docker-compose.production.yml and .env.production (typically
# the deploy checkout on the VPS, e.g. /opt/culprit-web).
#
# Fails safe: if the new container doesn't pass its healthcheck within the timeout, the previous
# image is restored and the script exits non-zero. It never leaves the server without a running
# container.

set -euo pipefail

COMPOSE_FILE="docker-compose.production.yml"
ENV_FILE=".env.production"
# Read-only Doppler service token for this environment's config, one line, chmod 600. Optional —
# see step 1b.
DOPPLER_TOKEN_FILE=".doppler-token"
SERVICE="app"
REGISTRY="ghcr.io"
IMAGE_REPO="${IMAGE_REPO:-ghcr.io/wyco68/culpritweb}"
HEALTH_TIMEOUT_SECS=90
HEALTH_POLL_INTERVAL=3

log() { printf '[deploy] %s\n' "$1"; }
die() {
  printf '[deploy] ERROR: %s\n' "$1" >&2
  exit 1
}

# ---- 1. Validate input ---------------------------------------------------------------------
IMAGE_TAG="${1:-}"
[ -n "$IMAGE_TAG" ] || die "usage: $0 <image-tag>  (e.g. sha-abc1234 or latest)"

[ -f "$COMPOSE_FILE" ] || die "$COMPOSE_FILE not found — run this from the deploy directory."

# ---- 1b. Refresh runtime config from Doppler, if this box is wired to it --------------------
# Opt-in: drop a read-only Doppler service token for this environment's config into
# $DOPPLER_TOKEN_FILE and every deploy regenerates $ENV_FILE from Doppler, so a rotated secret
# takes effect on the next deploy instead of needing a hand-edit on the box. Without that file
# nothing changes — $ENV_FILE stays the hand-managed file it has always been.
#
# CI still never sends secrets here: the token is bootstrapped once by hand and the VPS pulls its
# own config. --fallback keeps an encrypted copy of the last successful fetch, so a Doppler
# outage degrades to "deploy with the previous values" instead of failing or, worse, writing an
# empty env file over a working one.
if [ -f "$DOPPLER_TOKEN_FILE" ]; then
  command -v doppler >/dev/null 2>&1 || die "$DOPPLER_TOKEN_FILE exists but the Doppler CLI is not installed."
  log "refreshing $ENV_FILE from Doppler"
  DOPPLER_TOKEN="$(tr -d '
' < "$DOPPLER_TOKEN_FILE")"
  export DOPPLER_TOKEN
  TMP_ENV="$(mktemp)"
  # `docker` format is KEY=value with no quoting — what compose's env_file expects.
  if doppler secrets download --no-file --format docker        --fallback ".doppler-fallback.json" > "$TMP_ENV" && [ -s "$TMP_ENV" ]; then
    install -m 600 "$TMP_ENV" "$ENV_FILE"
    log "$ENV_FILE refreshed ($(wc -l < "$TMP_ENV" | tr -d ' ') vars)"
  else
    [ -f "$ENV_FILE" ] || die "Doppler fetch failed and there is no existing $ENV_FILE to fall back on."
    log "WARNING: Doppler fetch failed — deploying with the existing $ENV_FILE"
  fi
  rm -f "$TMP_ENV"
fi

[ -f "$ENV_FILE" ] || die "$ENV_FILE not found — copy .env.example and fill in real values, or add $DOPPLER_TOKEN_FILE."

command -v docker >/dev/null 2>&1 || die "docker is not installed."
docker compose version >/dev/null 2>&1 || die "docker compose plugin is not installed."

TARGET_IMAGE="${IMAGE_REPO}:${IMAGE_TAG}"
log "target image: $TARGET_IMAGE"

# ---- 2. Registry access ---------------------------------------------------------------------
if ! docker system info >/dev/null 2>&1; then
  die "docker daemon is not reachable."
fi
log "checking registry access (assumes prior 'docker login $REGISTRY' if the package is private)"

# ---- 3. Capture current image for rollback, before touching anything -----------------------
PREVIOUS_IMAGE="$(docker compose -f "$COMPOSE_FILE" images -q "$SERVICE" 2>/dev/null || true)"
if [ -n "$PREVIOUS_IMAGE" ]; then
  PREVIOUS_IMAGE_TAG="$(docker inspect --format '{{index .RepoTags 0}}' "$PREVIOUS_IMAGE" 2>/dev/null || echo "$PREVIOUS_IMAGE")"
  log "current running image: $PREVIOUS_IMAGE_TAG (kept for rollback)"
else
  PREVIOUS_IMAGE_TAG=""
  log "no currently running container found (first deploy) — nothing to roll back to"
fi

# ---- 4. Pull the requested image ------------------------------------------------------------
log "pulling $TARGET_IMAGE"
if ! IMAGE_TAG="$IMAGE_TAG" IMAGE_REPO="$IMAGE_REPO" docker compose -f "$COMPOSE_FILE" pull "$SERVICE"; then
  die "pull failed for $TARGET_IMAGE — aborting before touching the running container."
fi

# ---- 5. Verify the image actually exists locally now -----------------------------------------
docker image inspect "$TARGET_IMAGE" >/dev/null 2>&1 || die "image $TARGET_IMAGE not present after pull."

# ---- 6. Start/update the container -----------------------------------------------------------
log "starting $TARGET_IMAGE"
IMAGE_TAG="$IMAGE_TAG" IMAGE_REPO="$IMAGE_REPO" docker compose -f "$COMPOSE_FILE" up -d "$SERVICE"

# ---- 7. Wait for healthcheck -------------------------------------------------------------------
log "waiting up to ${HEALTH_TIMEOUT_SECS}s for healthcheck"
elapsed=0
status="starting"
while [ "$elapsed" -lt "$HEALTH_TIMEOUT_SECS" ]; do
  cid="$(docker compose -f "$COMPOSE_FILE" ps -q "$SERVICE")"
  [ -n "$cid" ] || die "container disappeared while waiting for health."
  status="$(docker inspect --format '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo "unknown")"
  [ "$status" = "healthy" ] && break
  [ "$status" = "unhealthy" ] && break
  sleep "$HEALTH_POLL_INTERVAL"
  elapsed=$((elapsed + HEALTH_POLL_INTERVAL))
done

# ---- 8. Verify or roll back ---------------------------------------------------------------------
if [ "$status" != "healthy" ]; then
  log "healthcheck did not pass (status: $status) — rolling back"
  if [ -n "$PREVIOUS_IMAGE_TAG" ]; then
    IMAGE_TAG="${PREVIOUS_IMAGE_TAG##*:}" IMAGE_REPO="${PREVIOUS_IMAGE_TAG%:*}" \
      docker compose -f "$COMPOSE_FILE" up -d "$SERVICE" \
      || die "rollback to $PREVIOUS_IMAGE_TAG also failed — manual intervention required."
    die "deploy of $TARGET_IMAGE failed healthcheck; rolled back to $PREVIOUS_IMAGE_TAG."
  else
    die "deploy of $TARGET_IMAGE failed healthcheck; no previous image to roll back to — server has no healthy container."
  fi
fi

log "deploy succeeded: $TARGET_IMAGE is healthy"

# ---- 9. Safe image cleanup ------------------------------------------------------------------
# Removes only dangling (untagged) layers. Deliberately does NOT prune tagged images — that would
# delete $PREVIOUS_IMAGE_TAG, the rollback target for the *next* deploy.
log "cleaning dangling images"
docker image prune -f >/dev/null 2>&1 || true

# ---- 10. Report -----------------------------------------------------------------------------
log "status: OK"
log "running: $TARGET_IMAGE"
[ -n "$PREVIOUS_IMAGE_TAG" ] && log "rollback available: $PREVIOUS_IMAGE_TAG (docker compose -f $COMPOSE_FILE up -d, with IMAGE_TAG set to its tag)"
