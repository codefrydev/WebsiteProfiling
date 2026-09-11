export function EmptyData({ message = 'No data available' }: { message?: string } = {}) {
  return <p className="text-xs text-md-sys-on-surface-variant py-4 text-center">{message}</p>;
}
