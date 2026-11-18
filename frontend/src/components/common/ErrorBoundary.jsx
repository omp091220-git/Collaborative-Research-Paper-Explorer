import React from 'react';
import { AlertTriangle, RefreshCw, Home, RotateCcw } from 'lucide-react';
import Button from './Button';

/**
 * Production-Quality React Error Boundary Component
 * Catches unhandled JavaScript runtime exceptions in child component trees,
 * prevents the application from unmounting to a blank white screen, and renders
 * an informative fallback UI with recovery actions.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an unhandled exception:', error, errorInfo);
    this.setState({ errorInfo });
    if (this.props.onError) {
      try {
        this.props.onError(error, errorInfo);
      } catch (e) {
        console.warn('ErrorBoundary onError callback error:', e);
      }
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return typeof this.props.fallback === 'function'
          ? this.props.fallback({
              error: this.state.error,
              reset: this.handleReset,
            })
          : this.props.fallback;
      }

      const isCompact = this.props.compact || false;

      if (isCompact) {
        return (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 my-2 space-y-2 select-none">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="text-xs font-bold">
                {this.props.title || 'Component Error'}
              </span>
            </div>
            <p className="text-[11px] text-rose-300 font-mono">
              {this.state.error?.message || 'An unexpected rendering error occurred.'}
            </p>
            <div className="pt-1">
              <button
                type="button"
                onClick={this.handleReset}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-400 hover:underline cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Retry Component</span>
              </button>
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-[380px] w-full flex items-center justify-center p-6 select-none animate-fadeIn">
          <div className="max-w-lg w-full bg-theme-card rounded-2xl border border-theme-subtle p-6 sm:p-8 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto shadow-sm">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg font-bold text-theme-main">
                {this.props.title || 'Something went wrong in this section'}
              </h2>
              <p className="text-xs text-theme-secondary leading-relaxed">
                {this.props.description ||
                  'A runtime error prevented this component from displaying correctly. You can try recovering this view or reloading the page.'}
              </p>
            </div>

            {this.state.error && (
              <div className="text-left bg-theme-elevated p-3 rounded-xl border border-theme-subtle overflow-x-auto max-h-36 overflow-y-auto">
                <p className="text-[11px] font-mono text-rose-400 font-semibold break-words">
                  {this.state.error.name}: {this.state.error.message}
                </p>
                {this.state.errorInfo?.componentStack && (
                  <pre className="text-[10px] font-mono text-theme-muted mt-1 whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack.slice(0, 300)}
                  </pre>
                )}
              </div>
            )}

            <div className="flex items-center justify-center gap-2.5 pt-2 flex-wrap">
              <Button
                variant="primary"
                size="sm"
                iconLeft={RotateCcw}
                onClick={this.handleReset}
              >
                <span>Try Again</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                iconLeft={RefreshCw}
                onClick={this.handleReload}
              >
                <span>Reload Page</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                iconLeft={Home}
                onClick={() => (window.location.href = '/explore')}
              >
                <span>Explore Papers</span>
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
