import React, { useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/build/pdf';

const CompressViewer = ({ file, decryptionPassword }) => {
  const [isCompressing, setIsCompressing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [quality, setQuality] = useState('medium'); // 'low', 'medium', 'high'
  const [mode, setMode] = useState('structure'); // 'structure' or 'aggressive'

  const qualitySettings = {
    low: { scale: 0.7, jpegQuality: 0.4, label: 'Maximum compression (lower quality)' },
    medium: { scale: 1.0, jpegQuality: 0.6, label: 'Balanced compression' },
    high: { scale: 1.2, jpegQuality: 0.8, label: 'Minimal compression (best quality)' },
  };

  const formatSize = (bytes) => {
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / 1024).toFixed(1) + ' KB';
  };

  // Structure-only compression (pdf-lib re-save)
  const compressStructure = async () => {
    const fileBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(fileBuffer, { password: decryptionPassword || undefined });
    const compressedBytes = await pdfDoc.save();
    return compressedBytes;
  };

  // Aggressive compression (rasterize pages as JPEG images)
  const compressAggressive = async () => {
    const settings = qualitySettings[quality];
    const fileBuffer = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(fileBuffer),
      password: decryptionPassword || undefined
    }).promise;
    const newPdf = await PDFDocument.create();

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: settings.scale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;

      // Convert to JPEG blob
      const jpegDataUrl = canvas.toDataURL('image/jpeg', settings.jpegQuality);
      const jpegBytes = Uint8Array.from(atob(jpegDataUrl.split(',')[1]), c => c.charCodeAt(0));
      const jpegImage = await newPdf.embedJpg(jpegBytes);

      // Get original page dimensions for proper sizing
      const origViewport = page.getViewport({ scale: 1.0 });
      const newPage = newPdf.addPage([origViewport.width, origViewport.height]);
      newPage.drawImage(jpegImage, {
        x: 0,
        y: 0,
        width: origViewport.width,
        height: origViewport.height,
      });
    }

    return await newPdf.save();
  };

  const handleCompress = async () => {
    setIsCompressing(true);
    setError(null);
    setResult(null);

    try {
      const originalSize = file.size;
      let compressedBytes;

      if (mode === 'structure') {
        compressedBytes = await compressStructure();
      } else {
        compressedBytes = await compressAggressive();
      }

      const compressedSize = compressedBytes.length;

      if (compressedSize >= originalSize && mode === 'structure') {
        setResult({ originalSize, compressedSize: originalSize, blob: null, noReduction: true });
      } else {
        const blob = new Blob([compressedBytes], { type: 'application/pdf' });
        setResult({
          originalSize,
          compressedSize,
          blob,
          noReduction: false,
        });
      }
    } catch (err) {
      console.error('Compression failed:', err);
      setError('Failed to compress. The PDF may be encrypted or corrupted.');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleDownload = () => {
    if (!result?.blob) return;
    const url = URL.createObjectURL(result.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Compressed_${file.name}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const reductionPercent = result && !result.noReduction
    ? ((result.originalSize - result.compressedSize) / result.originalSize * 100).toFixed(1)
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: '80vh', padding: '40px', backgroundColor: 'var(--bg-primary)' }}>
      <div style={{ maxWidth: '520px', width: '100%', backgroundColor: 'var(--card-bg)', padding: '50px', borderRadius: '16px', boxShadow: 'var(--shadow-lg)', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📦</div>
        <h2 style={{ fontSize: '28px', marginBottom: '10px', color: 'var(--text-primary)' }}>PDF Compressor</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>{file?.name} • {formatSize(file.size)}</p>

        {/* Compression Mode */}
        {!result && !isCompressing && !error && (
          <>
            <div style={{ display: 'flex', gap: '4px', background: 'var(--glass-border)', padding: '4px', borderRadius: '8px', marginBottom: '24px' }}>
              <button onClick={() => setMode('structure')} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', fontFamily: "'Inter', sans-serif", background: mode === 'structure' ? 'var(--brand-primary)' : 'transparent', color: mode === 'structure' ? 'white' : 'var(--text-secondary)' }}>
                🔧 Structure
              </button>
              <button onClick={() => setMode('aggressive')} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', fontFamily: "'Inter', sans-serif", background: mode === 'aggressive' ? 'var(--brand-primary)' : 'transparent', color: mode === 'aggressive' ? 'white' : 'var(--text-secondary)' }}>
                🔥 Aggressive
              </button>
            </div>

            {mode === 'structure' && (
              <div style={{ backgroundColor: 'rgba(99, 102, 241, 0.08)', padding: '14px', borderRadius: '10px', marginBottom: '24px', textAlign: 'left' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0, lineHeight: '1.5' }}>
                  Strips unused objects and optimizes structure. <strong style={{ color: 'var(--text-primary)' }}>Text remains selectable.</strong>
                </p>
              </div>
            )}

            {mode === 'aggressive' && (
              <>
                <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.08)', padding: '14px', borderRadius: '10px', marginBottom: '20px', textAlign: 'left' }}>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0, lineHeight: '1.5' }}>
                    ⚠️ Rasterizes pages as JPEG images for <strong style={{ color: 'var(--text-primary)' }}>maximum size reduction</strong>. Text will no longer be selectable.
                  </p>
                </div>

                {/* Quality selector */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                  {Object.entries(qualitySettings).map(([key, val]) => (
                    <label key={key} style={{
                      display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px',
                      border: quality === key ? '2px solid var(--brand-primary)' : '1px solid var(--glass-border)',
                      borderRadius: '10px', cursor: 'pointer',
                      background: quality === key ? 'rgba(99, 102, 241, 0.06)' : 'var(--bg-primary)',
                    }}>
                      <input type="radio" name="quality" checked={quality === key} onChange={() => setQuality(key)}
                        style={{ accentColor: 'var(--brand-primary)' }} />
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '14px', textTransform: 'capitalize' }}>{key}</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{val.label}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </>
            )}

            <button onClick={handleCompress}
              style={{ width: '100%', padding: '16px', fontSize: '18px', background: 'var(--brand-primary)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontFamily: "'Inter', sans-serif", boxShadow: 'var(--shadow-md)' }}
            >
              Compress Now
            </button>
          </>
        )}

        {/* Compressing */}
        {isCompressing && (
          <div>
            <div style={{ width: '100%', height: '12px', backgroundColor: 'var(--glass-border)', borderRadius: '10px', overflow: 'hidden', marginBottom: '20px' }}>
              <div style={{ height: '100%', width: '60%', backgroundColor: 'var(--brand-primary)', borderRadius: '10px', animation: 'wmPulse 1.5s ease-in-out infinite' }} />
            </div>
            <p style={{ color: 'var(--text-primary)', fontWeight: '600' }}>
              {mode === 'aggressive' ? 'Rasterizing and compressing pages...' : 'Optimizing PDF structure...'}
            </p>
            <style>{`@keyframes wmPulse { 0%, 100% { width: 30%; } 50% { width: 80%; } }`}</style>
          </div>
        )}

        {/* Error */}
        {error && (
          <div>
            <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '16px', borderRadius: '10px', marginBottom: '20px', fontWeight: '600' }}>❌ {error}</div>
            <button onClick={() => { setError(null); setResult(null); }}
              style={{ width: '100%', padding: '14px', fontSize: '16px', background: 'var(--brand-primary)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
              Try Again
            </button>
          </div>
        )}

        {/* Result: Success */}
        {result && !result.noReduction && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', marginBottom: '24px' }}>
              <div style={{ textAlign: 'center' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '12px', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '700' }}>Before</p>
                <p style={{ color: 'var(--text-primary)', fontSize: '20px', fontWeight: '800', margin: 0 }}>{formatSize(result.originalSize)}</p>
              </div>
              <span style={{ fontSize: '24px', color: 'var(--brand-primary)' }}>→</span>
              <div style={{ textAlign: 'center' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '12px', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '700' }}>After</p>
                <p style={{ color: '#059669', fontSize: '20px', fontWeight: '800', margin: 0 }}>{formatSize(result.compressedSize)}</p>
              </div>
            </div>
            <div style={{ backgroundColor: 'rgba(5, 150, 105, 0.1)', color: '#059669', padding: '14px', borderRadius: '10px', marginBottom: '24px', fontWeight: '700', fontSize: '16px' }}>
              ✅ Reduced by {reductionPercent}%
            </div>
            <button onClick={handleDownload}
              style={{ width: '100%', padding: '16px', fontSize: '18px', background: 'var(--brand-primary)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontFamily: "'Inter', sans-serif", boxShadow: 'var(--shadow-md)' }}>
              📥 Download Compressed PDF
            </button>
          </div>
        )}

        {/* Result: No reduction */}
        {result && result.noReduction && (
          <div>
            <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', padding: '16px', borderRadius: '10px', marginBottom: '20px', fontWeight: '600', lineHeight: '1.6' }}>
              ⚠️ Structure is already optimized. Try <strong>Aggressive mode</strong> for image-level compression.
            </div>
            <button onClick={() => { setResult(null); setMode('aggressive'); }}
              style={{ width: '100%', padding: '14px', fontSize: '16px', background: 'var(--brand-primary)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
              Try Aggressive Mode
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CompressViewer;
