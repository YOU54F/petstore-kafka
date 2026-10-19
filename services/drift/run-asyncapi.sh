#!/usr/bin/env bash
# Drift AsyncAPI verification: harness.js runs the real pets-service and adoptions-service against the broker in
# KAFKA_BOOTSTRAP, and Drift checks them against specs/asyncapi/pets-service.asyncapi.yaml (pets-service.drift.yaml)
# and specs/asyncapi/adoptions-service.asyncapi.yaml (adoptions-service.drift.yaml). Drift needs a PactFlow tenant
# even to verify (PACTFLOW_URL, PACTFLOW_TOKEN).
#
# With DRIFT_PUBLISH_PROVIDER_CONTRACT=true it publishes each document, with Drift's results, as the provider contract
# of pets-service-events and adoptions-service-events: pacticipants of their own, because PactFlow takes one provider
# contract per provider version, and pets-service and adoptions-service are verified with pact-js (web-ui's REST pact,
# the message pacts) under their own names.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
repo_root=$(git -C "$here" rev-parse --show-toplevel)
pact_cli=${PACT_CLI:-$repo_root/services/node_modules/.bin/pact}
drift_version=${DRIFT_VERSION:-2608.3.0}
server_port=${DRIFT_SERVER_PORT:-18182}
output_dir=${DRIFT_OUTPUT_DIR:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}/petstore-kafka-drift-asyncapi}
server_log=${DRIFT_HARNESS_LOG:-$output_dir/harness.log}
run_output_dir="$output_dir/$(date -u +%Y%m%d%H%M%S)-$$"

if [[ -z ${KAFKA_BOOTSTRAP:-} ]]; then
  echo "KAFKA_BOOTSTRAP is required: a broker the cases can use, such as a throwaway apache/kafka container" >&2
  exit 1
fi
if [[ ! -x $pact_cli ]]; then
  echo "Pact CLI not found at $pact_cli; run npm ci --ignore-scripts in services" >&2
  exit 1
fi

mkdir -p "$output_dir" "$run_output_dir"
# pact 0.10.8 symlinks the extension into ~/.pact/extensions/bin without creating it ("No such file or directory").
mkdir -p "$HOME/.pact/extensions/bin"
"$pact_cli" extension install drift --version "$drift_version"

node "$here/harness.js" >"$server_log" 2>&1 &
server_pid=$!
cleanup() {
  kill "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
}
trap cleanup EXIT

# The harness answers /healthz once a warm-up pet and adoption have gone through both services.
ready=false
for _ in $(seq 1 150); do
  if curl -fsS "http://127.0.0.1:$server_port/healthz" >/dev/null 2>&1; then
    ready=true
    break
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    cat "$server_log"
    exit 1
  fi
  sleep 1
done
if [[ $ready != true ]]; then
  cat "$server_log"
  exit 1
fi

export DRIFT_HARNESS_URL="http://127.0.0.1:$server_port"
export DRIFT_TRIGGER_HOOK="$here/trigger.sh"
exit_code=0
for service in pets-service adoptions-service; do
  spec="$repo_root/specs/asyncapi/$service.asyncapi.yaml"
  service_output_dir="$run_output_dir/$service"
  mkdir -p "$service_output_dir"
  # Verify a copy of the spec, with two workarounds for the asyncapi 0.0.4 plugin:
  #   - it doesn't load a document that starts with comments ("Nothing provides the capability to load");
  #   - it wraps a payload that is only a $ref in a schema with "description": null, which then fails as a schema
  #     ("null is not of type string" at /description), so give each such payload a description.
  sed -n '/^[^#]/,$p' "$spec" |
    awk '{ print } /^ *payload:$/ { pad = $0; sub(/payload:$/, "  ", pad); p = 1; next } p && /^ *\$ref:/ { print pad "description: Message payload (added for Drift)" } { p = 0 }' \
      > "$service_output_dir/asyncapi.yaml"

  export DRIFT_SPEC_PATH="$service_output_dir/asyncapi.yaml"
  if (cd "$here" && "$pact_cli" drift verify \
    --test-files "$here/$service.drift.yaml" \
    ${DRIFT_OPERATION:+--operation "$DRIFT_OPERATION"} \
    --log-level "${DRIFT_LOG_LEVEL:-info}" \
    --output-dir "$service_output_dir" \
    --generate-result); then
    drift_exit_code=0
  else
    drift_exit_code=$?
    exit_code=$drift_exit_code
    tail -n 50 "$server_log" >&2
  fi

  if [[ ${DRIFT_PUBLISH_PROVIDER_CONTRACT:-false} == true ]]; then
    verification_result=$(find "$service_output_dir" -type f -name 'verification.*.result' -print -quit)
    if [[ -z $verification_result ]]; then
      echo "Drift did not produce a PactFlow verification result for $service" >&2
      exit 1
    fi
    if [[ -z ${PACT_BROKER_BASE_URL:-} ]]; then
      echo "PACT_BROKER_BASE_URL is required when publishing the provider contract" >&2
      exit 1
    fi
    [ -n "${PACT_BROKER_TOKEN:-}" ] || unset PACT_BROKER_TOKEN
    [ -n "${PACT_BROKER_USERNAME:-}" ] || unset PACT_BROKER_USERNAME PACT_BROKER_PASSWORD
    provider_version=${GIT_SHA:-$(git -C "$repo_root" rev-parse HEAD)}
    provider_branch=${GIT_BRANCH:-$(git -C "$repo_root" branch --show-current)}
    # The document as written (the copy above only carries workarounds for the Drift plugin).
    publish_args=(
      "$spec"
      --provider "$service-events"
      --provider-app-version "$provider_version"
      --branch "$provider_branch"
      --specification asyncapi
      --content-type application/yaml
      --verification-exit-code "$drift_exit_code"
      --verification-results "$verification_result"
      --verification-results-content-type application/vnd.smartbear.drift.result
      --verifier drift
      --verifier-version "$drift_version"
    )
    if [[ -n ${BUILD_URL:-} ]]; then
      publish_args+=(--build-url "$BUILD_URL")
    fi
    "$pact_cli" pactflow publish-provider-contract "${publish_args[@]}"
  fi
done

exit "$exit_code"
