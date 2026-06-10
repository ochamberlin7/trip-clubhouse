import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          maxWidth: 480, margin: '80px auto', padding: '32px 24px',
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          background: '#1a1d27', borderRadius: 12, border: '1px solid #f87171',
          color: '#f0f0f0'
        }}>
          <h2 style={{ color: '#f87171', marginBottom: 12 }}>Something went wrong</h2>
          <pre style={{
            background: '#0f1117', padding: 16, borderRadius: 8,
            fontSize: 13, overflowX: 'auto', color: '#fca5a5', whiteSpace: 'pre-wrap'
          }}>
            {this.state.error.message}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 20, padding: '10px 20px', borderRadius: 8,
              background: '#4ade80', color: '#0f1117', fontWeight: 700,
              border: 'none', cursor: 'pointer', fontSize: 15
            }}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
