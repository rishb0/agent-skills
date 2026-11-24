#!/usr/bin/env bash
# Install the skill for OpenCode, Claude Code, or any agent that reads SKILL.md.
#
#   bash install.sh                 # ~/.config/opencode/skills/router-reboot-skill
#   bash install.sh --claude        # ~/.claude/skills/router-reboot-skill
#   bash install.sh --target DIR    # custom location
#   bash install.sh --no-service    # copy only, no start-up entry
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${HOME}/.config/opencode/skills/router-reboot-skill"
WITH_SERVICE=1
LABEL="com.agent-skills.router-reboot"

usage() {
  sed -n '2,7p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --claude) TARGET="${HOME}/.claude/skills/router-reboot-skill" ;;
    --target) TARGET="$2"; shift ;;
    --no-service) WITH_SERVICE=0 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage; exit 2 ;;
  esac
  shift
done

if ! command -v node >/dev/null 2>&1; then
  echo "node is required (18 or newer)" >&2
  exit 1
fi

NODE_BIN="$(command -v node)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "node 18 or newer is required, found $(node --version)" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required to install playwright-core" >&2
  exit 1
fi

echo "installing into $TARGET"
mkdir -p "$TARGET"

# Replace only the shipped directories, so config, logs, artifacts and
# node_modules survive a reinstall.
rm -rf "$TARGET/scripts" "$TARGET/references" "$TARGET/config" "$TARGET/systemd" "$TARGET/launchd" "$TARGET/windows"
for item in SKILL.md README.md package.json package-lock.json config scripts references systemd launchd windows; do
  if [ -e "$SRC/$item" ]; then
    cp -R "$SRC/$item" "$TARGET/"
  fi
done

# Fail here, loudly, instead of at 2am when the watcher tries to run.
for required in SKILL.md package.json scripts/reboot-router.mjs scripts/watch-limit.mjs scripts/doctor.mjs config/router.config.example.json; do
  if [ ! -f "$TARGET/$required" ]; then
    echo "install incomplete: missing $required" >&2
    exit 1
  fi
done

echo "installing dependencies"
(
  cd "$TARGET"
  if [ -f package-lock.json ]; then
    npm ci --omit=dev --no-audit --no-fund
  else
    npm install --omit=dev --no-audit --no-fund
  fi
)

if [ ! -f "$TARGET/router.config.json" ]; then
  cp "$TARGET/config/router.config.example.json" "$TARGET/router.config.json"
  chmod 600 "$TARGET/router.config.json" 2>/dev/null || true
  echo "created $TARGET/router.config.json - fill in the router details"
else
  echo "keeping existing $TARGET/router.config.json"
fi

register_service() {
  if [ "$WITH_SERVICE" -ne 1 ]; then
    echo "skipping start-up entry (--no-service)"
    return
  fi

  case "$(uname -s)" in
    Linux)
      if ! systemctl --user show-environment >/dev/null 2>&1; then
        echo "systemd user session not available - start scripts/watch-limit.mjs yourself" >&2
        return
      fi

      UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
      mkdir -p "$UNIT_DIR"
      sed -e "s|{{NODE}}|$NODE_BIN|g" -e "s|{{SKILL_DIR}}|$TARGET|g" \
        "$SRC/systemd/reboot-home-router.service.in" \
        > "$UNIT_DIR/reboot-home-router.service"

      systemctl --user daemon-reload
      systemctl --user enable --now reboot-home-router.service
      loginctl enable-linger "$USER" 2>/dev/null || echo "note: enable linger manually to run without a login" >&2
      echo "systemd user service enabled: reboot-home-router"
      ;;

    Darwin)
      PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
      mkdir -p "$HOME/Library/LaunchAgents"
      sed -e "s|{{NODE}}|$NODE_BIN|g" -e "s|{{SKILL_DIR}}|$TARGET|g" -e "s|{{LABEL}}|$LABEL|g" \
        "$SRC/launchd/com.agent-skills.router-reboot.plist.in" \
        > "$PLIST"

      launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
      launchctl bootstrap "gui/$(id -u)" "$PLIST"
      echo "LaunchAgent loaded: $LABEL"
      ;;

    *)
      echo "automatic start-up is not supported on this OS - start scripts/watch-limit.mjs yourself" >&2
      ;;
  esac
}

register_service

echo
node "$TARGET/scripts/doctor.mjs" || true

cat <<EOF

Next steps:
  1. Edit $TARGET/router.config.json
  2. cd $TARGET && node scripts/discover.mjs
  3. node scripts/reboot-router.mjs --check
  4. node scripts/reboot-router.mjs --dry-run
EOF
