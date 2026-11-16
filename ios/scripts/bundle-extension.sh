#!/bin/bash
# Copies the Chrome extension (repo root) into the app bundle as Extension/,
# plus the iOS-only shim and mobile stylesheet as Extension/__ios/.
# Runs as an Xcode build phase, so the app always ships the current extension.
set -euo pipefail

REPO="${SRCROOT}/.."
DEST="${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/Extension"

rm -rf "${DEST}"
mkdir -p "${DEST}/__ios"
cp "${REPO}/manifest.json" "${DEST}/"
for dir in src themes icons popup options demo logs; do
  if [ -d "${REPO}/${dir}" ]; then
    rsync -a --exclude '.DS_Store' --exclude '*.md' "${REPO}/${dir}" "${DEST}/"
  fi
done
cp "${SRCROOT}/Injected/shim.js" "${SRCROOT}/Injected/mobile.css" "${DEST}/__ios/"
echo "Bundled extension $(/usr/bin/python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["version"])' "${REPO}/manifest.json" 2>/dev/null || echo '?') into ${DEST}"
