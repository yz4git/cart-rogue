#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

export VOXEL_RALLY_BUILD_ID="${VOXEL_RALLY_BUILD_ID:-${GITHUB_SHA:-$(git rev-parse --short HEAD 2>/dev/null || printf local)}}"

command -v timeout >/dev/null || {
  echo "build-verified.sh requires GNU timeout." >&2
  exit 69
}

vinext="${SITES_PROJECT_ROOT}/node_modules/.bin/vinext"
if [[ ! -x "${vinext}" ]]; then
  echo "vinext is unavailable. Run npm run install:ci and wait for it to finish before building." >&2
  exit 69
fi

echo "Running bounded vinext build..."
timeout \
  --signal=TERM \
  --kill-after="${SITES_BUILD_KILL_AFTER:-10s}" \
  "${SITES_BUILD_TIMEOUT:-3m}" \
  "${vinext}" build

# Vinext's Sites adapter packages this manifest in the normal Sites build,
# but the standalone verifier must make the same contract explicit. Keeping
# the copy here also makes local/CI builds deterministic.
hosting_manifest="${SITES_PROJECT_ROOT}/.openai/hosting.json"
if [[ -f "${hosting_manifest}" ]]; then
  mkdir -p "${SITES_PROJECT_ROOT}/dist/.openai"
  cp "${hosting_manifest}" "${SITES_PROJECT_ROOT}/dist/.openai/hosting.json"
fi

"${script_dir}/validate-artifact.sh"
