import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 400, padding: 40,
        }}>
          <div style={{
            background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: 16, padding: '40px 48px', textAlign: 'center', maxWidth: 480,
          }}>
            <AlertTriangle size={48} color="#ef4444" style={{ marginBottom: 16 }} />
            <h3 style={{ color: '#f87171', fontSize: 20, marginBottom: 8 }}>Something went wrong</h3>
            <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>
              {this.state.error?.message || 'An unexpected error occurred. Please try again.'}
            </p>
            <button
              onClick={this.handleRetry}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171', padding: '10px 24px', borderRadius: 8,
                cursor: 'pointer', fontSize: 14, fontWeight: 500,
              }}
            >
              <RefreshCw size={16} /> Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
