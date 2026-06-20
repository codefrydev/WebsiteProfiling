export function EmptyData({ message = 'No data available' }: { message?: string } = {}) {
  return <p className="text-xs text-muted-foreground py-4 text-center">{message}</p>;
}
