import './index.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AuditViewer from './components/AuditViewer.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

const Root = () => window.location.pathname === '/audit' ? <AuditViewer /> : <App />

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </React.StrictMode>
)
