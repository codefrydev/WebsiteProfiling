
import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  resetKey?: string;
}
interface State {
  error: string | null;
}

/** Isolates a single widget's render errors so one bad widget can't blank the board. */
export class WidgetErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(err: unknown): State {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center gap-1.5 text-amber-500 text-xs p-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="break-words">Render error: {this.state.error}</span>
        </div>
      );
    }
    return this.props.children;
  }
}
