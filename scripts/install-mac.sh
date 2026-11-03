#!/bin/sh
# Install the latest Still release into /Applications (or ~/Applications).
set -eu

repo="megazear7/still"
case "$(uname -s)" in
  Darwin) ;;
  *)
    echo "Still's installer is for macOS." >&2
    exit 1
    ;;
esac

case "$(uname -m)" in
  arm64|aarch64) arch="arm64" ;;
  x86_64) arch="x64" ;;
  *)
    echo "This Mac's architecture is not supported: $(uname -m)" >&2
    exit 1
    ;;
esac

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "Looking up the latest Still release…"
url="$(
  curl -fsSL "https://api.github.com/repos/${repo}/releases/latest" |
    python3 -c '
import json, sys
arch = sys.argv[1]
release = json.load(sys.stdin)
suffix = "-" + arch + ".zip"
matches = [asset["browser_download_url"] for asset in release.get("assets", []) if asset["name"].endswith(suffix)]
if not matches:
    raise SystemExit("No " + arch + " zip in the latest release.")
print(matches[0])
' "$arch"
)"

echo "Downloading ${url##*/}…"
curl -fL "$url" -o "$tmp/Still.zip"
ditto -x -k "$tmp/Still.zip" "$tmp/unpacked"
app="$(find "$tmp/unpacked" -name 'Still.app' -maxdepth 2 | head -1)"
if [ -z "$app" ]; then
  echo "The download did not contain Still.app." >&2
  exit 1
fi

if [ -w /Applications ]; then
  dest="/Applications"
else
  dest="$HOME/Applications"
  mkdir -p "$dest"
fi

echo "Installing to ${dest}/Still.app…"
rm -rf "${dest}/Still.app"
ditto "$app" "${dest}/Still.app"
xattr -dr com.apple.quarantine "${dest}/Still.app" 2>/dev/null || true
open -a "${dest}/Still.app"
echo "Still is installed."
