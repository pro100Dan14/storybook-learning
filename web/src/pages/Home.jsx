import { useEffect, useRef, useState } from 'react'
import { buildApiUrl } from '../utils/api'
import './Home.css'

function Home() {
  const [name, setName] = useState('Герой')
  const [age, setAge] = useState(6)
  const [theme, setTheme] = useState('волшебный лес')
  const [pages, setPages] = useState(3)
  const [photo, setPhoto] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const pollAbortRef = useRef({ cancelled: false })

  const handlePhotoChange = (e) => {
    const file = e.target.files[0]
    if (!file) {
      setPhoto(null)
      return
    }

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      setPhoto({
        file,
        base64: event.target.result,
        mimeType: file.type
      })
      setError(null)
    }
    reader.onerror = () => {
      setError('Failed to read photo')
      setPhoto(null)
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setResult(null)

    if (!photo) {
      setError('Please select a photo')
      return
    }

    setLoading(true)

    try {
      pollAbortRef.current.cancelled = true
      pollAbortRef.current = { cancelled: false }
      const formData = new FormData()
      formData.append('photo', photo.file)
      formData.append('name', name.trim() || 'Герой')
      formData.append('age', String(Number(age) || 6))
      formData.append('theme', theme.trim() || 'волшебный лес')
      formData.append('sceneCount', String(Number(pages) || 3))

      formData.append('includeDataUrl', 'false')
      formData.append('async', 'true')

      const response = await fetch(buildApiUrl('/api/generate-images'), {
        method: 'POST',
        body: formData,
      })

      const rawText = await response.text()
      let data
      try {
        data = JSON.parse(rawText)
      } catch {
        throw new Error(
          `Invalid JSON response (${response.status}): ${rawText.slice(0, 300)}`
        )
      }

      if (!response.ok) {
        throw new Error(data.message || data.error || `HTTP ${response.status}`)
      }

      if (!data.ok) {
        throw new Error(data.message || data.error || 'Generation failed')
      }

      if (data.status === 'processing' && data.statusUrl) {
        const finalData = await pollSeedreamStatus(
          data.statusUrl,
          pollAbortRef,
          5000,
          6 * 60 * 1000
        )
        if (!finalData.ok) {
          throw new Error(finalData.message || finalData.error || 'Generation failed')
        }
        setResult(finalData)
      } else {
        setResult(data)
      }
    } catch (err) {
      setError(err.message || 'Failed to generate book')
      console.error('Book generation error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    return () => {
      pollAbortRef.current.cancelled = true
    }
  }, [])

  return (
    <div className="home-container">
      <div className="home-content">
        <h1>Book Generator</h1>
        <p className="subtitle">Generate a personalized children's book from a photo</p>

        <form onSubmit={handleSubmit} className="book-form">
          <div className="form-group">
            <label htmlFor="name">Character Name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Герой"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="age">Age</label>
            <input
              id="age"
              type="number"
              min="1"
              max="10"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="theme">Theme</label>
            <input
              id="theme"
              type="text"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="волшебный лес"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="pages">Number of Scenes</label>
            <input
              id="pages"
              type="number"
              min="1"
              max="6"
              value={pages}
              onChange={(e) => setPages(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="photo">Photo</label>
            <input
              id="photo"
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              disabled={loading}
            />
            {photo && (
              <div className="photo-preview">
                <img src={photo.base64} alt="Preview" />
                <span>{photo.file.name}</span>
              </div>
            )}
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading || !photo} className="submit-button">
            {loading ? 'Generating...' : 'Generate Book'}
          </button>
        </form>

        {result && (
          <div className="result-container">
            <h2>Generated Story</h2>
            {result.storyText && (
              <pre className="story-text">{result.storyText}</pre>
            )}
            <h2>Illustrations</h2>
            <div className="photo-preview">
              {result.anchorImage && (result.anchorImage.dataUrl || result.anchorImage.url) && (
                <div>
                  <span>Anchor</span>
                  <img
                    src={result.anchorImage.dataUrl || result.anchorImage.url}
                    alt="Anchor"
                  />
                </div>
              )}
              {Array.isArray(result.sceneImages) && result.sceneImages.map((img, idx) => {
                const src = img.dataUrl || img.url
                return (
                  <div key={img.filename || idx}>
                    <span>Scene {idx + 1}</span>
                    {src ? (
                      <img src={src} alt={`Scene ${idx + 1}`} />
                    ) : (
                      <span>Image unavailable</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

async function pollSeedreamStatus(statusUrl, abortRef, intervalMs, timeoutMs) {
  const start = Date.now()

  while (true) {
    if (abortRef?.current?.cancelled) {
      throw new Error('Generation cancelled')
    }

    const response = await fetch(buildApiUrl(statusUrl))
    const rawText = await response.text()
    let data
    try {
      data = JSON.parse(rawText)
    } catch {
      throw new Error(`Invalid JSON response (${response.status})`)
    }

    if (!response.ok) {
      throw new Error(data.message || data.error || `HTTP ${response.status}`)
    }

    if (data.status === 'processing') {
      if (Date.now() - start > timeoutMs) {
        throw new Error('Generation is taking too long. Please try again.')
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
      continue
    }

    return data
  }
}

export default Home


