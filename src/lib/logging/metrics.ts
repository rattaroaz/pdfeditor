import type { LogCategory, LogOutcome } from "@shared/types";

const MAX_SAMPLES = 64;

export interface MetricEvent {
  name: string;
  durationMs?: number;
  outcome?: LogOutcome;
  category?: LogCategory | string;
}

export interface MetricSummary {
  name: string;
  count: number;
  ok: number;
  fail: number;
  lastDurationMs: number | null;
  minMs: number | null;
  maxMs: number | null;
  avgMs: number | null;
  p95Ms: number | null;
}

export interface MetricsSnapshot {
  startedAt: string;
  totals: { events: number; ok: number; fail: number };
  operations: MetricSummary[];
}

interface Bucket {
  count: number;
  ok: number;
  fail: number;
  samples: number[];
}

const startedAt = new Date().toISOString();
const buckets = new Map<string, Bucket>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? null;
}

function summarize(name: string, bucket: Bucket): MetricSummary {
  const samples = [...bucket.samples].sort((a, b) => a - b);
  const sum = samples.reduce((acc, n) => acc + n, 0);
  return {
    name,
    count: bucket.count,
    ok: bucket.ok,
    fail: bucket.fail,
    lastDurationMs: samples.length > 0 ? bucket.samples[bucket.samples.length - 1]! : null,
    minMs: samples[0] ?? null,
    maxMs: samples[samples.length - 1] ?? null,
    avgMs: samples.length > 0 ? Math.round(sum / samples.length) : null,
    p95Ms: percentile(samples, 95),
  };
}

export function recordMetric(event: MetricEvent): void {
  const name = event.name.trim();
  if (!name) return;

  let bucket = buckets.get(name);
  if (!bucket) {
    bucket = { count: 0, ok: 0, fail: 0, samples: [] };
    buckets.set(name, bucket);
  }

  bucket.count += 1;
  if (event.outcome === "fail") bucket.fail += 1;
  else bucket.ok += 1;

  if (typeof event.durationMs === "number" && Number.isFinite(event.durationMs)) {
    bucket.samples.push(Math.max(0, Math.round(event.durationMs)));
    if (bucket.samples.length > MAX_SAMPLES) {
      bucket.samples.splice(0, bucket.samples.length - MAX_SAMPLES);
    }
  }

  notify();
}

export function getMetricsSnapshot(): MetricsSnapshot {
  const operations = [...buckets.entries()]
    .map(([name, bucket]) => summarize(name, bucket))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return {
    startedAt,
    totals: {
      events: operations.reduce((acc, op) => acc + op.count, 0),
      ok: operations.reduce((acc, op) => acc + op.ok, 0),
      fail: operations.reduce((acc, op) => acc + op.fail, 0),
    },
    operations,
  };
}

export function resetMetrics(): void {
  buckets.clear();
  notify();
}

export function subscribeMetrics(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
