#!/bin/sh
# Drift's trigger hook for the AsyncAPI send operations (*.drift.yaml). Drift runs it once it has subscribed to the
# topic it checks; the harness then does what the provider state set up (POST /drift/state) and the service publishes
# the message. Drift wants output on stdout, so this prints the harness's {}.
exec curl -fsS -X POST "${DRIFT_HARNESS_URL:-http://127.0.0.1:18182}/drift/trigger"
