import { Component, type ErrorInfo, type ReactNode } from "react";
import { log } from "@/lib/logging";
import { v4 as uuidv4 } from "uuid";

interface Props {
  children: ReactNode;
  onError?: (errorId: string, message: string) => void;
}

interface State {
  hasError: boolean;
  errorId: string | null;
  message: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorId: null, message: null };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorId: uuidv4(),
      message: error.message,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    log.system.error("React error boundary caught", {
      userAction: "render",
      errorId: this.state.errorId ?? undefined,
      component: "ErrorBoundary",
      metadata: {
        stack: error.stack,
        componentStack: info.componentStack,
      },
    });
    console.error(error, info);
    if (this.state.errorId && this.state.message) {
      this.props.onError?.(this.state.errorId, this.state.message);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 bg-zinc-950 p-8 text-zinc-100">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="max-w-md text-center text-zinc-400">{this.state.message}</p>
          {this.state.errorId && (
            <p className="font-mono text-sm text-zinc-500">
              Error ID: {this.state.errorId}
            </p>
          )}
          <button
            type="button"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm hover:bg-blue-500"
            onClick={() => window.location.reload()}
          >
            Reload application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
