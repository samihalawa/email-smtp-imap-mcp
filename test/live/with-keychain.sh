#!/bin/zsh
# Run the live test with an account whose password lives in the macOS Keychain, without writing it to a file.
#
#   test/live/with-keychain.sh <accounts.json> <account-name> <external-address>
#
# accounts.json has the layout used by the mcp-mail wrapper:
#   { "provider": { "smtp": {...}, "imap": {...} },
#     "accounts": { "<name>": { "user": "...", "keychain_service": "..." } } }
set -eu
if [[ $# -ne 3 ]]; then
  echo "usage: $0 <accounts.json> <account-name> <external-address>" >&2
  exit 2
fi
cd "${0:A:h:h:h}"

export LIVE_ACCOUNT="$2"
export LIVE_EXTERNAL_TO="$3"
export LIVE_ACCOUNTS_JSON="$(python3 -I - "$1" "$2" <<'PY'
import json, subprocess, sys

cfg = json.load(open(sys.argv[1]))
name = sys.argv[2]
acc = cfg["accounts"][name]
password = subprocess.run(
    ["security", "find-generic-password", "-a", acc["user"], "-s", acc["keychain_service"], "-w"],
    capture_output=True, text=True,
).stdout.strip()
if not password:
    sys.exit(f"no Keychain password for {name}")
out = {proto: {**cfg["provider"][proto], "user": acc["user"], "password": password} for proto in ("smtp", "imap")}
print(json.dumps({name: out}))
PY
)"
exec npm run test:live
