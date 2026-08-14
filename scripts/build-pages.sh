#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd -- "${script_dir}/.." && pwd)"
cd "${project_root}"

export VOXEL_RALLY_BUILD_ID="${VOXEL_RALLY_BUILD_ID:-${GITHUB_SHA:-$(git rev-parse --short HEAD 2>/dev/null || printf local)}}"

vinext_bin="${project_root}/node_modules/.bin/vinext"
if [[ ! -x "${vinext_bin}" ]]; then
  echo "vinext is not installed; run npm ci first." >&2
  exit 1
fi

VOXEL_RALLY_PAGES=1 "${vinext_bin}" build

# Vinext's server export is still useful for the Sites/Cloudflare artifact,
# but GitHub Pages needs a browser-only static entry. Bundle the same client
# game component with Vite so Pages remains playable even when the App Router
# route is classified as dynamic by the current vinext release.
pages_vite_bin="${project_root}/node_modules/.bin/vite"
if [[ ! -x "${pages_vite_bin}" ]]; then
  echo "vite is not installed; run npm ci first." >&2
  exit 1
fi
"${pages_vite_bin}" build --config vite.pages.config.ts

for asset in manifest.json favicon.svg sw.js _headers; do
  if [[ -f "${project_root}/dist/client/${asset}" ]]; then
    cp "${project_root}/dist/client/${asset}" "${project_root}/out/${asset}"
  fi
done

if [[ ! -f out/index.html ]]; then
  echo "GitHub Pages build did not produce out/index.html." >&2
  exit 1
fi

touch out/.nojekyll
echo "GitHub Pages artifact ready: ${project_root}/out"
