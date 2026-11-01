import { Component, type ReactNode } from 'react';

/**
 * If one part of a page fails to draw (a bad response, a slow chunk, a bug), the visitor sees a calm message and a way
 * forward instead of a blank screen, and the rest of the shop (header, bag, footer) keeps working.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidUpdate(prev: { resetKey?: string }) { if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false }); }
  componentDidCatch(error: unknown) { try { console.error('page error', error); } catch { /* ignore */ } }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="pl-wrap empty" role="alert">
        <span className="lbl muted">Something went wrong</span>
        <h1 className="h2">This page could not load.</h1>
        <p className="muted">Your bag and your orders are safe. Please try again.</p>
        <div className="row-gap"><button type="button" className="btn btn--dark" onClick={() => window.location.reload()}>Reload the page</button><a className="btn btn--ghost" href="#/shop">Back to the shop</a></div>
      </div>
    );
  }
}
