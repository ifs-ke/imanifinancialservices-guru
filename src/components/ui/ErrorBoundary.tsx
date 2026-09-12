/**
 * @file ErrorBoundary.tsx
 * @description Production-grade React Error Boundary component with graceful fallback UI,
 * diagnostic error logging, and recovery action controls.
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { logError } from '@/lib/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    logError('React ErrorBoundary caught an unhandled render exception', error, {
      componentStack: errorInfo.componentStack,
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  private toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div id="error-boundary-screen" className="min-h-screen w-full flex items-center justify-center p-4 bg-background text-foreground">
          <Card id="error-boundary-card" className="max-w-md w-full border-border/70 shadow-lg bg-card rounded-2xl overflow-hidden">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-3">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <CardTitle className="text-xl font-bold">Something went wrong</CardTitle>
              <CardDescription className="text-sm text-muted-foreground">
                An unexpected application error occurred. We have logged this diagnostic event for review.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-3 pt-2">
              <div className="p-3 bg-muted/50 rounded-xl text-xs font-mono text-muted-foreground break-words border border-border/50">
                {this.state.error?.message || 'Unknown runtime error'}
              </div>

              {this.state.errorInfo?.componentStack && (
                <div>
                  <Button
                    id="toggle-error-stack-btn"
                    variant="ghost"
                    size="sm"
                    onClick={this.toggleDetails}
                    className="w-full text-xs text-muted-foreground flex items-center justify-center gap-1.5 h-7"
                  >
                    {this.state.showDetails ? (
                      <>
                        <ChevronUp className="h-3.5 w-3.5" /> Hide diagnostic stack
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3.5 w-3.5" /> Show diagnostic stack
                      </>
                    )}
                  </Button>
                  {this.state.showDetails && (
                    <pre className="mt-2 p-2.5 bg-neutral-900 text-neutral-300 rounded-lg text-[10px] overflow-x-auto max-h-40 leading-tight">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  )}
                </div>
              )}
            </CardContent>

            <CardFooter className="flex flex-col sm:flex-row gap-2 pt-2 pb-5 px-6">
              <Button
                id="error-reload-page-btn"
                onClick={this.handleReload}
                className="w-full sm:w-1/2 flex items-center justify-center gap-2 rounded-xl"
              >
                <RefreshCw className="h-4 w-4" /> Reload App
              </Button>
              <Button
                id="error-go-home-btn"
                variant="outline"
                onClick={this.handleGoHome}
                className="w-full sm:w-1/2 flex items-center justify-center gap-2 rounded-xl border-border"
              >
                <Home className="h-4 w-4" /> Go to Home
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
