#!/usr/bin/env bash
# ralph.sh — Orquestador del bucle Ralph para Kubit-WMS
# En cada iteración el agente lee PROMPT.md, toma UNA tarea de memory/fix_plan.md,
# la implementa y la prueba. NO hace commits (regla 1.4 de Kubit) salvo que el usuario lo pida.
#
# Uso:  ./ralph.sh [N]      # N = iteraciones máximas (default: 50)
#
set -euo pipefail

MAX_ITER="${1:-50}"
PROMPT_FILE="PROMPT.md"
FIX_PLAN="memory/fix_plan.md"

# CLI del agente. Ajusta a tu herramienta (Claude Code, Codex, OpenCode, etc.)
#   AGENT_CMD='claude -p'
#   AGENT_CMD='codex exec'
#   AGENT_CMD='opencode run'
AGENT_CMD="${AGENT_CMD:-claude -p}"

echo "▶ Bucle Ralph (Kubit-WMS) — máx $MAX_ITER iteraciones"
echo "  Stack: HTML + Tailwind CDN + JS vanilla + Supabase. Sin commits automáticos."

for i in $(seq 1 "$MAX_ITER"); do
  echo ""
  echo "── Iteración $i/$MAX_ITER — $(date '+%Y-%m-%d %H:%M:%S') ──"

  if ! grep -qE '^\- \[ \] ' "$FIX_PLAN"; then
    echo "✅ Sin tareas pendientes en $FIX_PLAN. Fin del bucle."
    break
  fi

  cat "$PROMPT_FILE" | $AGENT_CMD || {
    echo "⚠ El agente devolvió error en la iteración $i. Revisa memory/progress.md."
  }

  sleep 1
done

echo ""
echo "🏁 Bucle finalizado. Revisa memory/progress.md, specs/tasks.md y el working directory (sin commit)."
