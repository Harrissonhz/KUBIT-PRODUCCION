#!/usr/bin/env bash
# ralph.sh — Orquestador del bucle Ralph para Kubit-WMS
# Invoca al agente de forma repetida; en cada iteración el agente lee PROMPT.md,
# toma UNA tarea de memory/fix_plan.md, la implementa, la prueba y la marca.
#
# Uso:
#   ./ralph.sh [N]      # N = número máximo de iteraciones (default: 50)
#
# Requisitos:
#   - CLI del agente (ajusta AGENT_CMD a tu herramienta: claude, codex, etc.)
#   - Repo git inicializado en apps/wms
#
set -euo pipefail

MAX_ITER="${1:-50}"
PROMPT_FILE="PROMPT.md"
FIX_PLAN="memory/fix_plan.md"

# Comando del agente. Debe leer el contenido de PROMPT.md como instrucción.
# Ejemplos:
#   AGENT_CMD='claude -p'         # Claude Code (headless)
#   AGENT_CMD='codex exec'        # Codex CLI
AGENT_CMD="${AGENT_CMD:-claude -p}"

echo "▶ Iniciando bucle Ralph — máx $MAX_ITER iteraciones"

for i in $(seq 1 "$MAX_ITER"); do
  echo ""
  echo "──────────────────────────────────────────────"
  echo "🔁 Iteración $i / $MAX_ITER — $(date '+%Y-%m-%d %H:%M:%S')"
  echo "──────────────────────────────────────────────"

  # Condición de salida: no quedan tareas pendientes en fix_plan.md
  if ! grep -qE '^\- \[ \] ' "$FIX_PLAN"; then
    echo "✅ No quedan tareas pendientes en $FIX_PLAN. Bucle terminado."
    break
  fi

  # Invocar al agente con el prompt del bucle.
  # El agente hace UNA tarea, prueba, actualiza archivos y hace commit.
  cat "$PROMPT_FILE" | $AGENT_CMD || {
    echo "⚠ El agente devolvió error en la iteración $i. Revisa memory/progress.md."
  }

  # Pequeña pausa opcional entre iteraciones
  sleep 1
done

echo ""
echo "🏁 Bucle finalizado. Revisa memory/progress.md y specs/tasks.md."
