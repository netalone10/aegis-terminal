import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

interface EmailLog {
  id: string
  to: string
  subject: string
  status: 'sent' | 'failed'
  timestamp: string
}

export default function EmailDashboard() {
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [logs, setLogs] = useState<EmailLog[]>([])

  // Check email service status
  const { data: status } = useQuery({
    queryKey: ['email-status'],
    queryFn: () => fetch(`${API_BASE}/api/email/status`).then(r => r.json()),
    refetchInterval: 30000,
  })

  // Send email mutation
  const sendMutation = useMutation({
    mutationFn: async (data: { to: string; subject: string; html: string }) => {
      const res = await fetch(`${API_BASE}/api/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      return res.json()
    },
    onSuccess: (data) => {
      if (data.success) {
        setLogs(prev => [{
          id: data.id,
          to,
          subject,
          status: 'sent',
          timestamp: new Date().toISOString(),
        }, ...prev])
        setTo('')
        setSubject('')
        setBody('')
      }
    },
  })

  // Send trade alert mutation
  const tradeAlertMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`${API_BASE}/api/email/trade-alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      return res.json()
    },
    onSuccess: (data) => {
      if (data.success) {
        setLogs(prev => [{
          id: data.id,
          to: 'admin@aegisterminal.app',
          subject: `Trade Alert`,
          status: 'sent',
          timestamp: new Date().toISOString(),
        }, ...prev])
      }
    },
  })

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    if (!to || !subject || !body) return
    sendMutation.mutate({
      to,
      subject,
      html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h2 style="color: #3b82f6;">${subject}</h2><p>${body}</p><hr><p style="color: #666; font-size: 12px;">Aegis Terminal • ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</p></div>`,
    })
  }

  const handleTestAlert = () => {
    tradeAlertMutation.mutate({
      pair: 'XAUUSD',
      direction: 'LONG',
      entry: '4050.00',
      sl: '4030.00',
      tp: '4100.00',
      reason: 'Test alert from email dashboard',
    })
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>📧 Email Dashboard</h1>
          <p style={{ color: '#666', margin: '5px 0 0' }}>mail.aegisterminal.app</p>
        </div>
        <div style={{
          padding: '8px 16px',
          borderRadius: '8px',
          backgroundColor: status?.api_key === 'configured' ? '#dcfce7' : '#fee2e2',
          color: status?.api_key === 'configured' ? '#166534' : '#991b1b',
          fontSize: '14px',
        }}>
          {status?.api_key === 'configured' ? '✓ Connected' : '✗ Not Configured'}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Send Email Form */}
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Send Email</h2>
          <form onSubmit={handleSend}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>To</label>
              <input
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="recipient@email.com"
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject"
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>Body</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Email content..."
                rows={6}
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', resize: 'vertical' }}
              />
            </div>
            <button
              type="submit"
              disabled={sendMutation.isPending}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: sendMutation.isPending ? 'not-allowed' : 'pointer',
                opacity: sendMutation.isPending ? 0.7 : 1,
              }}
            >
              {sendMutation.isPending ? 'Sending...' : 'Send Email'}
            </button>
          </form>
        </div>

        {/* Quick Actions */}
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Quick Actions</h2>

          <button
            onClick={handleTestAlert}
            disabled={tradeAlertMutation.isPending}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#22c55e',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              marginBottom: '12px',
            }}
          >
            {tradeAlertMutation.isPending ? 'Sending...' : '📊 Send Test Trade Alert'}
          </button>

          <button
            onClick={() => {
              sendMutation.mutate({
                to: 'admin@aegisterminal.app',
                subject: 'CPI Release Alert',
                html: `<div style="font-family: Arial;"><h2>📊 CPI Release</h2><p>Check dashboard for latest CPI data.</p></div>`,
              })
            }}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#f59e0b',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              marginBottom: '12px',
            }}
          >
            📈 Send CPI Alert
          </button>

          <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Service Info</h3>
            <p style={{ fontSize: '13px', color: '#666', margin: '4px 0' }}>Provider: Resend</p>
            <p style={{ fontSize: '13px', color: '#666', margin: '4px 0' }}>From: noreply@aegisterminal.app</p>
            <p style={{ fontSize: '13px', color: '#666', margin: '4px 0' }}>Domain: Verified ✓</p>
          </div>
        </div>
      </div>

      {/* Email Logs */}
      <div style={{ marginTop: '20px', backgroundColor: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Recent Emails</h2>
        {logs.length === 0 ? (
          <p style={{ color: '#666', textAlign: 'center', padding: '40px' }}>No emails sent yet</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <th style={{ textAlign: 'left', padding: '12px', fontSize: '13px', color: '#666' }}>Time</th>
                <th style={{ textAlign: 'left', padding: '12px', fontSize: '13px', color: '#666' }}>To</th>
                <th style={{ textAlign: 'left', padding: '12px', fontSize: '13px', color: '#666' }}>Subject</th>
                <th style={{ textAlign: 'left', padding: '12px', fontSize: '13px', color: '#666' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '12px', fontSize: '13px' }}>
                    {new Date(log.timestamp).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
                  </td>
                  <td style={{ padding: '12px', fontSize: '13px' }}>{log.to}</td>
                  <td style={{ padding: '12px', fontSize: '13px' }}>{log.subject}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      backgroundColor: log.status === 'sent' ? '#dcfce7' : '#fee2e2',
                      color: log.status === 'sent' ? '#166534' : '#991b1b',
                    }}>
                      {log.status === 'sent' ? '✓ Sent' : '✗ Failed'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
