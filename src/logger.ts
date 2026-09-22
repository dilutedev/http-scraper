interface LogPayload {
  message?: string
  module?: string
  stack_trace?: string
  payload?: Record<string, unknown>
}

function format(errOrPayload: unknown, module?: string, payload?: unknown): string {
  if (errOrPayload instanceof Error) {
    return `[${module ?? "scraper"}] ${errOrPayload.message}`
  }

  const entry = errOrPayload as LogPayload
  return `[${entry.module ?? module ?? "scraper"}] ${entry.message ?? String(errOrPayload)}`
}

export const logger = {
  error(errOrPayload: unknown, module?: string, payload?: unknown): void {
    console.error(format(errOrPayload, module, payload))
  },
}
