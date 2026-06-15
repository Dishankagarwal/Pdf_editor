import React, { useState, useEffect, useRef } from 'react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/build/pdf';

const HeaderFooterViewer = ({ file, decryptionPassword }) => {
  // Input template states
  const [headerLeft, setHeaderLeft] = useState('');
  const [headerCenter, setHeaderCenter] = useState('');
  const [headerRight, setHeaderRight] = useState('');
  const [footerLeft, setFooterLeft] = useState('');
  const [footerCenter, setFooterCenter] = useState('{page} of {pages}');
  const [footerRight, setFooterRight] = useState('');
  
  // Style states
  const [fontSize, setFontSize] = useState(10);
  const [color, setColor] = useState('#64748b');
  const [margin, setMargin] = useState(30);
  const [rangeMode, setRangeMode] = useState('exclude-first'); // 'all', 'exclude-first', 'custom'
  const [customRange, setCustomRange] = useState('');

  // UI state
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewWidth, setPreviewWidth] = useState(400);
  const [previewHeight, setPreviewHeight] = useState(550);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoadingPreview, setIsLoadingPreview] = useState(true);

  // Hex to RGB
  const hexToRgb = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return { r, g, b };
  };

  // Range parser
  const parsePageRange = (rangeStr, total) => {
    if (rangeMode === 'all') {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    if (rangeMode === 'exclude-first') {
      return Array.from({ length: total - 1 }, (_, i) => i + 2);
    }
    
    if (!rangeStr.trim()) return [];
    const pages = new Set();
    const parts = rangeStr.split(',');
    for (let part of parts) {
      part = part.trim();
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(num => parseInt(num.trim(), 10));
        if (!isNaN(start) && !isNaN(end)) {
          const s = Math.max(1, Math.min(start, total));
          const e = Math.max(1, Math.min(end, total));
          const low = Math.min(s, e);
          const high = Math.max(s, e);
          for (let i = low; i <= high; i++) pages.add(i);
        }
      } else {
        const num = parseInt(part, 10);
        if (!isNaN(num) && num >= 1 && num <= total) {
          pages.add(num);
        }
      }
    }
    return Array.from(pages).sort((a, b) => a - b);
  };

  // Replace templates
  const formatText = (template, pageNum, total) => {
    if (!template) return '';
    const dateStr = new Date().toLocaleDateString();
    return template
      .replace(/{page}/g, pageNum)
      .replace(/{pages}/g, total)
      .replace(/{date}/g, dateStr);
  };

  // Render Page 1 Preview
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
        setTotalPages(doc.numPages);

        // Fetch page 1 (or 2 if first excluded) for visual reference
        const targetPageNum = rangeMode === 'exclude-first' && doc.numPages > 1 ? 2 : 1;
        const page = await doc.getPage(targetPageNum);
        
        const scale = 0.6;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        
        await page.render({ canvasContext: ctx, viewport }).promise;
        setPreviewUrl(canvas.toDataURL('image/jpeg', 0.8));
        setPreviewWidth(viewport.width);
        setPreviewHeight(viewport.height);
      } catch (err) {
        console.error('Preview failed:', err);
      } finally {
        setIsLoadingPreview(false);
      }
    };

    renderPreview();
  }, [file, rangeMode]);

  // Stamp and Download
  const handleApply = async () => {
    setIsProcessing(true);
    try {
      const fileBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(fileBuffer, { password: decryptionPassword || undefined });
      const pages = pdfDoc.getPages();
      const total = pages.length;
      
      const { r, g, b } = hexToRgb(color);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      
      const targetPageNumbers = parsePageRange(customRange, total);

      targetPageNumbers.forEach(pageNum => {
        const pageIndex = pageNum - 1;
        if (pageIndex < 0 || pageIndex >= total) return;
        const page = pages[pageIndex];
        const { width, height } = page.getSize();

        // 1. Header Left
        if (headerLeft) {
          const text = formatText(headerLeft, pageNum, total);
          page.drawText(text, {
            x: margin,
            y: height - margin - fontSize,
            size: fontSize,
            font,
            color: rgb(r, g, b)
          });
        }
        
        // 2. Header Center
        if (headerCenter) {
          const text = formatText(headerCenter, pageNum, total);
          const textWidth = font.widthOfTextAtSize(text, fontSize);
          page.drawText(text, {
            x: (width - textWidth) / 2,
            y: height - margin - fontSize,
            size: fontSize,
            font,
            color: rgb(r, g, b)
          });
        }

        // 3. Header Right
        if (headerRight) {
          const text = formatText(headerRight, pageNum, total);
          const textWidth = font.widthOfTextAtSize(text, fontSize);
          page.drawText(text, {
            x: width - margin - textWidth,
            y: height - margin - fontSize,
            size: fontSize,
            font,
            color: rgb(r, g, b)
          });
        }

        // 4. Footer Left
        if (footerLeft) {
          const text = formatText(footerLeft, pageNum, total);
          page.drawText(text, {
            x: margin,
            y: margin,
            size: fontSize,
            font,
            color: rgb(r, g, b)
          });
        }

        // 5. Footer Center
        if (footerCenter) {
          const text = formatText(footerCenter, pageNum, total);
          const textWidth = font.widthOfTextAtSize(text, fontSize);
          page.drawText(text, {
            x: (width - textWidth) / 2,
            y: margin,
            size: fontSize,
            font,
            color: rgb(r, g, b)
          });
        }

        // 6. Footer Right
        if (footerRight) {
          const text = formatText(footerRight, pageNum, total);
          const textWidth = font.widthOfTextAtSize(text, fontSize);
          page.drawText(text, {
            x: width - margin - textWidth,
            y: margin,
            size: fontSize,
            font,
            color: rgb(r, g, b)
          });
        }
      });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Numbered_${file.name}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Error stamping header/footers.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '30px', width: '100%', minHeight: '100vh', padding: '40px', backgroundColor: 'var(--bg-primary)', boxSizing: 'border-box' }}>
      
      {/* Left controls */}
      <div style={{ flex: 1, maxWidth: '500px', backgroundColor: 'var(--card-bg)', padding: '30px', borderRadius: '16px', boxShadow: 'var(--shadow-lg)', overflowY: 'auto', maxHeight: '85vh' }}>
        <div style={{ fontSize: '48px', textAlign: 'center', marginBottom: '16px' }}>🔢</div>
        <h2 style={{ fontSize: '24px', marginBottom: '10px', color: 'var(--text-primary)', textAlign: 'center' }}>Headers & Footers</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '25px', textAlign: 'center', fontSize: '13px' }}>
          Stamp running headers, footer descriptions, or page counts onto your document.
        </p>

        {/* Input grids */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '25px' }}>
          
          <div>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--text-primary)' }}>Header Templates</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
              <input type="text" value={headerLeft} onChange={e => setHeaderLeft(e.target.value)} placeholder="Left" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '12px', boxSizing: 'border-box' }} />
              <input type="text" value={headerCenter} onChange={e => setHeaderCenter(e.target.value)} placeholder="Center" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '12px', boxSizing: 'border-box' }} />
              <input type="text" value={headerRight} onChange={e => setHeaderRight(e.target.value)} placeholder="Right" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '12px', boxSizing: 'border-box' }} />
            </div>
          </div>

          <div>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--text-primary)' }}>Footer Templates</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
              <input type="text" value={footerLeft} onChange={e => setFooterLeft(e.target.value)} placeholder="Left" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '12px', boxSizing: 'border-box' }} />
              <input type="text" value={footerCenter} onChange={e => setFooterCenter(e.target.value)} placeholder="Center" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '12px', boxSizing: 'border-box' }} />
              <input type="text" value={footerRight} onChange={e => setFooterRight(e.target.value)} placeholder="Right" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '12px', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
              Placeholders: <code>{`{page}`}</code> (Number), <code>{`{pages}`}</code> (Total), <code>{`{date}`}</code>
            </div>
          </div>
        </div>

        {/* Configurations */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '25px', padding: '15px', background: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Font Size: {fontSize}pt</label>
            <input type="range" min="8" max="24" value={fontSize} onChange={e => setFontSize(Number(e.target.value))} style={{ width: '60%', accentColor: 'var(--brand-primary)' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Margin Padding: {margin}pt</label>
            <input type="range" min="10" max="60" value={margin} onChange={e => setMargin(Number(e.target.value))} style={{ width: '60%', accentColor: 'var(--brand-primary)' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Text Color</label>
            <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', width: '40px', height: '30px' }} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px' }}>Page Scope</label>
            <select value={rangeMode} onChange={e => setRangeMode(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'var(--card-bg)', color: 'var(--text-primary)', outline: 'none', fontSize: '13px' }}>
              <option value="exclude-first">Skip First Page (Exclude Cover Page)</option>
              <option value="all">Apply to All Pages</option>
              <option value="custom">Custom Page Range</option>
            </select>
          </div>

          {rangeMode === 'custom' && (
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Range description (e.g. 2-5, 7, 9-11)</label>
              <input type="text" value={customRange} onChange={e => setCustomRange(e.target.value)} placeholder="2-5, 7" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
          )}

        </div>

        <button onClick={handleApply} disabled={isProcessing} className="action-btn primary" style={{ width: '100%', padding: '15px', fontSize: '16px', fontWeight: 'bold' }}>
          {isProcessing ? '⏳ Processing PDF...' : '📥 Stamp & Download'}
        </button>

      </div>

      {/* Right live preview simulation */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '20px' }}>
        <div style={{ backgroundColor: 'var(--card-bg)', padding: '24px', borderRadius: '16px', boxShadow: 'var(--shadow-lg)', textAlign: 'center' }}>
          <h3 style={{ color: 'var(--text-primary)', marginBottom: '16px', fontSize: '15px', fontWeight: '700' }}>
            Preview Simulation (Page {rangeMode === 'exclude-first' && totalPages > 1 ? '2' : '1'})
          </h3>
          {isLoadingPreview ? (
            <div style={{ padding: '60px', color: 'var(--text-secondary)', width: '350px' }}>Loading page template...</div>
          ) : (
            <div style={{ position: 'relative', display: 'inline-block', borderRadius: '8px', overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
              
              {/* Rendered PDF base canvas image */}
              <img src={previewUrl} alt="PDF Base" style={{ display: 'block', maxWidth: '400px' }} />

              {/* Header overlays */}
              <div style={{
                position: 'absolute', top: `${(margin / 842) * 100}%`, left: `${(margin / 595) * 100}%`, right: `${(margin / 595) * 100}%`,
                display: 'flex', justifyContent: 'space-between', pointerEvents: 'none', color, fontSize: `${fontSize * 0.5}px`, zIndex: 10, fontFamily: 'sans-serif'
              }}>
                <span style={{ textAlign: 'left', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatText(headerLeft, 2, totalPages)}</span>
                <span style={{ textAlign: 'center', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatText(headerCenter, 2, totalPages)}</span>
                <span style={{ textAlign: 'right', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatText(headerRight, 2, totalPages)}</span>
              </div>

              {/* Footer overlays */}
              <div style={{
                position: 'absolute', bottom: `${(margin / 842) * 100}%`, left: `${(margin / 595) * 100}%`, right: `${(margin / 595) * 100}%`,
                display: 'flex', justifyContent: 'space-between', pointerEvents: 'none', color, fontSize: `${fontSize * 0.5}px`, zIndex: 10, fontFamily: 'sans-serif'
              }}>
                <span style={{ textAlign: 'left', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatText(footerLeft, 2, totalPages)}</span>
                <span style={{ textAlign: 'center', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatText(footerCenter, 2, totalPages)}</span>
                <span style={{ textAlign: 'right', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatText(footerRight, 2, totalPages)}</span>
              </div>

            </div>
          )}
          <p style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: '12px' }}>
            This layout matches final coordinate system dimensions.
          </p>
        </div>
      </div>

    </div>
  );
};

export default HeaderFooterViewer;
