import React, { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';

// Simple constants for theme colors from request details
const COLORS = {
  primary: '#1976d2',
  secondary: '#90caf9',
  accent: '#fbc02d'
};

// Helper to format seconds to SRT-like time (for preview labels if needed)
function formatTime(s) {
  const ms = Math.floor((s % 1) * 1000);
  const total = Math.floor(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const two = (n) => n.toString().padStart(2, '0');
  const three = (n) => n.toString().padStart(3, '0');
  return `${two(h)}:${two(m)}:${two(sec)},${three(ms)}`;
}

// PUBLIC_INTERFACE
function App() {
  /**
   * This component implements:
   * - Top navbar
   * - Left upload panel for video and subtitles
   * - Central video preview with overlay rendering of cues
   * - Right sidebar with actions (process, download) and status/progress
   * - Calls backend endpoints:
   *   POST /reposition/subtitles (JSON of cues)
   *   POST /reposition/subtitles/download (SRT file)
   */
  const [theme, setTheme] = useState('light');

  const [videoFile, setVideoFile] = useState(null);
  const [subtitleFile, setSubtitleFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [status, setStatus] = useState('Idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [cues, setCues] = useState([]); // repositioned cues from backend
  const [isProcessing, setIsProcessing] = useState(false);
  const [includePositionHint, setIncludePositionHint] = useState(true);
  const [backendBaseUrl, setBackendBaseUrl] = useState('');

  const videoRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);

  // Determine backend base url (configurable via env if provided during deployment)
  useEffect(() => {
    // If a REACT_APP_BACKEND_URL is provided by environment on deploy, use it
    const envUrl = process.env.REACT_APP_BACKEND_URL;
    if (envUrl) {
      setBackendBaseUrl(envUrl.replace(/\/+$/, ''));
    } else {
      // default to same host but port 3001 (as provided in work item running_containers)
      try {
        const loc = window.location;
        const proto = loc.protocol;
        const host = loc.hostname;
        // Keep pathless base; prefer 3001 for backend proxy
        setBackendBaseUrl(`${proto}//${host}:3001`);
      } catch {
        setBackendBaseUrl('');
      }
    }
  }, []);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Cleanup video object URL when file changes
  useEffect(() => {
    if (videoFile) {
      const url = URL.createObjectURL(videoFile);
      setVideoUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setVideoUrl('');
    }
  }, [videoFile]);

  const onTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime || 0);
    }
  };

  const activeCues = useMemo(() => {
    if (!cues || !cues.length) return [];
    return cues.filter(c => currentTime >= c.start && currentTime <= c.end);
  }, [cues, currentTime]);

  const overlayPositionStyle = (position) => {
    // Map 'top'/'bottom' to overlay style
    const base = {
      position: 'absolute',
      left: '50%',
      transform: 'translateX(-50%)',
      maxWidth: '80%',
      color: '#fff',
      background: 'rgba(0,0,0,0.55)',
      padding: '6px 10px',
      borderRadius: 6,
      fontSize: 16,
      lineHeight: 1.35,
      textAlign: 'center',
      boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      border: `1px solid rgba(255,255,255,0.25)`
    };
    if (position === 'top') {
      return { ...base, top: '6%' };
    }
    // default bottom
    return { ...base, bottom: '6%' };
  };

  const handleVideoChange = (e) => {
    setVideoFile(e.target.files?.[0] || null);
  };

  const handleSubChange = (e) => {
    setSubtitleFile(e.target.files?.[0] || null);
  };

  // PUBLIC_INTERFACE
  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
  };

  const resetState = () => {
    setCues([]);
    setStatus('Idle');
    setProgress(0);
    setError('');
  };

  const validateInputs = () => {
    if (!videoFile) {
      setError('Please select a video file.');
      return false;
    }
    if (!subtitleFile) {
      setError('Please select a subtitle file (SRT).');
      return false;
    }
    setError('');
    return true;
  };

  // PUBLIC_INTERFACE
  async function callRepositionAPI() {
    /**
     * Calls POST /reposition/subtitles to receive JSON cues
     */
    if (!validateInputs()) return;
    if (!backendBaseUrl) {
      setError('Backend URL is not configured.');
      return;
    }
    setIsProcessing(true);
    setStatus('Uploading...');
    setProgress(10);

    try {
      const formData = new FormData();
      formData.append('video', videoFile);
      formData.append('subtitles_file', subtitleFile);

      const resp = await fetch(`${backendBaseUrl}/reposition/subtitles`, {
        method: 'POST',
        body: formData
      });

      setStatus('Processing...');
      setProgress(50);

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Backend error (${resp.status}): ${text}`);
      }

      const data = await resp.json();
      // Expect { cues: [{start,end,text,position}], format, note }
      if (!data || !Array.isArray(data.cues)) {
        throw new Error('Unexpected response format from backend.');
      }
      setCues(data.cues);
      setStatus('Done');
      setProgress(100);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to process files.');
      setStatus('Error');
    } finally {
      setIsProcessing(false);
    }
  }

  // PUBLIC_INTERFACE
  async function downloadRepositionedSRT() {
    /**
     * Calls POST /reposition/subtitles/download to receive an SRT file
     */
    if (!validateInputs()) return;
    if (!backendBaseUrl) {
      setError('Backend URL is not configured.');
      return;
    }
    setIsProcessing(true);
    setStatus('Requesting download...');
    setProgress(30);

    try {
      const formData = new FormData();
      formData.append('video', videoFile);
      formData.append('subtitles_file', subtitleFile);
      formData.append('include_position_hint', String(includePositionHint));

      const resp = await fetch(`${backendBaseUrl}/reposition/subtitles/download`, {
        method: 'POST',
        body: formData
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Backend error (${resp.status}): ${text}`);
      }

      // Some backends may respond with application/x-subrip; handle both blob and text
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      const baseName =
        (subtitleFile?.name ? subtitleFile.name.replace(/\.[^.]+$/, '') : 'subtitles') +
        '_repositioned.srt';
      a.download = baseName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setStatus('Downloaded');
      setProgress(100);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to download repositioned subtitles.');
      setStatus('Error');
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="App" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '10px 16px',
          background: COLORS.primary,
          color: '#fff',
          position: 'sticky',
          top: 0,
          zIndex: 10
        }}
      >
        <div style={{ fontWeight: 700, letterSpacing: 0.5 }}>Subtitle Repositioning</div>
        <div style={{ flex: 1 }} />
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          style={{
            background: COLORS.accent,
            color: '#1A1A1A',
            border: 'none',
            padding: '8px 12px',
            borderRadius: 8,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
        </button>
      </header>

      {/* Main Layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '280px 1fr 320px',
          gap: 16,
          padding: 16,
          flex: 1,
          background: theme === 'light' ? '#f7f9fc' : '#121212'
        }}
      >
        {/* Left Sidebar: Uploads */}
        <aside
          style={{
            background: theme === 'light' ? '#fff' : '#1f1f1f',
            border: `1px solid ${theme === 'light' ? '#e5e7eb' : '#333'}`,
            borderRadius: 10,
            padding: 16
          }}
        >
          <h3 style={{ marginTop: 0 }}>Upload</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label
                htmlFor="videoInput"
                style={{
                  display: 'block',
                  fontSize: 14,
                  marginBottom: 6,
                  color: theme === 'light' ? '#333' : '#ddd'
                }}
              >
                Video file
              </label>
              <input id="videoInput" type="file" accept="video/*" onChange={handleVideoChange} />
              {videoFile && (
                <div style={{ fontSize: 12, marginTop: 4, color: '#666' }}>{videoFile.name}</div>
              )}
            </div>

            <div>
              <label
                htmlFor="subtitleInput"
                style={{
                  display: 'block',
                  fontSize: 14,
                  marginBottom: 6,
                  color: theme === 'light' ? '#333' : '#ddd'
                }}
              >
                Subtitles (SRT)
              </label>
              <input id="subtitleInput" type="file" accept=".srt,.vtt" onChange={handleSubChange} />
              {subtitleFile && (
                <div style={{ fontSize: 12, marginTop: 4, color: '#666' }}>{subtitleFile.name}</div>
              )}
            </div>

            <button
              onClick={() => {
                resetState();
                setCues([]);
              }}
              style={{
                background: '#e0e0e0',
                color: '#1a1a1a',
                border: 'none',
                padding: '8px 12px',
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Reset
            </button>
          </div>
        </aside>

        {/* Center: Video Preview */}
        <main
          style={{
            background: theme === 'light' ? '#fff' : '#1f1f1f',
            border: `1px solid ${theme === 'light' ? '#e5e7eb' : '#333'}`,
            borderRadius: 10,
            padding: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            minHeight: 380
          }}
        >
          {!videoUrl ? (
            <div
              style={{
                color: theme === 'light' ? '#666' : '#aaa',
                textAlign: 'center',
                fontSize: 16
              }}
            >
              Select a video to preview overlays.
            </div>
          ) : (
            <div style={{ position: 'relative', width: '100%', maxWidth: 960 }}>
              <video
                ref={videoRef}
                src={videoUrl}
                style={{ width: '100%', borderRadius: 8 }}
                controls
                onTimeUpdate={onTimeUpdate}
              />
              {/* Overlay container for active cues */}
              <div
                aria-label="subtitle-overlay"
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  right: 0,
                  bottom: 0,
                  pointerEvents: 'none'
                }}
              >
                {activeCues.map((cue, idx) => (
                  <div key={`${cue.start}-${cue.end}-${idx}`} style={overlayPositionStyle(cue.position)}>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{cue.text}</div>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 11,
                        color: COLORS.accent
                      }}
                    >
                      {formatTime(cue.start)} → {formatTime(cue.end)} • {cue.position}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>

        {/* Right Sidebar: Actions and Status */}
        <aside
          style={{
            background: theme === 'light' ? '#fff' : '#1f1f1f',
            border: `1px solid ${theme === 'light' ? '#e5e7eb' : '#333'}`,
            borderRadius: 10,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}
        >
          <h3 style={{ marginTop: 0 }}>Actions</h3>

          <button
            onClick={callRepositionAPI}
            disabled={isProcessing || !videoFile || !subtitleFile}
            style={{
              background: isProcessing ? '#9ec3ee' : COLORS.primary,
              color: '#fff',
              border: 'none',
              padding: '10px 14px',
              borderRadius: 8,
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              fontWeight: 700
            }}
          >
            {isProcessing ? 'Processing...' : 'Reposition Subtitles'}
          </button>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 14,
              color: theme === 'light' ? '#333' : '#ddd'
            }}
          >
            <input
              id="includePositionHint"
              type="checkbox"
              checked={includePositionHint}
              onChange={(e) => setIncludePositionHint(e.target.checked)}
            />
            <label htmlFor="includePositionHint">Include [pos: ...] hint in download</label>
          </div>

          <button
            onClick={downloadRepositionedSRT}
            disabled={isProcessing || !videoFile || !subtitleFile}
            style={{
              background: COLORS.accent,
              color: '#1A1A1A',
              border: 'none',
              padding: '10px 14px',
              borderRadius: 8,
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              fontWeight: 700
            }}
          >
            Download Repositioned SRT
          </button>

          <div
            style={{
              marginTop: 8,
              padding: 12,
              borderRadius: 8,
              border: `1px dashed ${theme === 'light' ? '#d1d5db' : '#444'}`
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Status</div>
            <div style={{ fontSize: 14, marginBottom: 6 }}>{status}</div>
            <div
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{
                height: 8,
                background: theme === 'light' ? '#eee' : '#333',
                borderRadius: 999,
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: COLORS.secondary,
                  transition: 'width 0.3s ease'
                }}
              />
            </div>
            {error && (
              <div
                style={{
                  marginTop: 8,
                  color: '#ff6b6b',
                  fontSize: 13
                }}
              >
                {error}
              </div>
            )}
          </div>

          <div
            style={{
              marginTop: 'auto',
              fontSize: 12,
              color: theme === 'light' ? '#666' : '#aaa'
            }}
          >
            Backend: {backendBaseUrl || 'not configured'}
          </div>
        </aside>
      </div>

      {/* Bottom Note */}
      <footer
        style={{
          padding: 12,
          textAlign: 'center',
          background: theme === 'light' ? '#fff' : '#1f1f1f',
          borderTop: `1px solid ${theme === 'light' ? '#e5e7eb' : '#333'}`,
          color: theme === 'light' ? '#555' : '#aaa'
        }}
      >
        Tip: After processing, play the video to see repositioned overlay cues at the correct times.
      </footer>
    </div>
  );
}

export default App;
