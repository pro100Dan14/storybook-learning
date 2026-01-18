import { useState } from 'react'
import './Home.css'

function Home() {
  const [name, setName] = useState('Герой')
  const [theme, setTheme] = useState('волшебный лес')
  const [pages, setPages] = useState(3)
  const [photo, setPhoto] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

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

  const stripDataUrlPrefix = (dataUrl) => {
    if (!dataUrl) return ''
    const commaIndex = dataUrl.indexOf(',')
    return commaIndex >= 0 ? dataUrl.substring(commaIndex + 1) : dataUrl
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
      const formData = new FormData()
      formData.append('photo', photo.file)
      formData.append('name', name.trim() || 'Герой')
      formData.append('theme', theme.trim() || 'волшебный лес')
      formData.append('sceneCount', String(Number(pages) || 3))

      const response = await fetch('/api/generate-images', {
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

      if (data.ok) {
        setResult(data)
      } else {
        throw new Error(data.message || data.error || 'Generation failed')
      }
    } catch (err) {
      setError(err.message || 'Failed to generate book')
      console.error('Book generation error:', err)
    } finally {
      setLoading(false)
    }
  }

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
              {result.anchorImage?.dataUrl && (
                <div>
                  <span>Anchor</span>
                  <img src={result.anchorImage.dataUrl} alt="Anchor" />
                </div>
              )}
              {Array.isArray(result.sceneImages) && result.sceneImages.map((img, idx) => (
                <div key={img.filename || idx}>
                  <span>Scene {idx + 1}</span>
                  {img.dataUrl ? (
                    <img src={img.dataUrl} alt={`Scene ${idx + 1}`} />
                  ) : (
                    <a href={img.url} target="_blank" rel="noreferrer">Open</a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Home


