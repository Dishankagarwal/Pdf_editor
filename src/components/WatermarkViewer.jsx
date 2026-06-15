import React, { useState, useEffect, useRef } from 'react';
import { PDFDocument, rgb, degrees } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/build/pdf';

const WatermarkViewer = ({ file, decryptionPassword }) => {
  const [mode, setMode] = useState('text'); // 'text' or 'image'
  const [text, setText] = useState('CONFIDENTIAL');
  const [fontSize, setFontSize] = useState(60);
  const [opacity, setOpacity] = useState(0.3);
  const [rotation, setRotation] = useState(45);
  const [color, setColor] = useState('#cccccc');
  const [position, setPosition] = useState('center');
  const [watermarkImage, setWatermarkImage] = useState(null);
  const [watermarkImageData, setWatermarkImageData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Preview state
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(true);
  const previewCanvasRef = useRef(null);

  // Render the first page as a preview thumbnail
  useEffect(() => {
    if (!file) return;
    const renderPreview = async () => {
      setIsLoadingPreview(true);
      try {
        const buffer = await file.arrayBuffer();
        const doc = await pdfjsLib.getDocument({
          data: new Uint8Array(buffer),
          password: decryptionPassword || undefined
        }).promise;
        const page = await doc.getPage(1);
        const viewport = page.getViewport({ scale: 0.5 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        setPreviewUrl(canvas.toDataURL('image/jpeg', 0.7));
      } catch (err) {
        console.error('Preview failed:', err);
      } finally {
        setIsLoadingPreview(false);
      }
    };
    renderPreview();
  }, [file]);

  // Handle image watermark upload
  const handleImageUpload = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setWatermarkImage(ev.target.result);
      // Store the raw bytes for pdf-lib embedding
      const img = new Image();
      img.onload = () => setWatermarkImageData(ev.target.result);
      img.src = ev.target.result;
    };
    reader.readAsDataURL(f);
    e.target.value = '';
  };

  // Hex to RGB for pdf-lib
  const hexToRgb = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return { r, g, b };
  };

  // Get position coordinates
  const getPosition = (width, height, textWidth, textHeight) => {
    const positions = {
      'center': { x: width / 2 - textWidth / 2, y: height / 2 - textHeight / 2 },
      'top-left': { x: 40, y: height - 80 },
      'top-right': { x: width - textWidth - 40, y: height - 80 },
      'bottom-left': { x: 40, y: 60 },
      'bottom-right': { x: width - textWidth - 40, y: 60 },
    };
    return positions[position] || positions['center'];
  };

  const handleApply = async () => {
    setIsProcessing(true);
    try {
      const fileBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(fileBuffer, { password: decryptionPassword || undefined });
      const pages = pdfDoc.getPages();
      const { r, g, b } = hexToRgb(color);

      if (mode === 'text' && text.trim()) {
        pages.forEach(page => {
          const { width, height } = page.getSize();
          const estimatedTextWidth = text.length * fontSize * 0.5;
          const pos = getPosition(width, height, estimatedTextWidth, fontSize);

          page.drawText(text.toUpperCase(), {
            x: pos.x,
            y: pos.y,
            size: fontSize,
            color: rgb(r, g, b),
            opacity: opacity,
            rotate: degrees(rotation),
          });
        });
      } else if (mode === 'image' && watermarkImageData) {
        // Embed the image
        let embeddedImage;
        if (watermarkImageData.includes('image/png')) {
          const pngBytes = Uint8Array.from(atob(watermarkImageData.split(',')[1]), c => c.charCodeAt(0));
          embeddedImage = await pdfDoc.embedPng(pngBytes);
        } else {
          const jpgBytes = Uint8Array.from(atob(watermarkImageData.split(',')[1]), c => c.charCodeAt(0));
          embeddedImage = await pdfDoc.embedJpg(jpgBytes);
        }

        const imgDims = embeddedImage.scale(0.3);

        pages.forEach(page => {
          const { width, height } = page.getSize();
          const pos = getPosition(width, height, imgDims.width, imgDims.height);

          page.drawImage(embeddedImage, {
            x: pos.x,
            y: pos.y,
            width: imgDims.width,
            height: imgDims.height,
            opacity: opacity,
          });
        });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Watermarked_${file.name}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Error applying watermark.');
    } finally {
      setIsProcessing(false);
    }
  };

  const positionOptions = [
    { id: 'top-left', label: '↖ Top Left' },
    { id: 'top-right', label: '↗ Top Right' },
    { id: 'center', label: '⊕ Center' },
    { id: 'bottom-left', label: '↙ Bottom Left' },
    { id: 'bottom-right', label: '↘ Bottom Right' },
  ];

  return (
    <div style={{ display: 'flex', gap: '30px', width: '100%', minHeight: '100vh', padding: '40px', backgroundColor: 'var(--bg-primary)', boxSizing: 'border-box' }}>
      {/* Left: Controls */}
      <div style={{ flex: 1, maxWidth: '500px', backgroundColor: 'var(--card-bg)', padding: '40px', borderRadius: '16px', boxShadow: 'var(--shadow-lg)', overflowY: 'auto', maxHeight: '90vh' }}>
        <div style={{ fontSize: '48px', textAlign: 'center', marginBottom: '16px' }}>💧</div>
        <h2 style={{ fontSize: '28px', marginBottom: '10px', color: 'var(--text-primary)', textAlign: 'center' }}>Batch Watermark</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '30px', textAlign: 'center' }}>Apply watermark to all pages of <strong>{file?.name}</strong></p>

        {/* Mode Toggle */}
        <div style={{ display: 'flex', gap: '4px', background: 'var(--glass-border)', padding: '4px', borderRadius: '8px', marginBottom: '24px' }}>
          <button onClick={() => setMode('text')} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '14px', fontFamily: "'Inter', sans-serif", background: mode === 'text' ? 'var(--brand-primary)' : 'transparent', color: mode === 'text' ? 'white' : 'var(--text-secondary)' }}>📝 Text</button>
          <button onClick={() => setMode('image')} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '14px', fontFamily: "'Inter', sans-serif", background: mode === 'image' ? 'var(--brand-primary)' : 'transparent', color: mode === 'image' ? 'white' : 'var(--text-secondary)' }}>🖼️ Image</button>
        </div>

        {mode === 'text' && (
          <>
            {/* Watermark Text */}
            <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-primary)', fontWeight: '600', fontSize: '13px' }}>Watermark Text</label>
            <input type="text" value={text} onChange={e => setText(e.target.value)} placeholder="CONFIDENTIAL"
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px', marginBottom: '20px', textTransform: 'uppercase', boxSizing: 'border-box' }}
            />

            {/* Font Size */}
            <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-primary)', fontWeight: '600', fontSize: '13px' }}>Font Size: {fontSize}px</label>
            <input type="range" min="20" max="120" value={fontSize} onChange={e => setFontSize(Number(e.target.value))}
              style={{ width: '100%', marginBottom: '20px', accentColor: 'var(--brand-primary)' }}
            />

            {/* Color */}
            <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-primary)', fontWeight: '600', fontSize: '13px' }}>Color</label>
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              style={{ width: '50px', height: '36px', border: '1px solid var(--glass-border)', borderRadius: '8px', cursor: 'pointer', marginBottom: '20px', padding: '2px' }}
            />
          </>
        )}

        {mode === 'image' && (
          <>
            <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-primary)', fontWeight: '600', fontSize: '13px' }}>Watermark Image</label>
            <div
              onClick={() => document.getElementById('wm-img-input')?.click()}
              style={{ border: '2px dashed var(--glass-border)', borderRadius: '10px', padding: '30px', textAlign: 'center', cursor: 'pointer', marginBottom: '20px', backgroundColor: 'var(--bg-primary)' }}
            >
              {watermarkImage ? (
                <img src={watermarkImage} alt="Watermark" style={{ maxHeight: '80px', objectFit: 'contain' }} />
              ) : (
                <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Click to upload PNG or JPG</p>
              )}
            </div>
            <input id="wm-img-input" type="file" accept="image/png,image/jpeg" onChange={handleImageUpload} style={{ display: 'none' }} />
          </>
        )}

        {/* Opacity */}
        <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-primary)', fontWeight: '600', fontSize: '13px' }}>Opacity: {Math.round(opacity * 100)}%</label>
        <input type="range" min="5" max="100" value={Math.round(opacity * 100)} onChange={e => setOpacity(Number(e.target.value) / 100)}
          style={{ width: '100%', marginBottom: '20px', accentColor: 'var(--brand-primary)' }}
        />

        {/* Rotation (text only) */}
        {mode === 'text' && (
          <>
            <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-primary)', fontWeight: '600', fontSize: '13px' }}>Rotation: {rotation}°</label>
            <input type="range" min="-90" max="90" value={rotation} onChange={e => setRotation(Number(e.target.value))}
              style={{ width: '100%', marginBottom: '20px', accentColor: 'var(--brand-primary)' }}
            />
          </>
        )}

        {/* Position */}
        <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-primary)', fontWeight: '600', fontSize: '13px' }}>Position</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '30px' }}>
          {positionOptions.map(p => (
            <button key={p.id} onClick={() => setPosition(p.id)}
              style={{
                padding: '10px 8px', border: position === p.id ? '2px solid var(--brand-primary)' : '1px solid var(--glass-border)',
                borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
                background: position === p.id ? 'rgba(99, 102, 241, 0.1)' : 'var(--bg-primary)',
                color: position === p.id ? 'var(--brand-primary)' : 'var(--text-secondary)',
                fontFamily: "'Inter', sans-serif",
                gridColumn: p.id === 'center' ? '2' : 'auto',
              }}
            >{p.label}</button>
          ))}
        </div>

        <button onClick={handleApply} disabled={isProcessing || (mode === 'text' && !text.trim()) || (mode === 'image' && !watermarkImageData)}
          style={{ width: '100%', padding: '16px', fontSize: '18px', background: 'var(--brand-primary)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontFamily: "'Inter', sans-serif", boxShadow: 'var(--shadow-md)' }}
        >
          {isProcessing ? '⏳ Stamping...' : '📥 Apply & Download'}
        </button>
      </div>

      {/* Right: Live Preview */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '20px' }}>
        <div style={{ backgroundColor: 'var(--card-bg)', padding: '24px', borderRadius: '16px', boxShadow: 'var(--shadow-lg)', textAlign: 'center' }}>
          <h3 style={{ color: 'var(--text-primary)', marginBottom: '16px', fontSize: '16px', fontWeight: '700' }}>Preview (Page 1)</h3>
          {isLoadingPreview ? (
            <div style={{ padding: '60px', color: 'var(--text-secondary)' }}>Loading preview...</div>
          ) : (
            <div style={{ position: 'relative', display: 'inline-block', borderRadius: '8px', overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
              <img src={previewUrl} alt="PDF Preview" style={{ display: 'block', maxWidth: '400px' }} />
              {/* Watermark overlay simulation */}
              <div style={{
                position: 'absolute',
                top: position.includes('top') ? '10%' : position.includes('bottom') ? 'auto' : '50%',
                bottom: position.includes('bottom') ? '10%' : 'auto',
                left: position.includes('left') ? '5%' : position.includes('right') ? 'auto' : '50%',
                right: position.includes('right') ? '5%' : 'auto',
                transform: position === 'center' ? `translate(-50%, -50%) rotate(-${rotation}deg)` : `rotate(-${rotation}deg)`,
                opacity: opacity,
                pointerEvents: 'none',
                zIndex: 10,
              }}>
                {mode === 'text' ? (
                  <span style={{
                    fontSize: `${fontSize * 0.35}px`,
                    fontWeight: '800',
                    color: color,
                    letterSpacing: '4px',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                    fontFamily: "'Inter', sans-serif",
                  }}>{text}</span>
                ) : watermarkImage ? (
                  <img src={watermarkImage} alt="WM" style={{ maxWidth: '120px', maxHeight: '120px' }} />
                ) : null}
              </div>
            </div>
          )}
          <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '12px' }}>
            This is an approximate preview. Final result may vary slightly.
          </p>
        </div>
      </div>
    </div>
  );
};

export default WatermarkViewer;
