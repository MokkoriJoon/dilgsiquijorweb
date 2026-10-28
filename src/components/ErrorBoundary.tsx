import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Global error boundary.
 *
 * Without this, ANY unexpected render error (e.g. a malformed date coming
 * back from Supabase) blanks the whole page to pure white with no clue for
 * the user — which is exactly what happened on the public dashboard. Now we
 * show a friendly message plus a Reload button instead of a blank screen.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep details in the console for debugging.
    console.error('App crashed:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
          <div className="max-w-md w-full bg-white rounded-xl shadow border border-gray-100 p-8 text-center">
            <h1 className="text-lg font-bold text-gray-800">Something went wrong</h1>
            <p className="text-sm text-gray-500 mt-2">
              The page failed to load correctly. Please refresh — if the problem keeps happening,
              let the system administrator know.
            </p>
            <pre className="mt-4 text-[11px] text-left text-red-600 bg-red-50 border border-red-100 rounded-lg p-3 overflow-auto max-h-32">
              {String(this.state.error?.message ?? this.state.error)}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 text-sm font-semibold"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
