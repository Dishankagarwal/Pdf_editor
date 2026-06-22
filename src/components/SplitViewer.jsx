import React, { useState, useEffect, useRef } from 'react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/build/pdf';

// Split Page Thumbnail component for high-performance lazy rendering
const SplitPageThumbnail = ({ pdfDoc, pageNumber }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: '100px' }
    );
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || !pdfDoc) return;
    let active = true;
    const renderThumb = async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (!active) return;

        const viewport = page.getViewport({ scale: 0.35 });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: ctx, viewport }).promise;
        if (active) setLoading(false);
      } catch (err) {
        console.error('Split thumbnail render error:', err);
      }
    };
    renderThumb();
    return () => {
      active = false;
    };
  }, [pdfDoc, pageNumber, isVisible]);

  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '100%', 
        height: '140px', 
        background: '#ffffff', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        position: 'relative'
      }}
    >
      {loading && (
        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', position: 'absolute' }}>
          Loading...
        </span>
      )}
      <canvas 
        ref={canvasRef} 
        style={{ 
          maxWidth: '90%', 
          maxHeight: '90%', 
          objectFit: 'contain',
          display: loading ? 'none' : 'block' 
        }} 
      />
    </div>
  );
};

const SplitViewer = ({ file, decryptionPassword }) => {
  const [range, setRange] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [totalPages, setTotalPages] = useState(0);
  const [thumbnails, setThumbnails] = useState([]);
  const [selectedPages, setSelectedPages] = useState(new Set());
  const [isLoadingThumbs, setIsLoadingThumbs] = useState(true);
  const [pdfDocJs, setPdfDocJs] = useState(null);

  // Render thumbnails on load
  useEffect(() => {
    if (!file) return;

    const loadThumbnails = async () => {
      setIsLoadingThumbs(true);
      try {
        const fileBuffer = await file.arrayBuffer();
        const doc = await pdfjsLib.getDocument({
          data: new Uint8Array(fileBuffer),
          password: decryptionPassword || undefined
        }).promise;
        setTotalPages(doc.numPages);
        setPdfDocJs(doc);

        const thumbs = [];
        for (let i = 1; i <= doc.numPages; i++) {
          thumbs.push({ pageNum: i });
        }
        setThumbnails(thumbs);
      } catch (err) {
        console.error('Failed to load document for thumbnails:', err);
      } finally {
        setIsLoadingThumbs(false);
      }
    };

    loadThumbnails();
  }, [file, decryptionPassword]);

  // Toggle page selection
  const togglePage = (pageNum) => {
    const newSelected = new Set(selectedPages);
    if (newSelected.has(pageNum)) {
      newSelected.delete(pageNum);
    } else {
      newSelected.add(pageNum);
    }
    setSelectedPages(newSelected);

    // Auto-update range input from selection
    const sorted = Array.from(newSelected).sort((a, b) => a - b);
    setRange(buildRangeString(sorted));
  };

  // Select all / none
  const selectAll = () => {
    const all = new Set(thumbnails.map(t => t.pageNum));
    setSelectedPages(all);
    setRange(`1-${totalPages}`);
  };

  const selectNone = () => {
    setSelectedPages(new Set());
    setRange('');
  };

  // Build compact range string from sorted page numbers
  const buildRangeString = (sorted) => {
    if (sorted.length === 0) return '';
    const ranges = [];
    let start = sorted[0];
    let end = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === end + 1) {
        end = sorted[i];
      } else {
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        start = sorted[i];
        end = sorted[i];
      }
    }
    ranges.push(start === end ? `${start}` : `${start}-${end}`);
    return ranges.join(', ');
  };

  // Parse range input and update selected thumbnails
  const handleRangeChange = (val) => {
    setRange(val);
    const newSelected = new Set();
    const parts = val.split(',');
    for (let part of parts) {
      part = part.trim();
      if (part.includes('-')) {
        const [s, e] = part.split('-').map(Number);
        if (s && e && s <= e) {
          for (let i = s; i <= Math.min(e, totalPages); i++) newSelected.add(i);
        }
      } else {
        const n = Number(part);
        if (n && n >= 1 && n <= totalPages) newSelected.add(n);
      }
    }
    setSelectedPages(newSelected);
  };

  const handleSplit = async () => {
    if (selectedPages.size === 0) {
      alert('Please select at least one page.');
      return;
    }
    
    setIsProcessing(true);
    
    try {
      const fileBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(fileBuffer, { password: decryptionPassword || undefined });
      
      const indices = Array.from(selectedPages).sort((a, b) => a - b).map(p => p - 1);
      const newPdf = await PDFDocument.create();
      const copiedPages = await newPdf.copyPages(pdfDoc, indices);
      copiedPages.forEach((page) => newPdf.addPage(page));
      
      const pdfBytes = await newPdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Extracted_${file.name}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Error extracting pages.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', minHeight: '100vh', padding: '40px', backgroundColor: 'var(--bg-primary)' }}>
      <div style={{ maxWidth: '800px', width: '100%', backgroundColor: 'var(--card-bg)', padding: '40px', borderRadius: '16px', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ fontSize: '48px', textAlign: 'center', marginBottom: '16px' }}>✂️</div>
        <h2 style={{ fontSize: '28px', marginBottom: '10px', color: 'var(--text-primary)', textAlign: 'center' }}>Split / Extract PDF</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '30px', textAlign: 'center' }}>
          Click pages to select them, or type a range below. <strong>{totalPages}</strong> pages total.
        </p>

        {/* Thumbnail Grid */}
        {isLoadingThumbs ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
            ⏳ Rendering page previews...
          </div>
        ) : (
          <>
            {/* Select All / None */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', justifyContent: 'flex-end' }}>
              <button onClick={selectAll} style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Select All</button>
              <button onClick={selectNone} style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Deselect All</button>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: '12px',
              marginBottom: '30px',
              maxHeight: '400px',
              overflowY: 'auto',
              padding: '4px',
            }}>
              {thumbnails.map(thumb => {
                const isSelected = selectedPages.has(thumb.pageNum);
                return (
                  <div
                    key={thumb.pageNum}
                    onClick={() => togglePage(thumb.pageNum)}
                    style={{
                      cursor: 'pointer',
                      border: isSelected ? '3px solid var(--brand-primary)' : '2px solid var(--glass-border)',
                      borderRadius: '10px',
                      overflow: 'hidden',
                      position: 'relative',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 0 0 3px rgba(99, 102, 241, 0.2)' : 'none',
                      transform: isSelected ? 'scale(1.03)' : 'scale(1)',
                    }}
                  >
                    {pdfDocJs && (
                      <SplitPageThumbnail pdfDoc={pdfDocJs} pageNumber={thumb.pageNum} />
                    )}
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      padding: '4px 0', textAlign: 'center',
                      fontSize: '11px', fontWeight: '700',
                      backgroundColor: isSelected ? 'var(--brand-primary)' : 'rgba(0,0,0,0.6)',
                      color: 'white',
                    }}>
                      {isSelected && '✓ '}Page {thumb.pageNum}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Range Input */}
        <label style={{ display: 'block', marginBottom: '10px', color: 'var(--text-primary)', fontWeight: 'bold' }}>Page Range</label>
        <input 
          type="text" 
          value={range} 
          onChange={e => handleRangeChange(e.target.value)} 
          placeholder="e.g. 1, 3, 5-7" 
          style={{ width: '100%', padding: '15px', borderRadius: '8px', border: '1px solid var(--glass-border)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '16px', marginBottom: '10px', boxSizing: 'border-box' }}
        />
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '30px' }}>
          {selectedPages.size} of {totalPages} pages selected
        </p>

        <button 
          onClick={handleSplit} 
          disabled={isProcessing || selectedPages.size === 0}
          style={{ width: '100%', padding: '16px', fontSize: '18px', background: selectedPages.size === 0 ? 'var(--glass-border)' : 'var(--brand-primary)', color: 'white', border: 'none', borderRadius: '10px', cursor: selectedPages.size === 0 ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontFamily: "'Inter', sans-serif", boxShadow: selectedPages.size > 0 ? 'var(--shadow-md)' : 'none' }}
        >
          {isProcessing ? '⏳ Extracting...' : `📥 Extract ${selectedPages.size} Page${selectedPages.size !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
};

export default SplitViewer;
