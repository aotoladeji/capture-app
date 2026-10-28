import React from 'react';

const FingerprintCapture = ({ fingerType, onCapture, imageSrc, isCapturing }) => {
  const displayName = fingerType
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .replace('_', ' ');

  const handleClick = () => {
    if (!imageSrc && !isCapturing) onCapture(fingerType);
  };

  return (
    <div className="text-center">
      <div
        onClick={handleClick}
        className={`fingerprint-box mx-auto flex items-center justify-center ${
          imageSrc ? 'captured' : ''
        }`}
        style={{
          width: '150px',
          height: '200px',
          border: '2px dashed #ccc',
          borderRadius: '8px',
          cursor: imageSrc || isCapturing ? 'default' : 'pointer',
          transition: 'all 0.3s',
          backgroundColor: imageSrc ? '#d1fae5' : 'transparent',
          borderColor: imageSrc ? '#10b981' : '#ccc',
          overflow: 'hidden',
        }}
      >
        {isCapturing ? (
          <div className="text-gray-500 flex flex-col items-center">
            <svg className="animate-spin h-8 w-8 mb-2" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm">Capturing...</span>
          </div>
        ) : imageSrc ? (
          <img
            src={`data:image/jpeg;base64,${imageSrc}`}
            alt="Fingerprint"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div className="text-gray-600 flex flex-col items-center">
            <svg className="w-8 h-8 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="text-sm font-medium">{displayName}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default FingerprintCapture;