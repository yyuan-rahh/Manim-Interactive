import React from 'react'
import './VideoPreview.css'

function VideoPreview({ videoData, onClose }) {
  const videoSrc = `data:video/mp4;base64,${videoData}`

  return (
    <div className="video-preview-overlay" onClick={onClose}>
      <div className="video-preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="video-preview-header">
          <h3>Preview</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="video-preview-content">
          <video
            src={videoSrc}
            controls
            autoPlay
            loop
            className="preview-video"
          />
        </div>
      </div>
    </div>
  )
}

export default VideoPreview

