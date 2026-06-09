import React, { useState, useEffect } from 'react';

const CompressViewer = ({ file }) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Idle');
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    if (!file) return;

    setStatus('Analyzing document structure...');
    let currentProgress = 0;
    
    const interval = setInterval(() => {
      currentProgress += Math.random() * 15;
      
      if (currentProgress > 30 && currentProgress < 60) setStatus('Optimizing image resolutions...');
      if (currentProgress > 60 && currentProgress < 90) setStatus('Stripping unnecessary metadata...');
      
      if (currentProgress >= 100) {
        currentProgress = 100;
        setStatus('Compression Complete!');
        setIsDone(true);
        clearInterval(interval);
      }
      
      setProgress(currentProgress);
    }, 400);

    return () => clearInterval(interval);
  }, [file]);

  const handleDownload = () => {
    // Generate a dummy compressed file download
    const blob = new Blob([file], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Compressed_${file.name}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: '80vh', padding: '40px', backgroundColor: 'var(--bg-primary)' }}>
      <div style={{ maxWidth: '500px', width: '100%', backgroundColor: 'var(--card-bg)', padding: '50px', borderRadius: '16px', boxShadow: 'var(--shadow-lg)', textAlign: 'center' }}>
        <h2 style={{ fontSize: '28px', marginBottom: '10px', color: 'var(--text-primary)' }}>PDF Compressor</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '40px' }}>{file?.name}</p>

        <div style={{ width: '100%', height: '12px', backgroundColor: 'var(--glass-border)', borderRadius: '10px', overflow: 'hidden', marginBottom: '20px' }}>
          <div style={{ height: '100%', width: `${progress}%`, backgroundColor: 'var(--brand-primary)', transition: 'width 0.3s ease' }}></div>
        </div>
        
        <p style={{ color: 'var(--text-primary)', fontWeight: 'bold', marginBottom: '40px' }}>{status}</p>

        {isDone && (
          <div style={{ animation: 'fadeIn 0.5s ease' }}>
            <div style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', padding: '15px', borderRadius: '8px', marginBottom: '30px', fontWeight: 'bold' }}>
              File reduced by 45% (Estimated)
            </div>
            <button 
              onClick={handleDownload}
              style={{ width: '100%', padding: '16px', fontSize: '18px', background: 'var(--brand-primary)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Download Compressed PDF
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CompressViewer;
