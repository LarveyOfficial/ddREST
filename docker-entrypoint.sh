#!/bin/sh
# Drop from root to PUID:PGID after making /data writable.
#
# The alternative — baking in a fixed uid — is the single most common cause of
# "container won't start" on Unraid, because appdata ownership varies by system
# (often 99:100, sometimes 1000:1000, sometimes root). Fixing ownership at
# startup and then dropping privileges is the convention Unraid users expect.
set -e

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
DATA_DIR="$(dirname "${SESSION_DB_PATH:-/data/sessions.db}")"

# If we are not root, we cannot chown or drop privileges — someone has already
# pinned the user with `--user`, which is a legitimate way to run this.
if [ "$(id -u)" != "0" ]; then
  if [ ! -w "$DATA_DIR" ]; then
    echo "ddREST: $DATA_DIR is not writable by uid $(id -u)." >&2
    echo "ddREST: either make it writable, or drop --user and set PUID/PGID instead." >&2
    exit 1
  fi
  exec "$@"
fi

mkdir -p "$DATA_DIR"

# Reuse the existing group/user when the ids already exist in the image.
if ! getent group "$PGID" >/dev/null 2>&1; then
  addgroup -g "$PGID" ddrest 2>/dev/null || true
fi
if ! getent passwd "$PUID" >/dev/null 2>&1; then
  adduser -D -H -u "$PUID" -G "$(getent group "$PGID" | cut -d: -f1)" ddrest 2>/dev/null || true
fi

# Only touch ownership when it is actually wrong; on a large existing volume a
# blanket recursive chown on every boot is a needless delay.
if [ "$(stat -c '%u' "$DATA_DIR")" != "$PUID" ] || [ "$(stat -c '%g' "$DATA_DIR")" != "$PGID" ]; then
  chown -R "$PUID:$PGID" "$DATA_DIR" 2>/dev/null || {
    echo "ddREST: could not chown $DATA_DIR to $PUID:$PGID." >&2
    echo "ddREST: if this is a read-only or remote mount, pre-create it with those ids." >&2
  }
fi

echo "ddREST: starting as uid $PUID, gid $PGID (data: $DATA_DIR)"
exec su-exec "$PUID:$PGID" "$@"
