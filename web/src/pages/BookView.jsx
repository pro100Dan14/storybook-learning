import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import './BookView.css'

function BookView() {
  const { bookId } = useParams()
  const navigate = useNavigate()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [debugMode, setDebugMode] = useState(false)

  useEffect(() => {
    const fetchReport = async () => {
      try {
        setLoading(true)
        setError(null)
        
        const response = await fetch(`/jobs/${bookId}/report.json`)
        
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Book report not found. It may still be generating.')
          }
          throw new Error(`Failed to load report: HTTP ${response.status}`)
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
        setReport(data)
      } catch (err) {
        setError(err.message || 'Failed to load book report')
        console.error('Error loading report:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchReport()
  }, [bookId])

  // Derive generation status
  const generationStatus = report ? (() => {
    const pagesWithImages = report.pages?.filter(p => p.hasImage).length || 0
    const totalPages = report.pages?.length || 0
    
    if (totalPages === 0) return 'ERROR'
    if (pagesWithImages === totalPages) return 'SUCCESS'
    if (pagesWithImages > 0) return 'PARTIAL'
    return 'ERROR'
  })() : null

  // Derive identity status - only show if guard is available and we have real scores
  const identityStatus = report ? (() => {
    const guardAvailable = report.summary?.identityGuardAvailable !== false
    const hasSkipped = report.pages?.some(p => 
      p.similarity === null && (p.error?.includes('skipped') || p.error?.includes('dev'))
    )
    
    // If guard is not available or skipped, treat as skipped
    if (!guardAvailable || hasSkipped) {
      return { status: 'SKIPPED', message: 'Identity check skipped (dev)' }
    }
    
    // Only show identity status if guard is available and we have real scores
    const pagesWithScores = report.pages?.filter(p => p.similarity !== null && p.similarity > 0).length || 0
    if (pagesWithScores === 0) {
      return { status: 'SKIPPED', message: 'Identity check skipped (dev)' }
    }
    
    const passed = report.pages?.filter(p => p.passed).length || 0
    const total = report.pages?.length || 0
    
    if (passed === total) {
      return { status: 'PASSED', message: 'All pages passed identity check' }
    }
    
    return { status: 'PARTIAL', message: `${passed}/${total} pages passed identity check` }
  })() : null

  if (loading) {
    return (
      <div className="book-view-container">
        <div className="book-view-header">
          <h1>Loading Book...</h1>
        </div>
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading your book...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="book-view-container">
        <div className="book-view-header">
          <h1>Book Report</h1>
          <div className="header-actions">
            <button onClick={() => navigate('/')} className="button-secondary">
              Generate Another
            </button>
          </div>
        </div>
        <div className="error-container">
          <div className="error-message">
            <h2>Error Loading Book</h2>
            <p>{error}</p>
            <div className="error-actions">
              <button onClick={() => window.location.reload()} className="button-primary">
                Retry
              </button>
              <button onClick={() => navigate('/')} className="button-secondary">
                Generate Another Book
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="book-view-container">
        <div className="book-view-header">
          <h1>Book Report</h1>
        </div>
        <div className="error-container">
          <div className="error-message">
            <p>No report data available</p>
            <button onClick={() => navigate('/')} className="button-secondary">
              Generate Another Book
            </button>
          </div>
        </div>
      </div>
    )
  }

  const reportUrl = `/jobs/${bookId}/report.html`

  return (
    <div className="book-view-container">
      <div className="book-view-header">
        <h1>Your Book</h1>
        <div className="header-actions">
          <label className="debug-toggle">
            <input
              type="checkbox"
              checked={debugMode}
              onChange={(e) => setDebugMode(e.target.checked)}
            />
            <span>Debug Mode</span>
          </label>
          {debugMode && (
            <a
              href={reportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="button-link"
            >
              Open Report in New Tab
            </a>
          )}
          <button onClick={() => navigate('/')} className="button-secondary">
            Generate Another
          </button>
        </div>
      </div>

      {/* Status badges */}
      <div className="status-badges">
        <div className={`status-badge status-${generationStatus?.toLowerCase()}`}>
          {generationStatus === 'SUCCESS' && '✅ Book Generated Successfully'}
          {generationStatus === 'PARTIAL' && '⚠️ Book Generated (Some images missing)'}
          {generationStatus === 'ERROR' && '❌ Generation Failed'}
        </div>
        {identityStatus && identityStatus.status === 'SKIPPED' && (
          <div className="status-badge status-neutral">
            ℹ️ {identityStatus.message}
          </div>
        )}
        {identityStatus && identityStatus.status !== 'SKIPPED' && debugMode && (
          <div className={`status-badge status-${identityStatus.status.toLowerCase()}`}>
            {identityStatus.message}
          </div>
        )}
      </div>

      {/* Main content: Book Pages or Debug View */}
      {debugMode ? (
        <DebugView reportUrl={reportUrl} report={report} />
      ) : (
        <BookPagesViewer pages={report.pages || []} />
      )}
    </div>
  )
}

// Book Pages Viewer Component
function BookPagesViewer({ pages }) {
  if (!pages || pages.length === 0) {
    return (
      <div className="book-pages-container">
        <div className="no-pages">
          <p>No pages available</p>
        </div>
      </div>
    )
  }

  return (
    <div className="book-pages-container">
      {pages.map((page, index) => (
        <BookPageCard key={page.pageNumber || index} page={page} index={index} />
      ))}
    </div>
  )
}

// Individual Book Page Card
function BookPageCard({ page, index }) {
  const pageNum = page.pageNumber || index + 1
  const hasImage = page.hasImage && page.dataUrl

  return (
    <div className="book-page-card">
      <div className="book-page-header">
        <span className="page-number">Page {pageNum}</span>
      </div>
      <div className="book-page-content">
        {page.pageText ? (
          <div className="page-text">
            {page.pageText}
          </div>
        ) : (
          <div className="page-text-empty">
            <em>No text available for this page</em>
          </div>
        )}
        
        {hasImage ? (
          <div className="page-image-container">
            <img
              src={page.dataUrl}
              alt={`Page ${pageNum}`}
              className="page-image"
            />
          </div>
        ) : (
          <div className="page-image-placeholder">
            <p>📄</p>
            <p className="placeholder-text">
              Image generation didn't return this page. Try generating again.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// Debug View Component
function DebugView({ reportUrl, report }) {
  return (
    <div className="debug-container">
      {report && (
        <div className="debug-section">
          <h2>Similarity Table (Debug)</h2>
          <table className="similarity-table">
            <thead>
              <tr>
                <th>Page</th>
                <th>Has Image</th>
                <th>Similarity</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {report.pages?.map((page, idx) => (
                <tr key={idx}>
                  <td>{page.pageNumber || idx + 1}</td>
                  <td>{page.hasImage ? 'Yes' : 'No'}</td>
                  <td>{page.similarity !== null ? page.similarity.toFixed(3) : 'N/A'}</td>
                  <td className={page.passed ? 'status-pass' : 'status-fail'}>
                    {page.similarity === null ? 'Skipped' : page.passed ? 'PASS' : 'FAIL'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      <div className="debug-section">
        <h2>Raw Report (Debug)</h2>
        <div className="iframe-container">
          <iframe
            src={reportUrl}
            title="Book Report Debug"
            className="report-iframe"
          />
        </div>
      </div>
    </div>
  )
}

export default BookView
