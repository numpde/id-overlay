#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./scripts/docker-release-checks.sh --install
  ./scripts/docker-release-checks.sh

Options:
  --install      Run npm ci inside the toolchain container. This needs network.
  --check        Run contained release checks. This is the default.
  --build        Build the Docker image before running the selected action.
  --no-build     Reuse the existing Docker image.
  -h, --help     Show this help.

Environment:
  ID_OVERLAY_DOCKER_IMAGE   Docker image tag to build/run.
                             Default: id-overlay-toolchain:node22
  ID_OVERLAY_DOCKER_INSTALL_IMAGE
                             Docker image tag for the npm-install stage.
                             Default: ${ID_OVERLAY_DOCKER_IMAGE}-install
EOF
}

root_dir="$(cd "$(dirname "$0")/.." && pwd)"
image="${ID_OVERLAY_DOCKER_IMAGE:-id-overlay-toolchain:node22}"
install_image="${ID_OVERLAY_DOCKER_INSTALL_IMAGE:-${image}-install}"
mode="check"
build_image="auto"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --install)
      mode="install"
      ;;
    --check)
      mode="check"
      ;;
    --build)
      build_image="1"
      ;;
    --no-build)
      build_image="0"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if [ "$build_image" = "auto" ]; then
  if [ "$mode" = "install" ]; then
    build_image="1"
  else
    build_image="0"
  fi
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required for contained release checks." >&2
  exit 1
fi

build_check_image() {
  docker build --target id_overlay_check -t "$image" -f "$root_dir/Dockerfile" "$root_dir"
}

build_install_image() {
  docker build --target id_overlay_install -t "$install_image" -f "$root_dir/Dockerfile" "$root_dir"
}

if [ "$build_image" = "1" ]; then
  if [ "$mode" = "install" ]; then
    build_install_image
  fi
  build_check_image
elif ! docker image inspect "$image" >/dev/null 2>&1; then
  cat >&2 <<EOF
Docker image not found: $image

Run:
  ./scripts/docker-release-checks.sh --install

Or build the image without installing dependencies:
  ./scripts/docker-release-checks.sh --build
EOF
  exit 1
fi

if [ "$mode" = "install" ] && ! docker image inspect "$install_image" >/dev/null 2>&1; then
  cat >&2 <<EOF
Docker install image not found: $install_image

Run:
  ./scripts/docker-release-checks.sh --install --build
EOF
  exit 1
fi

common_run_options=(
  --rm
  --init
  --user "$(id -u):$(id -g)"
  --cap-drop ALL
  --security-opt no-new-privileges:true
  --read-only
  --pids-limit 256
  --memory 1g
  --memory-swap 1g
  --env HOME=/tmp/home
  --env npm_config_cache=/tmp/npm-cache
  --env npm_config_update_notifier=false
  --env npm_config_progress=false
  --mount "type=bind,src=${root_dir},dst=/work"
  --workdir /work
)

case "$mode" in
  install)
    docker run \
      "${common_run_options[@]}" \
      --env npm_config_audit=false \
      --env npm_config_fund=false \
      --env npm_config_ignore_scripts=true \
      --tmpfs /tmp:rw,nosuid,nodev,noexec,size=1024m \
      "$install_image" \
      npm ci --ignore-scripts --no-audit --fund=false
    ;;
  check)
    docker run \
      "${common_run_options[@]}" \
      --network none \
      --tmpfs /tmp:rw,nosuid,nodev,noexec,size=512m \
      "$image" \
      bash ./scripts/release-checks.sh
    ;;
esac
