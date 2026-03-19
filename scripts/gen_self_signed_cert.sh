#!/usr/bin/env bash
set -euo pipefail

CERT_DIR="${CERT_DIR:-deploy/nginx/certs}"
COMMON_NAME="${COMMON_NAME:-localhost}"
DAYS="${DAYS:-3650}"
COUNTRY="${COUNTRY:-CN}"
STATE="${STATE:-Shanghai}"
LOCALITY="${LOCALITY:-Shanghai}"
ORGANIZATION="${ORGANIZATION:-CaseSystem}"
ORGANIZATIONAL_UNIT="${ORGANIZATIONAL_UNIT:-DevOps}"

declare -a SAN_DNS=()
declare -a SAN_IP=()

usage() {
  cat <<'EOF'
Usage: scripts/gen_self_signed_cert.sh [options]

Options:
  --cert-dir <path>   Certificate output directory (default: deploy/nginx/certs)
  --cn <value>        Certificate common name (default: localhost)
  --days <value>      Valid days (default: 3650)
  --dns <value>       Add a DNS SAN (repeatable)
  --ip <value>        Add an IP SAN (repeatable)
  -h, --help          Show this help

Environment fallback:
  CERT_DIR, COMMON_NAME, DAYS
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cert-dir)
      CERT_DIR="$2"
      shift 2
      ;;
    --cn)
      COMMON_NAME="$2"
      shift 2
      ;;
    --days)
      DAYS="$2"
      shift 2
      ;;
    --dns)
      SAN_DNS+=("$2")
      shift 2
      ;;
    --ip)
      SAN_IP+=("$2")
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required to generate self-signed certificates." >&2
  exit 1
fi

if [[ "${#SAN_DNS[@]}" -eq 0 ]]; then
  SAN_DNS+=("${COMMON_NAME}")
  SAN_DNS+=("localhost")
fi

if [[ "${#SAN_IP[@]}" -eq 0 ]]; then
  SAN_IP+=("127.0.0.1")
fi

mkdir -p "${CERT_DIR}"

CERT_PATH="${CERT_DIR}/server.crt"
KEY_PATH="${CERT_DIR}/server.key"
CONF_FILE="$(mktemp)"
trap 'rm -f "${CONF_FILE}"' EXIT

{
  echo "[req]"
  echo "default_bits = 4096"
  echo "prompt = no"
  echo "default_md = sha256"
  echo "x509_extensions = v3_req"
  echo "distinguished_name = dn"
  echo
  echo "[dn]"
  echo "C = ${COUNTRY}"
  echo "ST = ${STATE}"
  echo "L = ${LOCALITY}"
  echo "O = ${ORGANIZATION}"
  echo "OU = ${ORGANIZATIONAL_UNIT}"
  echo "CN = ${COMMON_NAME}"
  echo
  echo "[v3_req]"
  echo "subjectAltName = @alt_names"
  echo
  echo "[alt_names]"
} > "${CONF_FILE}"

san_index=1
for dns in "${SAN_DNS[@]}"; do
  echo "DNS.${san_index} = ${dns}" >> "${CONF_FILE}"
  san_index=$((san_index + 1))
done

ip_index=1
for ip in "${SAN_IP[@]}"; do
  echo "IP.${ip_index} = ${ip}" >> "${CONF_FILE}"
  ip_index=$((ip_index + 1))
done

openssl req -x509 -nodes -newkey rsa:4096 \
  -keyout "${KEY_PATH}" \
  -out "${CERT_PATH}" \
  -days "${DAYS}" \
  -config "${CONF_FILE}"

chmod 600 "${KEY_PATH}"
chmod 644 "${CERT_PATH}"

echo "Generated self-signed certificate:"
echo "  - ${CERT_PATH}"
echo "  - ${KEY_PATH}"
echo "SAN DNS: ${SAN_DNS[*]}"
echo "SAN IP : ${SAN_IP[*]}"
