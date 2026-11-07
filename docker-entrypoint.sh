#!/bin/sh
set -e

AUTH_MODE="${AUTH_MODE:-local}"

# The signing secret only matters when Barback issues its own sessions.
if [ "$AUTH_MODE" = "local" ]; then
  if [ -z "$BETTER_AUTH_SECRET" ]; then
    echo "ERROR: BETTER_AUTH_SECRET is not set, and AUTH_MODE is \"local\"." >&2
    echo "Generate one with:  openssl rand -base64 32" >&2
    exit 1
  fi

  case "$BETTER_AUTH_SECRET" in
    *change-me*)
      echo "ERROR: BETTER_AUTH_SECRET is still the placeholder value." >&2
      echo "Generate a real one with:  openssl rand -base64 32" >&2
      exit 1
      ;;
  esac
fi

case "$AUTH_MODE" in
  local) ;;
  proxy)
    if [ -z "$AUTH_PROXY_SHARED_SECRET" ]; then
      echo "WARNING: AUTH_MODE=proxy without AUTH_PROXY_SHARED_SECRET." >&2
      echo "         Anything that can reach Barback directly can claim to be" >&2
      echo "         any user. Set it unless you are certain only your proxy" >&2
      echo "         can connect.  openssl rand -base64 32" >&2
    fi
    ;;
  none)
    echo "WARNING: AUTH_MODE=none. There is no authentication; everyone who" >&2
    echo "         can reach this instance shares one account." >&2
    ;;
  *)
    echo "ERROR: AUTH_MODE must be local, proxy or none (got \"$AUTH_MODE\")." >&2
    exit 1
    ;;
esac

mkdir -p "${UPLOAD_DIR:-/data/uploads}"

echo "Applying database migrations…"
node /opt/prisma/node_modules/prisma/build/index.js migrate deploy \
  --config /opt/prisma/prisma.config.ts

echo "Barback is starting on port ${PORT:-3000}."
echo "If this is a new instance, open it and the welcome page will ask you to"
echo "create the administrator account."
exec "$@"
