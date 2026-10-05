#!/usr/bin/env bash
# Capture the images already running in production and pin them for one M2
# cutover session. This script never pulls, builds, pushes, or restarts.
set -Eeuo pipefail

api_container="${M2_API_CONTAINER:-phoenix-v3-api}"
web_container="${M2_WEB_CONTAINER:-phoenix-v3-web}"
expected_api_revision="${M2_EXPECTED_API_REVISION:-}"
expected_web_revision="${M2_EXPECTED_WEB_REVISION:-}"

usage() {
  cat >&2 <<'EOF'
Usage: capture-m2-image-baseline.sh [options]

Options:
  --expected-api-revision REV   Require the API image OCI revision to match REV.
  --expected-web-revision REV   Require the Web image OCI revision to match REV.
EOF
}

fail() {
  printf 'ERROR: M2 image baseline: %s\n' "$*" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --expected-api-revision)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      expected_api_revision="$2"
      shift 2
      ;;
    --expected-web-revision)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      expected_web_revision="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage
      exit 2
      ;;
  esac
done

command -v docker >/dev/null 2>&1 || fail "docker is unavailable"

capture_image() {
  local container="$1"
  local expected_revision="$2"
  local image_id revision

  image_id="$(docker inspect --type container --format '{{.Image}}' "$container" 2>/dev/null)" \
    || fail "cannot inspect running container $container"
  [ -n "$image_id" ] || fail "container $container has no image ID"
  case "$image_id" in
    sha256:*) ;;
    *) fail "container $container returned an invalid image ID: $image_id" ;;
  esac

  revision="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$image_id" 2>/dev/null)" \
    || fail "cannot inspect image labels for $container ($image_id)"
  case "$revision" in
    ''|'<no value>') fail "image $image_id for $container has no OCI revision label" ;;
  esac
  printf '%s' "$revision" | grep -Eq '^[0-9a-fA-F]{7,64}$' \
    || fail "image $image_id for $container has an invalid OCI revision: $revision"
  if [ -n "$expected_revision" ] && [ "$revision" != "$expected_revision" ]; then
    fail "$container revision $revision does not match expected $expected_revision"
  fi

  printf '%s\n%s\n' "$image_id" "$revision"
}

tag_image() {
  local image_id="$1"
  local tag="$2"
  local existing_id tagged_id

  existing_id="$(docker image inspect --format '{{.Id}}' "$tag" 2>/dev/null || true)"
  if [ -n "$existing_id" ] && [ "$existing_id" != "$image_id" ]; then
    fail "temporary tag $tag already points to $existing_id, expected $image_id"
  fi
  docker tag "$image_id" "$tag" || fail "cannot create local tag $tag"
  tagged_id="$(docker image inspect --format '{{.Id}}' "$tag" 2>/dev/null)" \
    || fail "cannot verify local tag $tag"
  [ "$tagged_id" = "$image_id" ] || fail "local tag $tag points to $tagged_id, expected $image_id"
}

mapfile -t api_capture < <(capture_image "$api_container" "$expected_api_revision")
mapfile -t web_capture < <(capture_image "$web_container" "$expected_web_revision")
[ "${#api_capture[@]}" -eq 2 ] || fail "unexpected API image capture output"
[ "${#web_capture[@]}" -eq 2 ] || fail "unexpected Web image capture output"

api_image_id="${api_capture[0]}"
api_revision="${api_capture[1]}"
web_image_id="${web_capture[0]}"
web_revision="${web_capture[1]}"
api_tag="phoenix-m2-api:baseline-${api_revision,,}"
web_tag="phoenix-m2-web:baseline-${web_revision,,}"

tag_image "$api_image_id" "$api_tag"
tag_image "$web_image_id" "$web_tag"

printf 'API_RUNNING_IMAGE_ID=%q\n' "$api_image_id"
printf 'API_RUNNING_REVISION=%q\n' "$api_revision"
printf 'WEB_RUNNING_IMAGE_ID=%q\n' "$web_image_id"
printf 'WEB_RUNNING_REVISION=%q\n' "$web_revision"
printf 'M2_API_IMAGE=%q\n' "$api_tag"
printf 'M2_WEB_IMAGE=%q\n' "$web_tag"
printf 'M2_API_IMAGE_PINNED=YES\n'
printf 'M2_WEB_IMAGE_PINNED=YES\n'
printf 'NO_LATEST_IMAGE_USAGE=YES\n'
