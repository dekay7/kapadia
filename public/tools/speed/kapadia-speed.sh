#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# kapadia-speed - network speed test via curl
#
# Requires: curl, awk, dd  (pre-installed on macOS and most Linux distros)
# Usage:    sh kapadia-speed.sh
# Source:   https://kapadia.org/speed/
# ─────────────────────────────────────────────────────────────────────────────

# ── Config ────────────────────────────────────────────────────────────────────
PING_COUNT=10
DL_MB=25          # MB per parallel download stream (4 streams = 100 MB total)
UL_MB=10          # MB per parallel upload stream   (4 streams = 40 MB total)
PARALLEL=4        # number of concurrent connections

# ── Argument parsing ──────────────────────────────────────────────────────────
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help)
      printf "Usage: sh kapadia-speed.sh\n"
      exit 0 ;;
    *) printf "Unknown option: %s\n" "$1" >&2; exit 1 ;;
  esac
done

# ── Dependency check ──────────────────────────────────────────────────────────
for dep in curl awk dd; do
  command -v "$dep" >/dev/null 2>&1 || {
    printf "Error: '%s' is required but not found.\n" "$dep" >&2; exit 1
  }
done

# ── ANSI colours (TTY only) ───────────────────────────────────────────────────
if [ -t 1 ]; then
  RST='\033[0m'; BOLD='\033[1m'; DIM='\033[2m'
  GRN='\033[32m'; CYN='\033[36m'; YLW='\033[33m'; CLR='\033[K'
else
  RST=''; BOLD=''; DIM=''; GRN=''; CYN=''; YLW=''; CLR=''
fi

# ── Helpers ───────────────────────────────────────────────────────────────────
# Bytes/sec (curl) -> Mbps string
to_mbps() { awk "BEGIN { printf \"%.1f\", ($1) * 8 / 1000000 }"; }

# Seconds (curl) -> ms integer string
to_ms()   { awk "BEGIN { printf \"%.0f\", ($1) * 1000 }"; }

# Greater of two awk-float values
max_of()  { awk "BEGIN { print ($1 > $2) ? $1 : $2 }"; }

# Overwrite current line with a dim status message
status()  { printf "\r${CLR}  ${DIM}%s${RST}" "$1"; }

# Count space-separated words in a string
wcount()  { printf "%s" "$1" | awk '{print NF}'; }

# ── Header ────────────────────────────────────────────────────────────────────
printf "\n  ${BOLD}kapadia-speed v2${RST}  ${DIM}testing against speed.cloudflare.com${RST}\n\n"

# ─────────────────────────────────────────────────────────────────────────────
# Phase 1: Ping
# ─────────────────────────────────────────────────────────────────────────────
rtt_list=""; loss=0; pop=""; i=0

# First request: capture headers to extract CF-Ray PoP
first_headers=$(curl -sI "https://speed.cloudflare.com/__down?bytes=0" 2>/dev/null)
pop=$(printf "%s" "$first_headers" | awk '
  tolower($1) == "cf-ray:" {
    n = split($2, a, "-")
    v = a[n]; gsub(/[[:space:]\r\n]/, "", v); print v; exit
  }')

while [ "$i" -lt "$PING_COUNT" ]; do
  status "ping $((i + 1))/$PING_COUNT"
  rtt=$(curl -s -o /dev/null -w "%{time_total}" \
    "https://speed.cloudflare.com/__down?bytes=0&r=$i" 2>/dev/null) && \
    rtt_list="$rtt_list $rtt" || loss=$((loss + 1))
  i=$((i + 1))
done

# Feed rtt_list as a single line so awk sees NF = total sample count
ping_stats=$(printf "%s" "$rtt_list" | awk '{
  n = NF; if (n == 0) { print "0 0"; exit }
  sum = 0; for (i=1;i<=n;i++) sum += $i
  mean = sum / n; var = 0
  for (i=1;i<=n;i++) var += (($i - mean)^2)
  printf "%.3f %.3f\n", mean * 1000, sqrt(var / (n > 1 ? n : 1)) * 1000
}')
ping_ms=$(printf "%s" "$ping_stats" | awk 'NR==1 {printf "%.0f", $1; exit}')
jitter_ms=$(printf "%s" "$ping_stats" | awk 'NR==1 {printf "%.1f", $2; exit}')
loss_pct=$(awk "BEGIN { printf \"%.0f\", $loss / $PING_COUNT * 100 }")

printf "\r${CLR}"
printf "  ${GRN}ping${RST}      %s ms" "$ping_ms"
printf "   ${DIM}jitter %s ms   loss %s%%${RST}" "$jitter_ms" "$loss_pct"
[ -n "$pop" ] && printf "   ${DIM}PoP %s${RST}" "$pop"
printf "\n"

# ─────────────────────────────────────────────────────────────────────────────
# Phase 2: Download
# ─────────────────────────────────────────────────────────────────────────────
printf "\n"
dl_total_s=""; dl_ttfb_ms=""; i=0

# Start all download streams in parallel, each writing elapsed+bytes to a temp file
tmpdir=$(mktemp -d)
for i in $(seq 1 $PARALLEL); do
  (
    result=$(curl -s -o /dev/null \
      -w "%{speed_download} %{time_starttransfer}" \
      "https://speed.cloudflare.com/__down?bytes=$((DL_MB * 1048576))&r=${i}" 2>/dev/null)
    printf "%s" "$result" > "${tmpdir}/dl${i}"
  ) &
done

# Show spinner while waiting
spinner=0
while kill -0 $(jobs -p) 2>/dev/null; do
  case $((spinner % 4)) in
    0) s='-';; 1) s='\\';; 2) s='|';; 3) s='/';;
  esac
  status "downloading ${PARALLEL}x${DL_MB} MB  ${s}"
  spinner=$((spinner + 1))
  sleep 0.2
done
wait

# Aggregate: sum bytes/sec across streams (simultaneous so time is shared)
total_bps=0
for i in $(seq 1 $PARALLEL); do
  f="${tmpdir}/dl${i}"
  [ -f "$f" ] || continue
  bps=$(awk '{print $1}' < "$f")
  ttfb=$(awk '{print $2}' < "$f")
  total_bps=$(awk "BEGIN { print $total_bps + $bps }")
  [ -z "$dl_ttfb_ms" ] && dl_ttfb_ms=$(to_ms "$ttfb")
done
dl_peak=$(to_mbps "$total_bps")
rm -rf "$tmpdir"

printf "\r${CLR}  ${GRN}download${RST}  ${BOLD}%s Mbps${RST}  ${DIM}(%d parallel streams x %d MB)${RST}\n" \
  "$dl_peak" "$PARALLEL" "$DL_MB"

# ─────────────────────────────────────────────────────────────────────────────
# Phase 3: Upload
# ─────────────────────────────────────────────────────────────────────────────
printf "\n"
ul_total_bps=0
tmpdir2=$(mktemp -d)

for i in $(seq 1 $PARALLEL); do
  bytes=$((UL_MB * 1048576))
  (
    speed=$(dd if=/dev/zero bs=1048576 count="$UL_MB" 2>/dev/null \
      | curl -s -X POST \
          --data-binary @- \
          -H "Content-Type: application/octet-stream" \
          -H "Content-Length: $bytes" \
          -o /dev/null \
          -w "%{speed_upload}" \
          "https://speed.cloudflare.com/__up?r=${i}" 2>/dev/null)
    printf "%s" "$speed" > "${tmpdir2}/ul${i}"
  ) &
done

spinner=0
while kill -0 $(jobs -p) 2>/dev/null; do
  case $((spinner % 4)) in
    0) s='-';; 1) s='\\';; 2) s='|';; 3) s='/';; esac
  status "uploading ${PARALLEL}x${UL_MB} MB  ${s}"
  spinner=$((spinner + 1))
  sleep 0.2
done
wait

for i in $(seq 1 $PARALLEL); do
  f="${tmpdir2}/ul${i}"
  [ -f "$f" ] || continue
  bps=$(cat "$f")
  ul_total_bps=$(awk "BEGIN { print $ul_total_bps + $bps }")
done
ul_peak=$(to_mbps "$ul_total_bps")
rm -rf "$tmpdir2"

printf "\r${CLR}  ${GRN}upload${RST}    ${BOLD}%s Mbps${RST}  ${DIM}(%d parallel streams x %d MB)${RST}\n" \
  "$ul_peak" "$PARALLEL" "$UL_MB"

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
printf "\n  ${DIM}──────────────────────────────${RST}\n"
printf "  %-10s  ${BOLD}%-10s${RST} Mbps\n" "download"  "$dl_peak"
printf "  %-10s  ${BOLD}%-10s${RST} Mbps\n" "upload"    "$ul_peak"
printf "  %-10s  ${BOLD}%-10s${RST} ms\n"   "ping"      "$ping_ms"
printf "  %-10s  ${BOLD}%-10s${RST} ms\n"   "jitter"    "$jitter_ms"
printf "  %-10s  ${BOLD}%-10s${RST}%%\n"    "loss"      "$loss_pct"
[ -n "$dl_ttfb_ms" ] && printf "  %-10s  ${BOLD}%-10s${RST} ms\n" "ttfb" "$dl_ttfb_ms"
[ -n "$pop"        ] && printf "  %-10s  ${BOLD}%s${RST}\n"       "pop"  "$pop"
printf "  ${DIM}──────────────────────────────${RST}\n\n"
