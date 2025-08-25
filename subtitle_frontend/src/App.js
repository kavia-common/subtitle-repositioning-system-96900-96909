import React, { useState, useEffect, useRef } from 'react';
import './App.css';

/**
 * Frontend UI for uploading a video and a subtitle file, sending them to the backend
 * /reposition endpoint, showing status/progress, and enabling download of the response.
 * Backend base URL is expected to be available at http://subtitle_backend:3001/reposition
 * when running in a Docker network, or proxied accordingly in dev. You can also override
 * via REACT_APP_BACKEND_URL env var (see .env.example).
 */

// Supported subtitle formats for input validation and user hints
const SUPPORTED_SUB_EXTENSIONS = ['.srt', '.ass', '.ssa', '.vtt'];

// Helper to get backend URL with sensible defaults
function getBackendUrl() {
  // Allow configuration via environment variable
  const envUrl = process.env.REACT_APP_BACKEND_URL;
  if (envUrl) return envUrl.replace(/\/+$/, '');
  // Default to backend container host and port as specified in task
  return 'http://subtitle_backend:3001';
}

// PUBLIC_INTERFACE
function App() {
  const [theme, setTheme] = useState('light');

  const [videoFile, setVideoFile] = useState(null);
  const [subtitleFile, setSubtitleFile] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | validating | uploading | processing | success | error
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [resultFilename, setResultFilename] = useState('repositioned_subtitles.srt');
  const abortControllerRef = useRef(null);

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // PUBLIC_INTERFACE
  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const onPickVideo = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
    }
  };

  const onPickSubtitle = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const lower = file.name.toLowerCase();
      const valid = SUPPORTED_SUB_EXTENSIONS.some(ext => lower.endsWith(ext));
      if (!valid) {
        setStatus('error');
        setMessage(`Unsupported subtitle format. Supported: ${SUPPORTED_SUB_EXTENSIONS.join(', ')}`);
        return;
      }
      setSubtitleFile(file);
    }
  };

  // Simple filename helper: try to keep subtype of original, default to .srt
  const inferResultFilename = () => {
    if (!subtitleFile) return 'repositioned_subtitles.srt';
    const name = subtitleFile.name;
    const dot = name.lastIndexOf('.');
    const ext = dot >= 0 ? name.substring(dot) : '.srt';
    return name.replace(ext, `.repositioned${ext}`);
  };

  const resetResult = () => {
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
    }
    setDownloadUrl(null);
    setResultFilename('repositioned_subtitles.srt');
  };

  const validateInputs = () => {
    if (!videoFile) {
      setStatus('error');
      setMessage('Please select a video file.');
      return false;
    }
    if (!subtitleFile) {
      setStatus('error');
      setMessage(`Please select a subtitle file (${SUPPORTED_SUB_EXTENSIONS.join(', ')}).`);
      return false;
    }
    const isSubOk = SUPPORTED_SUB_EXTENSIONS.some(ext => subtitleFile.name.toLowerCase().endsWith(ext));
    if (!isSubOk) {
      setStatus('error');
      setMessage(`Unsupported subtitle format. Supported: ${SUPPORTED_SUB_EXTENSIONS.join(', ')}.`);
      return false;
    }
    return true;
  };

  // PUBLIC_INTERFACE
  const handleSubmit = async (e) => {
    e.preventDefault();
    resetResult();
    setProgress(0);

    if (!validateInputs()) return;

    setStatus('validating');
    setMessage('Validating files...');

    // Prepare form data
    const form = new FormData();
    form.append('video', videoFile);
    form.append('subtitle', subtitleFile);

    // Set filename for result hint
    const inferred = inferResultFilename();
    setResultFilename(inferred);

    // Upload and fetch result
    try {
      setStatus('uploading');
      setMessage('Uploading files to backend...');
      abortControllerRef.current = new AbortController();

      // Note: fetch does not provide upload progress; we simulate progress during upload/processing.
      // For actual upload progress, consider XHR with onprogress or a backend that reports chunks.
      simulateProgress(10, 60, 800); // Simulate upload to 60%

      const resp = await fetch(`${getBackendUrl()}/reposition`, {
        method: 'POST',
        body: form,
        signal: abortControllerRef.current.signal,
      });

      if (!resp.ok) {
        const text = await safeReadText(resp);
        throw new Error(text || `Request failed with status ${resp.status}`);
      }

      setStatus('processing');
      setMessage('Processing on server...');
      simulateProgress(60, 90, 600);

      // Expect binary (subtitle file) from backend
      const blob = await resp.blob();
      simulateProgress(90, 100, 200);

      // Create local URL to download
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setStatus('success');
      setMessage('Success! Your repositioned subtitle file is ready.');
      setProgress(100);
    } catch (err) {
      if (err.name === 'AbortError') {
        setStatus('error');
        setMessage('Upload canceled.');
      } else {
        setStatus('error');
        setMessage(err.message || 'Something went wrong while contacting the backend.');
      }
      setProgress(0);
    } finally {
      abortControllerRef.current = null;
    }
  };

  // PUBLIC_INTERFACE
  const cancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const safeReadText = async (resp) => {
    try {
      return await resp.text();
    } catch {
      return '';
    }
  };

  // Simulated progress helper
  const simulateProgress = (from, to, durationMs) => {
    setProgress(prev => Math.max(prev, from));
    const steps = 15;
    const stepTime = durationMs / steps;
    let current = from;
    const increment = (to - from) / steps;
    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      current += increment;
      setProgress(p => Math.min(Math.max(p, Math.round(current)), to));
      if (count >= steps) clearInterval(timer);
    }, stepTime);
  };

  const allowSubmit = !!videoFile && !!subtitleFile && status !== 'uploading' && status !== 'processing';

  return (
    <div className="App">
      <header className="App-header" style={{ paddingTop: 80 }}>
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
        </button>

        <div style={{ maxWidth: 900, width: '100%', padding: 16 }}>
          <NavBar />
          <Hero />

          <UploadCard
            videoFile={videoFile}
            subtitleFile={subtitleFile}
            onPickVideo={onPickVideo}
            onPickSubtitle={onPickSubtitle}
            onSubmit={handleSubmit}
            onCancel={cancelUpload}
            allowSubmit={allowSubmit}
            status={status}
            message={message}
            progress={progress}
          />

          <ResultCard
            downloadUrl={downloadUrl}
            resultFilename={resultFilename}
            onClear={() => {
              resetResult();
              setMessage('');
              setStatus('idle');
            }}
          />

          <FormatsCard />
        </div>
      </header>
    </div>
  );
}

function NavBar() {
  return (
    <nav
      className="navbar"
      style={{
        width: '100%',
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-color)',
        borderRadius: 12,
        padding: '12px 16px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 18 }}>Subtitle Repositioner</div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
        Avoid overlap with burnt-in text
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section
      style={{
        width: '100%',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: 12,
        padding: 24,
        marginBottom: 16,
        textAlign: 'left'
      }}
    >
      <h1 className="title" style={{ margin: 0, fontSize: 24 }}>
        Upload your video and subtitles
      </h1>
      <p className="description" style={{ marginTop: 8, color: 'var(--text-secondary)' }}>
        We detect burnt-in text and reposition your subtitles to avoid overlap. Supported subtitle formats:
        .srt, .ass, .ssa, .vtt
      </p>
    </section>
  );
}

function UploadCard({
  videoFile,
  subtitleFile,
  onPickVideo,
  onPickSubtitle,
  onSubmit,
  onCancel,
  allowSubmit,
  status,
  message,
  progress
}) {
  const uploading = status === 'uploading' || status === 'processing';

  return (
    <section
      style={{
        width: '100%',
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-color)',
        borderRadius: 12,
        padding: 24,
        marginBottom: 16,
        textAlign: 'left'
      }}
    >
      <h2 style={{ marginTop: 0, fontSize: 20 }}>1. Select files</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <FilePicker
          label="Video file"
          accept="video/*"
          file={videoFile}
          onChange={onPickVideo}
          hint="Common: MP4, MOV, MKV..."
        />
        <FilePicker
          label="Subtitle file"
          accept=".srt,.ass,.ssa,.vtt"
          file={subtitleFile}
          onChange={onPickSubtitle}
          hint="Supported: .srt, .ass, .ssa, .vtt"
        />
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
        <button
          className="btn"
          onClick={onSubmit}
          disabled={!allowSubmit}
          style={{
            background: 'var(--button-bg)',
            color: 'var(--button-text)',
            border: 'none',
            padding: '10px 16px',
            borderRadius: 8,
            cursor: allowSubmit ? 'pointer' : 'not-allowed'
          }}
        >
          {uploading ? 'Working...' : 'Reposition Subtitles'}
        </button>

        {uploading && (
          <button
            className="btn"
            onClick={onCancel}
            style={{
              background: 'transparent',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              padding: '10px 16px',
              borderRadius: 8,
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
        )}
      </div>

      <StatusBar status={status} message={message} progress={progress} />
    </section>
  );
}

function FilePicker({ label, accept, file, onChange, hint }) {
  const id = `file-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div
      style={{
        border: '1px dashed var(--border-color)',
        borderRadius: 12,
        padding: 16,
        background: 'var(--bg-secondary)'
      }}
    >
      <label htmlFor={id} style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
        {label}
      </label>
      <input id={id} type="file" accept={accept} onChange={onChange} />
      <div style={{ marginTop: 8, color: 'var(--text-secondary)', fontSize: 12 }}>
        {file ? `Selected: ${file.name}` : hint}
      </div>
    </div>
  );
}

function StatusBar({ status, message, progress }) {
  if (status === 'idle') return null;

  const colorByStatus = {
    validating: '#1976d2',
    uploading: '#1976d2',
    processing: '#1976d2',
    success: '#2e7d32',
    error: '#d32f2f'
  };

  return (
    <div
      style={{
        marginTop: 20,
        padding: 12,
        borderRadius: 8,
        border: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
      }}
      role="status"
      aria-live="polite"
    >
      <div style={{ marginBottom: 8, color: colorByStatus[status] || 'var(--text-primary)' }}>
        <strong>Status:</strong> {status.toUpperCase()}
      </div>
      {message && <div style={{ marginBottom: 8 }}>{message}</div>}
      {(status === 'validating' || status === 'uploading' || status === 'processing') && (
        <ProgressBar value={progress} />
      )}
    </div>
  );
}

function ProgressBar({ value }) {
  return (
    <div
      aria-label="Progress"
      style={{
        width: '100%',
        height: 10,
        background: 'var(--bg-primary)',
        borderRadius: 999,
        border: '1px solid var(--border-color)',
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${Math.min(100, Math.max(0, value || 0))}%`,
          background: '#1976d2',
          transition: 'width 200ms ease'
        }}
      />
    </div>
  );
}

function ResultCard({ downloadUrl, resultFilename, onClear }) {
  if (!downloadUrl) return null;

  return (
    <section
      style={{
        width: '100%',
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-color)',
        borderRadius: 12,
        padding: 24,
        marginBottom: 16,
        textAlign: 'left'
      }}
    >
      <h2 style={{ marginTop: 0, fontSize: 20 }}>2. Download result</h2>
      <p style={{ color: 'var(--text-secondary)' }}>
        Your repositioned subtitle file is ready.
      </p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <a
          href={downloadUrl}
          download={resultFilename}
          className="btn"
          style={{
            background: '#1976d2',
            color: '#fff',
            border: 'none',
            padding: '10px 16px',
            borderRadius: 8,
            cursor: 'pointer',
            textDecoration: 'none'
          }}
        >
          Download {resultFilename}
        </a>
        <button
          onClick={onClear}
          className="btn"
          style={{
            background: 'transparent',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            padding: '10px 16px',
            borderRadius: 8,
            cursor: 'pointer'
          }}
        >
          Clear
        </button>
      </div>
    </section>
  );
}

function FormatsCard() {
  return (
    <section
      style={{
        width: '100%',
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-color)',
        borderRadius: 12,
        padding: 24,
        marginBottom: 16,
        textAlign: 'left'
      }}
    >
      <h3 style={{ marginTop: 0 }}>Supported subtitle formats</h3>
      <ul style={{ marginTop: 8 }}>
        <li>.srt (SubRip)</li>
      <li>.ass (Advanced SubStation Alpha)</li>
        <li>.ssa (SubStation Alpha)</li>
        <li>.vtt (WebVTT)</li>
      </ul>
      <p style={{ color: 'var(--text-secondary)' }}>
        Note: Large videos may take longer to process. Keep this tab open during processing.
      </p>
    </section>
  );
}

export default App;
