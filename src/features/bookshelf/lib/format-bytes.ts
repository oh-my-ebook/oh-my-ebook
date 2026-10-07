const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

export function formatBytes(bytes: number): string {
  const size = Math.max(0, bytes)
  const unit = Math.min(Math.floor(Math.log2(Math.max(1, size)) / 10), UNITS.length - 1)
  const value = size / 1024 ** unit
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: unit === 0 ? 0 : 1 }).format(value)} ${UNITS[unit]}`
}
