import { useEffect, useRef } from 'react'
import MessageBubble from './MessageBubble.jsx'

const CAPABILITIES = [
  {
    icon: '🖱️',
    title: 'Sessions & Events',
    desc: 'Explore fact_session and fact_event — session counts, bounce rates, page views, and add-to-cart actions across Kroger digital properties.',
  },
  {
    icon: '🔍',
    title: 'Search Analysis',
    desc: 'Analyze search terms from fact_event — top queries, search volume trends, and search-to-cart behavior.',
  },
  {
    icon: '🛒',
    title: 'Add-to-Cart & Orders',
    desc: 'Track add-to-cart quantities from fact_event and order submissions, revenue, and status from fact_order.',
  },
  {
    icon: '🚚',
    title: 'Fulfillment',
    desc: 'Analyze fact_order_fulfillment — fulfillment method breakdowns (pickup vs delivery vs ship), timeslot availability, and fees.',
  },
  {
    icon: '📱',
    title: 'Channel & Device',
    desc: 'Segment by channel (dim_channel), banner (dim_banner), device platform (dim_device_platform), and modality (dim_modality).',
  },
  {
    icon: '👤',
    title: 'Visitor Analytics',
    desc: 'fact_visitor — new vs returning visitors, authentication rates, visit frequency, and first/last visit dates.',
  },
]

const SUGGESTIONS = [
  'How many sessions were there in the past 7 days?',
  'What is the average session duration in minutes over the last 30 days?',
  'What are the top 10 most searched terms this week?',
  'What percentage of sessions had an add-to-cart in the last 30 days?',
  'Break down orders by fulfillment method (pickup vs delivery) last week',
  'What share of visitors were new vs returning last month?',
  'Show me session counts by device platform this month',
  'Which scenarios had the most events in the last 30 days?',
]

export default function ChatWindow({ messages, onSuggest }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {messages.length === 0 && (
        <div style={{ maxWidth: 780, width: '100%', margin: '0 auto' }}>
          {/* Hero */}
          <div
            style={{
              background: 'linear-gradient(135deg, #003b7a 0%, #0056A2 50%, #004080 100%)',
              borderRadius: 16,
              padding: '28px 32px',
              color: '#fff',
              marginBottom: 20,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <svg
              style={{ position: 'absolute', right: 0, top: 0, height: '100%', opacity: 0.25, pointerEvents: 'none' }}
              viewBox="0 0 260 120"
              preserveAspectRatio="xMaxYMid slice"
              width="260"
            >
              {[...Array(20)].map((_, i) => {
                const angle = (i / 20) * Math.PI - Math.PI / 2
                return (
                  <line
                    key={i}
                    x1="260" y1="60"
                    x2={260 + Math.cos(angle) * 220}
                    y2={60 + Math.sin(angle) * 220}
                    stroke={i % 4 === 0 ? '#FFD700' : '#7ab3e0'}
                    strokeWidth={i % 4 === 0 ? 1.5 : 0.6}
                  />
                )
              })}
              <circle cx="260" cy="60" r="14" fill="none" stroke="#7ab3e0" strokeWidth="2" />
              <circle cx="260" cy="60" r="5" fill="#FFD700" />
              <circle cx="140" cy="28" r="3.5" fill="#FFD700" />
              <circle cx="170" cy="90" r="2.5" fill="#FFD700" />
            </svg>

            <div style={{ position: 'relative' }}>
              <div style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.7, marginBottom: 6 }}>
                Kroger · Behavioral Analytics
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
                Behavioral Analytics SME Agent
              </div>
              <div style={{ fontSize: 14, opacity: 0.85, lineHeight: 1.6, maxWidth: 480 }}>
                Your AI guide to the <strong>Kroger Behavioral Analytics Data Mart</strong> —
                covering digital sessions, click events, product engagement, and funnel analytics.
                Ask your question in plain English — your AI assistant will query the mart and respond with clear, data-backed answers.
              </div>
            </div>
          </div>

          {/* Capability cards */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#003b7a', marginBottom: 12 }}>
              Mart Capabilities
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              {CAPABILITIES.map((c) => (
                <div
                  key={c.title}
                  style={{
                    background: '#fff',
                    border: '1px solid #b3cfe8',
                    borderRadius: 12,
                    padding: '14px 16px',
                    boxShadow: '0 1px 4px rgba(0, 86, 162, 0.07)',
                  }}
                >
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{c.icon}</div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#0056A2', marginBottom: 4 }}>{c.title}</div>
                  <div style={{ fontSize: 12, color: '#666', lineHeight: 1.5 }}>{c.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Sample questions */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#003b7a', marginBottom: 10 }}>
              Sample Questions
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {SUGGESTIONS.map((q) => (
                <button key={q} className="suggest-btn" onClick={() => onSuggest(q)}>
                  <span style={{ color: '#0056A2', fontSize: 14, flexShrink: 0 }}>›</span>
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {messages.map((msg, i) => (
        <MessageBubble key={i} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
