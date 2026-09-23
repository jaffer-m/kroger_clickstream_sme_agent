import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: '#c0392b', fontFamily: 'monospace', fontSize: 13 }}>
          <strong>UI error:</strong> {this.state.error.message}
          <br />
          <button
            onClick={() => this.setState({ error: null })}
            style={{ marginTop: 12, padding: '4px 12px', cursor: 'pointer' }}
          >
            Dismiss
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
