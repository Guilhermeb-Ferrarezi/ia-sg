#!/usr/bin/env bash

set -Eeuo pipefail

BRANCH="${BRANCH:-master}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
DEFAULT_WEB_PORT="${DEFAULT_WEB_PORT:-8080}"
DEFAULT_API_PORT="${DEFAULT_API_PORT:-3000}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ -f ".env" ]]; then
  COMPOSE_CMD=(docker compose --env-file .env -f "$COMPOSE_FILE")
else
  COMPOSE_CMD=(docker compose -f "$COMPOSE_FILE")
fi

print_header() {
  printf '\n'
  printf '=====================================\n'
  printf '  DEPLOY - IA SG\n'
  printf '=====================================\n'
  printf '\n'
}

fail() {
  printf '\n'
  printf '=====================================\n'
  printf '  FALHOU. Veja os logs abaixo:\n'
  printf '  docker compose -f %s logs --tail=100 api\n' "$COMPOSE_FILE"
  printf '=====================================\n'
  printf '\n'
  exit 1
}

trim_quotes() {
  local value="$1"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "$value"
}

read_env_value() {
  local key="$1"
  local file="${2:-.env}"
  local line

  [[ -f "$file" ]] || return 1

  line="$(grep -E "^${key}=" "$file" | tail -n 1 || true)"
  [[ -n "$line" ]] || return 1

  trim_quotes "${line#*=}"
}

resolve_web_port_from_origins() {
  local origins origin trimmed

  origins="$(read_env_value "ALLOWED_ORIGINS" || true)"
  [[ -n "$origins" ]] || return 1

  IFS=',' read -r -a origin_list <<< "$origins"
  for origin in "${origin_list[@]}"; do
    trimmed="$(printf '%s' "$origin" | xargs)"
    if [[ "$trimmed" =~ ^https?://(localhost|127\.0\.0\.1):([0-9]+)(/.*)?$ ]]; then
      printf '%s' "${BASH_REMATCH[2]}"
      return 0
    fi
  done

  return 1
}

append_unique_candidate() {
  local -n target_ref="$1"
  local value="${2:-}"
  local existing

  [[ "$value" =~ ^[0-9]+$ ]] || return 0

  for existing in "${target_ref[@]:-}"; do
    [[ "$existing" == "$value" ]] && return 0
  done

  target_ref+=("$value")
}

port_in_use() {
  local port="$1"

  if command -v ss >/dev/null 2>&1; then
    ss -ltn "( sport = :${port} )" | tail -n +2 | grep -q .
    return $?
  fi

  (echo >/dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1
}

build_web_port_candidates() {
  local -n out_ref="$1"
  local value origins origin trimmed base_port offset

  out_ref=()

  value="$(read_env_value "WEB_PORT" || true)"
  append_unique_candidate out_ref "$value"

  value="$(read_env_value "IA_SG_WEB_PORT" || true)"
  append_unique_candidate out_ref "$value"

  origins="$(read_env_value "ALLOWED_ORIGINS" || true)"
  if [[ -n "$origins" ]]; then
    IFS=',' read -r -a origin_list <<< "$origins"
    for origin in "${origin_list[@]}"; do
      trimmed="$(printf '%s' "$origin" | xargs)"
      if [[ "$trimmed" =~ ^https?://(localhost|127\.0\.0\.1):([0-9]+)(/.*)?$ ]]; then
        append_unique_candidate out_ref "${BASH_REMATCH[2]}"
      fi
    done
  fi

  append_unique_candidate out_ref "$DEFAULT_WEB_PORT"

  base_port="${out_ref[0]:-$DEFAULT_WEB_PORT}"
  for offset in 1 2 3 4 5 6 7 8 9 10; do
    append_unique_candidate out_ref "$((base_port + offset))"
  done
}

build_api_port_candidates() {
  local -n out_ref="$1"
  local value base_port offset

  out_ref=()

  value="$(read_env_value "API_PORT" || true)"
  append_unique_candidate out_ref "$value"

  value="$(read_env_value "IA_SG_API_PORT" || true)"
  append_unique_candidate out_ref "$value"

  value="$(read_env_value "PORT" || true)"
  append_unique_candidate out_ref "$value"

  append_unique_candidate out_ref "$DEFAULT_API_PORT"

  base_port="${out_ref[0]:-$DEFAULT_API_PORT}"
  for offset in 1 2 3 4 5; do
    append_unique_candidate out_ref "$((base_port + offset))"
  done
}

pick_available_port() {
  local label="$1"
  shift

  local candidates=("$@")
  local preferred_port="${candidates[0]:-}"
  local port

  for port in "${candidates[@]}"; do
    if ! port_in_use "$port"; then
      if [[ -n "$preferred_port" && "$port" != "$preferred_port" ]]; then
        printf '[WARN] Porta %s ocupada para %s. Usando %s.\n' "$preferred_port" "$label" "$port" >&2
      fi
      printf '%s' "$port"
      return 0
    fi
  done

  printf '[ERRO] Nenhuma porta livre encontrada para %s.\n' "$label" >&2
  exit 1
}

resolve_web_port() {
  local candidates=()
  build_web_port_candidates candidates
  pick_available_port "frontend" "${candidates[@]}"
}

resolve_api_port() {
  local candidates=()
  build_api_port_candidates candidates
  pick_available_port "api" "${candidates[@]}"
}

ensure_command() {
  local command_name="$1"
  local error_message="$2"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf '[ERRO] %s\n' "$error_message"
    exit 1
  fi
}

require_clean_git_context() {
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    printf '[ERRO] Este diretorio nao e um repositorio Git.\n'
    exit 1
  fi
}

show_status() {
  printf '\n=== STATUS ===\n'
  "${COMPOSE_CMD[@]}" ps
  printf '\n'
}

main() {
  local web_port api_port do_push commit_message current_branch has_changes

  web_port="$(resolve_web_port)"
  api_port="$(resolve_api_port)"
  export WEB_PORT="$web_port"
  export PORT="$api_port"

  print_header

  ensure_command "docker" "Docker nao encontrado no PATH."
  ensure_command "git" "Git nao encontrado no PATH."

  if ! docker info >/dev/null 2>&1; then
    printf '[ERRO] Docker nao esta rodando. Inicie o Docker e tente novamente.\n'
    exit 1
  fi

  require_clean_git_context

  current_branch="$(git branch --show-current 2>/dev/null || true)"
  current_branch="${current_branch:-$BRANCH}"

  printf '[1/3] Deploy com Docker Compose...\n'
  "${COMPOSE_CMD[@]}" up -d --build || fail

  show_status

  printf '=====================================\n'
  printf '  Deploy concluido com sucesso!\n'
  printf '  Frontend : http://localhost:%s\n' "$web_port"
  printf '  API      : http://localhost:%s\n' "$api_port"
  printf '  Branch   : %s\n' "$current_branch"
  printf '=====================================\n'
  printf '\n'

  read -r -p 'Deseja fazer commit e push agora? (s/n): ' do_push
  if [[ "${do_push,,}" != "s" ]]; then
    printf 'Sem push. Pronto.\n'
    exit 0
  fi

  printf '\n[2/3] Verificando alteracoes Git...\n'
  has_changes="$(git status --porcelain)"

  if [[ -z "$has_changes" ]]; then
    printf 'Sem alteracoes locais. Fazendo apenas push...\n'
  else
    read -r -p 'Mensagem do commit: ' commit_message
    if [[ -z "${commit_message// }" ]]; then
      printf '[ERRO] Mensagem vazia. Cancelando push.\n'
      exit 1
    fi

    printf '\n[3/3] Commitando e enviando...\n'
    git add . || fail
    git commit -m "$commit_message" || fail
  fi

  git push || fail

  printf '\n'
  printf '=====================================\n'
  printf '  OK: Deploy + Push concluido!\n'
  printf '=====================================\n'
}

main "$@"
