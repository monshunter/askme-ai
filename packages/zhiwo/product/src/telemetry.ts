/** Low-cardinality product metrics and content-free structured request logs. */

interface CounterKey {
  name: string
  labels: Record<string, string>
}

function serializeKey(key: CounterKey): string {
  return `${key.name}\0${Object.entries(key.labels).sort().map(([name, value]) => `${name}=${value}`).join('\0')}`
}

function metricLabels(labels: Record<string, string>): string {
  const values = Object.entries(labels).sort().map(([name, value]) => (
    `${name}="${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
  ))
  return values.length === 0 ? '' : `{${values.join(',')}}`
}

/** In-process telemetry with an optional JSON logger and Prometheus text projection. */
export class ZhiwoTelemetry {
  private readonly counters = new Map<string, { key: CounterKey; value: number }>()
  private activeGenerations = 0

  /** @param logLevel - `silent` for tests or `info` for content-free JSON lines. */
  public constructor(private readonly logLevel: 'silent' | 'info') {}

  /**
   * Increment one low-cardinality counter.
   * @param name - fixed metric name.
   * @param labels - fixed route, status, scope, or result labels.
   * @param amount - positive increment, defaulting to one.
   */
  public increment(name: string, labels: Record<string, string> = {}, amount = 1): void {
    const key = { name, labels }
    const serialized = serializeKey(key)
    const current = this.counters.get(serialized)
    this.counters.set(serialized, { key, value: (current?.value ?? 0) + amount })
  }

  /** Increment the active-generation gauge after all concurrency checks pass. */
  public generationStarted(): void {
    this.activeGenerations += 1
  }

  /** Decrement the active-generation gauge when a streamed turn settles. */
  public generationFinished(): void {
    this.activeGenerations = Math.max(0, this.activeGenerations - 1)
  }

  /**
   * Emit a content-free request record and update HTTP metrics.
   * @param record - stable request identity, normalized route, status, latency, and safe error code.
   */
  public request(record: {
    requestId: string
    route: string
    status: number
    latencyMs: number
    errorCode?: string
  }): void {
    this.increment('zhiwo_http_requests_total', { route: record.route, status: String(record.status) })
    this.increment('zhiwo_http_request_duration_milliseconds_sum', { route: record.route }, record.latencyMs)
    this.increment('zhiwo_http_request_duration_milliseconds_count', { route: record.route })
    if (this.logLevel === 'silent') return
    process.stdout.write(`${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'zhiwo',
      requestId: record.requestId,
      route: record.route,
      status: record.status,
      latencyMs: record.latencyMs,
      ...record.errorCode === undefined ? {} : { errorCode: record.errorCode },
    })}\n`)
  }

  /**
   * Render the public metric registry without visitor or content labels.
   * @returns Prometheus text without guest, session, source, path, content, cookie, or IP labels.
   */
  public prometheus(): string {
    const lines = ['# TYPE zhiwo_active_generations gauge', `zhiwo_active_generations ${this.activeGenerations}`]
    for (const { key, value } of [...this.counters.values()].sort((left, right) => (
      serializeKey(left.key).localeCompare(serializeKey(right.key), 'en')
    ))) lines.push(`${key.name}${metricLabels(key.labels)} ${value}`)
    return `${lines.join('\n')}\n`
  }
}
