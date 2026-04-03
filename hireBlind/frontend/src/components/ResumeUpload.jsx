// frontend/src/components/ResumeUpload.jsx
import React, { useState, useRef } from 'react';

export default function ResumeUpload({
  getToken,
  sessionId,
  onUploadComplete,
}) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles((prev) => [...prev, ...selectedFiles]);
    setError('');
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  };

  const handleDragLeave = (e) => {
    e.currentTarget.classList.remove('drag-over');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...droppedFiles]);
    setError('');
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length < 5) {
      setError('Minimum 5 files required');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('files', file);
      });
      if (sessionId) {
        formData.append('sessionId', sessionId);
      }

      const token = await getToken();
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/resumes/upload`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      );

      if (response.ok) {
        const data = await response.json();
        onUploadComplete(data.resumes);
        setFiles([]);
        setUploadProgress({});
      } else {
        const err = await response.json();
        setError(err.error || 'Upload failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="resume-upload">
      <div
        className="upload-drop-zone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <div className="upload-content">
          <p className="upload-icon">📄</p>
          <p className="upload-text">
            Drag & drop PDFs/DOCX files here or{' '}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="link-btn"
            >
              browse
            </button>
          </p>
          <p className="upload-hint">Minimum 5 files. Max 10MB each.</p>
        </div>
      </div>

      {files.length > 0 && (
        <div className="files-list">
          <h3>Selected Files ({files.length})</h3>
          <ul>
            {files.map((file, index) => (
              <li key={index}>
                <span className="file-name">{file.name}</span>
                <span className="file-size">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="remove-btn"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      <button
        onClick={handleUpload}
        disabled={files.length < 5 || uploading}
        className="btn btn-primary"
      >
        {uploading ? 'Uploading...' : `Upload ${files.length} Files`}
      </button>
    </div>
  );
}