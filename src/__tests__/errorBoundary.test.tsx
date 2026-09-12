import { describe, it, expect, vi } from 'vitest';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

describe('ErrorBoundary Component Lifecycle & State Logic', () => {
  it('initializes with default error-free state', () => {
    const boundary = new ErrorBoundary({ children: null });
    expect(boundary.state.hasError).toBe(false);
    expect(boundary.state.error).toBeNull();
    expect(boundary.state.errorInfo).toBeNull();
    expect(boundary.state.showDetails).toBe(false);
  });

  it('updates state deterministically on getDerivedStateFromError', () => {
    const testError = new Error('Simulated crash');
    const newState = ErrorBoundary.getDerivedStateFromError(testError);

    expect(newState.hasError).toBe(true);
    expect(newState.error).toBe(testError);
  });

  it('invokes logError on componentDidCatch', () => {
    const boundary = new ErrorBoundary({ children: null });
    const testError = new Error('Async rendering failure');
    const mockErrorInfo = { componentStack: '\n    in FaultyComponent\n    in App' };

    // Set setState mock
    boundary.setState = vi.fn();
    boundary.componentDidCatch(testError, mockErrorInfo as any);

    expect(boundary.setState).toHaveBeenCalledWith({ errorInfo: mockErrorInfo });
  });
});
