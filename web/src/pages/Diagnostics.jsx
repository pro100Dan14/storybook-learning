import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { buildApiUrl } from '../utils/api'
import './Diagnostics.css'

function Diagnostics() {
  const navigate = useNavigate()
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true)
        setError(null)
        
        const response = await fetch(buildApiUrl('/api/debug/config'))
        
        if (!response.ok) {
          throw new Error(`Failed to load config: HTTP ${response.status}`)
        }
        
        const rawText = await response.text()
        let data
        try {
          data = JSON.parse(rawText)
        } catch {
          throw new Error(
            `Invalid JSON response (${response.status}): ${rawText.slice(0, 300)}`
          )
        }
        setConfig(data)
      } catch (err) {
        setError(err.message || 'Failed to load diagnostics')
        console.error('Error loading config:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchConfig()
  }, [])

  if (loading) {
    return (
      <div className="diagnostics-container">
        <div className="diagnostics-header">
          <h1>Diagnostics</h1>
          <button onClick={() => navigate('/')} className="button-secondary">
            Back to Home
          </button>
        </div>
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading diagnostics...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="diagnostics-container">
        <div className="diagnostics-header">
          <h1>Diagnostics</h1>
          <button onClick={() => navigate('/')} className="button-secondary">
            Back to Home
          </button>
        </div>
        <div className="error-container">
          <div className="error-message">
            <h2>Error Loading Diagnostics</h2>
            <p>{error}</p>
            <button onClick={() => window.location.reload()} className="button-primary">
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="diagnostics-container">
      <div className="diagnostics-header">
        <h1>Diagnostics</h1>
        <button onClick={() => navigate('/')} className="button-secondary">
          Back to Home
        </button>
      </div>

      <div className="diagnostics-content">
        <div className="diagnostics-section">
          <h2>Configuration</h2>
          <p className="diagnostics-note">
            This page shows non-sensitive configuration values. No API keys or secrets are displayed.
          </p>
          
          {config && (
            <div className="config-code-block">
              <pre><code>{JSON.stringify(config, null, 2)}</code></pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Diagnostics


