import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Home.css'

function Home() {
  const navigate = useNavigate()
  const [name, setName] = useState('Герой')
  const [theme, setTheme] = useState('волшебный лес')
  const [pages, setPages] = useState(8)
  const [photo, setPhoto] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

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

    if (!photo) {
      setError('Please select a photo')
      return
    }

    setLoading(true)

    try {
      const photoBase64 = stripDataUrlPrefix(photo.base64)
      
      const response = await fetch('/api/book', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim() || 'Герой',
          theme: theme.trim() || 'волшебный лес',
          pages: Number(pages) || 8,
          photoBase64,
          photoMimeType: photo.mimeType,
        }),
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

      if (data.bookId) {
        navigate(`/book/${data.bookId}`)
      } else {
        throw new Error('Book generated but bookId missing in response')
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
            <label htmlFor="pages">Number of Pages</label>
            <input
              id="pages"
              type="number"
              min="1"
              max="12"
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
      </div>
    </div>
  )
}

export default Home


