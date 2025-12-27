#!/bin/bash

# Configuration
BASE_DIR="/tmp/terminal_time_tracker_$USER"
HISTORY_JSON="$HOME/.terminal_time_history.jsonl"
POLL_INTERVAL=1
SAVE_INTERVAL=300  # Save snapshot every 5 minutes
THIS_SCRIPT_NAME=$(basename "$0")

GLOBAL_PID_FILE="$BASE_DIR/global.pid"
GLOBAL_DATA_FILE="$BASE_DIR/global.dat"
FIFO_PATH="$BASE_DIR/stream"

format_time() {
  local T=$1
  local H=$((T / 3600))
  local M=$(((T % 3600) / 60))
  local S=$((T % 60))
  printf "%02d:%02d:%02d" $H $M $S
}

global_track_loop() {
  declare -A app_times
  local last_save=0

  if [ -f "$GLOBAL_DATA_FILE" ]; then
    while IFS=':' read -r app seconds; do
      if [ -n "$app" ]; then
        app_times["$app"]=$seconds
      fi
    done <"$GLOBAL_DATA_FILE"
  fi

  while true; do
    active_ttys=$(ps -u "$USER" -o tty= | grep -E '^pts/[0-9]+$|^tty[0-9]+$' | sort | uniq)

    for tty in $active_ttys; do
      fg_pgid=$(ps -o tpgid= -t "$tty" 2>/dev/null | grep -v "TPGID" | tr -d ' ' | head -n 1)

      if [ -n "$fg_pgid" ] && [ "$fg_pgid" -gt 0 ]; then
        cmd_name=$(ps -o comm= -p "$fg_pgid" 2>/dev/null)
        cmd_name=$(basename "$cmd_name")

        if [ -n "$cmd_name" ] && [ "$cmd_name" != "$THIS_SCRIPT_NAME" ]; then
          key="${cmd_name}@${tty}"
          if [ -z "${app_times[$key]}" ]; then
            app_times[$key]=0
          fi

          ((app_times[$key]++))
        fi
      fi
    done

    >"${GLOBAL_DATA_FILE}.tmp"
    for app in "${!app_times[@]}"; do
      echo "$app:${app_times[$app]}" >>"${GLOBAL_DATA_FILE}.tmp"
    done
    mv "${GLOBAL_DATA_FILE}.tmp" "$GLOBAL_DATA_FILE"

    # Stream to FIFO if a reader is connected (non-blocking with timeout)
    if [ -p "$FIFO_PATH" ]; then
      json="{"
      first=true
      for app in "${!app_times[@]}"; do
        if [ "$first" = true ]; then
          first=false
        else
          json+=","
        fi
        json+="\"$app\":${app_times[$app]}"
      done
      json+="}"
      timeout 0.1 bash -c "echo '$json' > \"$FIFO_PATH\"" 2>/dev/null
    fi

    # Periodic save to JSON history
    current_time=$(date +%s)
    if [ $((current_time - last_save)) -ge $SAVE_INTERVAL ]; then
      save_json_snapshot
      last_save=$current_time
    fi

    sleep "$POLL_INTERVAL"
  done
}

save_json_snapshot() {
  if [ ! -s "$GLOBAL_DATA_FILE" ]; then
    return
  fi

  local timestamp=$(date +%s)
  local date_str=$(date -Iseconds)
  local json="{\"timestamp\":$timestamp,\"date\":\"$date_str\""

  while IFS=':' read -r app seconds; do
    if [ -n "$app" ]; then
      app_escaped=$(echo "$app" | sed 's/"/\\"/g')
      json+=",\"$app_escaped\":$seconds"
    fi
  done <"$GLOBAL_DATA_FILE"

  json+="}"
  echo "$json" >>"$HISTORY_JSON"
}

start_tracking() {
  mkdir -p "$BASE_DIR"

  # Create FIFO if it doesn't exist
  if [ ! -p "$FIFO_PATH" ]; then
    mkfifo "$FIFO_PATH" 2>/dev/null
  fi

  if [ -f "$GLOBAL_PID_FILE" ]; then
    if ps -p $(cat "$GLOBAL_PID_FILE") >/dev/null; then
      echo "Error: Global tracker is already running (PID: $(cat $GLOBAL_PID_FILE))."
      return 1
    else
      # Cleanup stale PID file
      rm "$GLOBAL_PID_FILE"
    fi
  fi

  : >"$GLOBAL_DATA_FILE"

  global_track_loop &

  echo $! >"$GLOBAL_PID_FILE"
  echo "Global Tracker started in background (PID $!). Monitoring all active terminals."
  echo "FIFO stream available at: $FIFO_PATH"
}

stop_tracking() {
  if [ ! -f "$GLOBAL_PID_FILE" ]; then
    echo "Error: Global tracker is not running."
    exit 1
  fi

  pid=$(cat "$GLOBAL_PID_FILE")
  
  # Save final snapshot before stopping
  save_json_snapshot
  
  kill "$pid" 2>/dev/null
  rm "$GLOBAL_PID_FILE"

  echo "Global Tracker stopped (PID $pid). All terminal tracking ceased."
  echo "Data saved to $HISTORY_JSON"

  echo "---------------------------"
  show_stats
  echo "---------------------------"

  if [ -f "$GLOBAL_DATA_FILE" ]; then
    rm "$GLOBAL_DATA_FILE"
  fi

  if [ -p "$FIFO_PATH" ]; then
    rm "$FIFO_PATH"
  fi
}

show_stats() {
  if [ -f "$GLOBAL_PID_FILE" ]; then
    if ps -p $(cat "$GLOBAL_PID_FILE") >/dev/null; then
      echo "GLOBAL TRACKER STATUS: RUNNING (PID: $(cat $GLOBAL_PID_FILE))"
    else
      echo "GLOBAL TRACKER STATUS: STOPPED (Stale PID file found, run 'start' to reset)"
    fi
  else
    echo "GLOBAL TRACKER STATUS: STOPPED"
  fi
  echo ""

  if [ ! -s "$GLOBAL_DATA_FILE" ]; then
    echo "No data collected yet."
    return
  fi

  echo "AGGREGATED STATS (Global Session)"
  printf "%-30s %-10s\n" "APPLICATION (TTY)" "TIME"
  printf "%-30s %-10s\n" "-----------------" "----"

  while IFS=':' read -r app seconds; do
    if [ -n "$app" ]; then
      if [[ "$app" == *"@"* ]]; then
        name="${app%@*}"
        tty="${app#*@}"
        display_name="$name ($tty)"
      else
        display_name="$app"
      fi
      pretty_time=$(format_time "$seconds")
      printf "%-30s %-10s\n" "$display_name" "$pretty_time"
    fi
  done <"$GLOBAL_DATA_FILE" | sort -k2 -r
}

case "$1" in
start)
  start_tracking
  ;;
stop)
  stop_tracking
  ;;
stats | status | report)
  show_stats
  ;;
*)
  echo "Usage: $0 {start|stop|stats|status|report}"
  exit 1
  ;;
esac
