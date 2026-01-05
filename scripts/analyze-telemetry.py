#!/usr/bin/env python3
"""
Telemetry Analysis Script
Analyzes the interlock_events.jsonl from the autonomous run
"""

import json
from datetime import datetime
from collections import Counter, defaultdict
import statistics

import os
JSONL_PATH = os.path.join("logs", "interlock_events.jsonl")

print(f"\n=== Analyzing Telemetry from {JSONL_PATH} ===\n")

# Read and parse JSONL
events = []
with open(JSONL_PATH, 'r') as f:
    for line in f:
        if line.strip():
            events.append(json.loads(line))

health_windows = [e for e in events if e.get('event_type') == 'health_window']
interventions = [e for e in events if e.get('event_type') == 'intervention']

print(f"📊 Total Events: {len(events):,}")
print(f"   - Health Windows: {len(health_windows):,}")
print(f"   - Interventions: {len(interventions):,}")

# Time range
if health_windows:
    start_time = datetime.fromisoformat(health_windows[0]['timestamp'].replace('Z', '+00:00'))
    end_time = datetime.fromisoformat(health_windows[-1]['timestamp'].replace('Z', '+00:00'))
    duration_hours = (end_time - start_time).total_seconds() / 3600
    
    print(f"\n⏱️  Time Range:")
    print(f"   Start: {start_time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"   End:   {end_time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"   Duration: {duration_hours:.2f} hours ({duration_hours * 60:.1f} minutes)")

# Latency analysis
latencies = [hw['metrics']['latency_p95_ms'] for hw in health_windows]
avg_latency = statistics.mean(latencies)
max_latency = max(latencies)
min_latency = min(latencies)
median_latency = statistics.median(latencies)

print(f"\n📈 Latency (P95):")
print(f"   Average: {avg_latency:.1f}ms")
print(f"   Median:  {median_latency:.1f}ms")
print(f"   Min:     {min_latency:.1f}ms")
print(f"   Max:     {max_latency:.1f}ms")

# Threshold breaches
threshold_breaches = [hw for hw in health_windows 
                     if hw['metrics']['latency_p95_ms'] > hw['thresholds']['latency_threshold_ms']]
breach_rate = (len(threshold_breaches) / len(health_windows)) * 100

print(f"\n⚠️  Latency Threshold Breaches:")
print(f"   Count: {len(threshold_breaches):,} / {len(health_windows):,}")
print(f"   Rate: {breach_rate:.1f}%")

# Request volume
total_requests = sum(hw['metrics']['request_count'] for hw in health_windows)
avg_requests_per_window = total_requests / len(health_windows) if health_windows else 0

print(f"\n📦 Request Volume:")
print(f"   Total: {total_requests:,}")
print(f"   Avg per window (5s): {avg_requests_per_window:.1f}")
print(f"   Estimated QPS: {avg_requests_per_window / 5:.1f}")

# Error analysis
error_rates = [hw['metrics']['error_rate'] for hw in health_windows]
avg_error_rate = statistics.mean(error_rates)
max_error_rate = max(error_rates)

print(f"\n❌ Error Rates:")
print(f"   Average: {avg_error_rate * 100:.2f}%")
print(f"   Max: {max_error_rate * 100:.2f}%")

# Intervention analysis
if interventions:
    print(f"\n🔧 Interventions ({len(interventions):,}):")
    
    trigger_counts = Counter(i['trigger'] for i in interventions)
    print(f"   Top Triggers:")
    for trigger, count in trigger_counts.most_common(5):
        print(f"      - {trigger}: {count:,}")
    
    # State transitions
    transitions = Counter(f"{i['previous_state']} → {i['new_state']}" for i in interventions)
    print(f"\n   State Transitions:")
    for transition, count in transitions.most_common(5):
        print(f"      - {transition}: {count:,}")

# Latency distribution (buckets)
buckets = {
    '0-100ms': 0,
    '100-500ms': 0,
    '500-1000ms': 0,
    '1000-2000ms': 0,
    '2000-5000ms': 0,
    '5000ms+': 0
}

for lat in latencies:
    if lat < 100:
        buckets['0-100ms'] += 1
    elif lat < 500:
        buckets['100-500ms'] += 1
    elif lat < 1000:
        buckets['500-1000ms'] += 1
    elif lat < 2000:
        buckets['1000-2000ms'] += 1
    elif lat < 5000:
        buckets['2000-5000ms'] += 1
    else:
        buckets['5000ms+'] += 1

print(f"\n📊 Latency Distribution:")
for range_name, count in buckets.items():
    pct = (count / len(latencies)) * 100 if latencies else 0
    bar = '█' * int(pct / 2)
    print(f"   {range_name:15} {bar:50} {pct:5.1f}% ({count:,})")

# Threshold changes over time
thresholds = [hw['thresholds']['latency_threshold_ms'] for hw in health_windows]
unique_thresholds = sorted(set(thresholds))
if len(unique_thresholds) > 1:
    print(f"\n🔄 Threshold Changes Detected:")
    for threshold in unique_thresholds:
        count = thresholds.count(threshold)
        pct = (count / len(thresholds)) * 100
        print(f"   {threshold}ms: {count:,} windows ({pct:.1f}%)")

print("\n")
