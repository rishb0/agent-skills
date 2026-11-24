#!/usr/bin/env bash
# Stop the background service and remove the installed skill.
#
#   bash uninstall.sh                # remove everything
#   bash uninstall.sh --keep-config  # keep router.config.json
set -euo pipefail

TARGET="${HOME}/.config/opencode/skills/router-reboot-skill"
LABEL="com.agent-skills.router-reboot"
KEEP_CONFIG=0

usage() {
  sed -n '2,5p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --claude) TARGET="${HOME}/.claude/skills/router-reboot-skill" ;;
    --target) TARGET="$2"; shift ;;
    --keep-config) KEEP_CONFIG=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage; exit 2 ;;
  esac
  shift
done

case "$(uname -s)" in
  Linux)
    UNIT="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/reboot-home-router.service"
    # Only touch a unit that actually points at this installation.
    if [ -f "$UNIT" ] && grep -Fq "$TARGET" "$UNIT"; then
      if command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; then
        systemctl --user disable --now reboot-home-router.service 2>/dev/null || true
        systemctl --user daemon-reload || true
      fi
      rm -f "$UNIT"
      echo "removed systemd user service"
    else
      echo "no systemd unit for $TARGET - left systemd alone"
    fi
    ;;
  Darwin)
    PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
    if [ -f "$PLIST" ] && grep -Fq "$TARGET" "$PLIST"; then
      launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
      rm -f "$PLIST"
      echo "removed LaunchAgent"
    else
      echo "no LaunchAgent for $TARGET - left launchd alone"
    fi
    ;;
esac

if [ "$KEEP_CONFIG" -eq 1 ] && [ -f "$TARGET/router.config.json" ]; then
  cp "$TARGET/router.config.json" "./router.config.backup.json"
  chmod 600 "./router.config.backup.json" 2>/dev/null || true
  echo "saved router.config.json to ./router.config.backup.json"
fi

if [ -z "$TARGET" ] || [ "$TARGET" = "/" ] || [ "$TARGET" = "$HOME" ]; then
  echo "refusing to remove \"$TARGET\"" >&2
  exit 1
fi

rm -rf "$TARGET"
echo "removed $TARGET"
