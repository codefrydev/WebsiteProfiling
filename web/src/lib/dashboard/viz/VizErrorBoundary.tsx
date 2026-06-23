
import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Changing this value resets the boundary (e.g. widget id or a retry counter). */
  resetKey?: unknown;
}

interface State {
  error: Error | null;
}

/**
 * Isolates a single widget's render so a throwing visualization (e.g. a malformed
 * Chart.js dataset) shows a local error instead of crashing the whole dashboard.
 */
export class VizErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center gap-1.5 text-amber-400 text-xs py-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="break-all">Failed to render: {this.state.error.message}</span>
        </div>
      );
    }
    return this.props.children;
  }
}
