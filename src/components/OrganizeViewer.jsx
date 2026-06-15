import React, { useState, useEffect, useRef } from 'react';
import { PDFDocument, degrees } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/build/pdf';

// Page Thumbnail sub-component for high-performance lazy rendering
const PageThumbnail = ({ pdfDoc, pageNumber, rotation }) => {
  const canvasRef = useRef(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const renderThumbnail = async () => {
      setLoading(true);
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (!active) return;

        // Render at low scale for gallery thumbnail
        const viewport = page.getViewport({ scale: 0.3 });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: ctx, viewport }).promise;
        if (active) setLoading(false);
      } catch (err) {
        console.error('Thumbnail render error:', err);
      }
    };
    renderThumbnail();
    return () => {
      active = false;
    };
  }, [pdfDoc, pageNumber]);

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '180px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#ffffff',
      borderRadius: '8px',
      overflow: 'hidden',
      border: '1px solid var(--glass-border)',
      boxShadow: 'var(--shadow-sm)'
    }}>
      {loading && (
        <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
          Loading...
        </div>
      )}
      <canvas 
        ref={canvasRef} 
        style={{
          maxHeight: '90%',
          maxWidth: '90%',
          objectFit: 'contain',
          transform: `rotate(${rotation}deg)`,
          transition: 'transform 0.3s ease',
          display: loading ? 'none' : 'block'
        }}
      />
    </div>
  );
};

const OrganizeViewer = ({ file, decryptionPassword }) => {
  const [pdfDocJs, setPdfDocJs] = useState(null);
  const [pages, setPages] = useState([]); // Array of { id, originalIndex, rotation, isBlank, width, height }
  const [isSaving, setIsSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);

  // Load PDF on mount
  useEffect(() => {
    if (!file) return;

    const loadPdf = async () => {
      try {
        const buffer = await file.arrayBuffer();
        const doc = await pdfjsLib.getDocument({
          data: new Uint8Array(buffer),
          password: decryptionPassword || undefined
        }).promise;
        setPdfDocJs(doc);

        const initialPages = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const { width, height } = page.getViewport({ scale: 1 });
          initialPages.push({
            id: `page-${Date.now()}-${i}-${Math.random()}`,
            originalIndex: i,
            rotation: 0,
            isBlank: false,
            width,
            height
          });
        }
        setPages(initialPages);
      } catch (err) {
        console.error('Error loading PDF:', err);
        alert('Could not load PDF for organizing.');
      }
    };

    loadPdf();
  }, [file, decryptionPassword]);

  // Page Operations
  const rotatePage = (index, dir) => {
    setPages(prev => prev.map((p, idx) => {
      if (idx !== index) return p;
      const change = dir === 'cw' ? 90 : -90;
      let newRot = (p.rotation + change) % 360;
      if (newRot < 0) newRot += 360;
      return { ...p, rotation: newRot };
    }));
  };

  const deletePage = (index) => {
    setPages(prev => prev.filter((_, idx) => idx !== index));
  };

  const duplicatePage = (index) => {
    setPages(prev => {
      const pageToCopy = prev[index];
      const copied = {
        ...pageToCopy,
        id: `page-dup-${Date.now()}-${Math.random()}`
      };
      const nextList = [...prev];
      nextList.splice(index + 1, 0, copied);
      return nextList;
    });
  };

  const insertBlankPage = (index) => {
    setPages(prev => {
      const adjacentPage = prev[index] || prev[prev.length - 1];
      const width = adjacentPage ? adjacentPage.width : 595.27; // A4 default
      const height = adjacentPage ? adjacentPage.height : 841.89;
      const blank = {
        id: `page-blank-${Date.now()}-${Math.random()}`,
        isBlank: true,
        rotation: 0,
        width,
        height
      };
      const nextList = [...prev];
      nextList.splice(index + 1, 0, blank);
      return nextList;
    });
  };

  const movePage = (index, dir) => {
    const targetIndex = dir === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= pages.length) return;
    setPages(prev => {
      const nextList = [...prev];
      const [moved] = nextList.splice(index, 1);
      nextList.splice(targetIndex, 0, moved);
      return nextList;
    });
  };

  // Drag and drop sorting handlers
  const handleDragStart = (e, idx) => {
    setDragIndex(idx);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === idx) return;
    setPages(prev => {
      const nextList = [...prev];
      const [moved] = nextList.splice(dragIndex, 1);
      nextList.splice(idx, 0, moved);
      return nextList;
    });
    setDragIndex(idx);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
  };

  // Compile and Save PDF using pdf-lib
  const handleSave = async () => {
    if (pages.length === 0) {
      alert('Cannot save an empty PDF.');
      return;
    }
    setIsSaving(true);
    try {
      const fileBuffer = await file.arrayBuffer();
      const srcDoc = await PDFDocument.load(fileBuffer, { password: decryptionPassword || undefined });
      const newDoc = await PDFDocument.create();

      for (const p of pages) {
        if (p.isBlank) {
          newDoc.addPage([p.width, p.height]);
        } else {
          const [copiedPage] = await newDoc.copyPages(srcDoc, [p.originalIndex - 1]);
          copiedPage.setRotation(degrees(p.rotation));
          newDoc.addPage(copiedPage);
        }
      }

      const pdfBytes = await newDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Organized_${file.name}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Save error:', err);
      alert('Error building organized PDF.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '30px', width: '100%', minHeight: '100vh', padding: '40px', backgroundColor: 'var(--bg-primary)', boxSizing: 'border-box' }}>
      
      {/* Left: Controls Dashboard */}
      <div style={{
        flex: '0 0 350px',
        backgroundColor: 'var(--card-bg)',
        padding: '30px',
        borderRadius: '16px',
        boxShadow: 'var(--shadow-lg)',
        maxHeight: '85vh',
        overflowY: 'auto',
        position: 'sticky',
        top: '100px'
      }}>
        <div style={{ fontSize: '48px', textAlign: 'center', marginBottom: '16px' }}>🗂️</div>
        <h2 style={{ fontSize: '24px', marginBottom: '10px', color: 'var(--text-primary)', textAlign: 'center' }}>Page Organizer</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '25px', textAlign: 'center', fontSize: '14px', lineHeight: '1.4' }}>
          Rearrange, rotate, delete, duplicate pages, or insert blanks. Drag and drop to sort.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px' }}>
            <span>Total Pages:</span>
            <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{pages.length}</span>
          </div>

          <button
            onClick={() => insertBlankPage(pages.length - 1)}
            className="action-btn"
            style={{ width: '100%', fontSize: '14px', padding: '12px' }}
          >
            ➕ Add Blank Page at End
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving || pages.length === 0}
            className="action-btn primary"
            style={{ width: '100%', padding: '15px', fontSize: '16px', fontWeight: 'bold', marginTop: '20px' }}
          >
            {isSaving ? 'Saving Changes...' : '📥 Save & Download'}
          </button>
        </div>
      </div>

      {/* Right: Pages Grid Gallery */}
      <div style={{ flex: 1 }}>
        {pages.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px', border: '2px dashed var(--glass-border)', borderRadius: '16px', color: 'var(--text-secondary)' }}>
            No pages in document. Add a page to start.
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '24px'
          }}>
            {pages.map((p, idx) => (
              <div
                key={p.id}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '12px',
                  padding: '16px',
                  boxShadow: dragIndex === idx ? 'var(--shadow-lg)' : 'var(--shadow-sm)',
                  opacity: dragIndex === idx ? 0.5 : 1,
                  cursor: 'grab',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  position: 'relative',
                  transition: 'box-shadow 0.2s ease, opacity 0.2s ease'
                }}
              >
                {/* Index badge */}
                <div style={{
                  position: 'absolute',
                  top: '8px',
                  left: '8px',
                  background: 'var(--brand-primary)',
                  color: 'white',
                  borderRadius: '12px',
                  padding: '2px 8px',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  zIndex: 2
                }}>
                  #{idx + 1}
                </div>

                {/* Page content */}
                {p.isBlank ? (
                  <div style={{
                    height: '180px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#ffffff',
                    border: '2px dashed var(--glass-border)',
                    borderRadius: '8px',
                    color: '#94a3b8'
                  }}>
                    <span style={{ fontSize: '24px' }}>📄</span>
                    <span style={{ fontSize: '12px', marginTop: '6px' }}>Blank Page</span>
                  </div>
                ) : (
                  pdfDocJs && (
                    <PageThumbnail
                      pdfDoc={pdfDocJs}
                      pageNumber={p.originalIndex}
                      rotation={p.rotation}
                    />
                  )
                )}

                {/* Page details */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
                  <span>{p.isBlank ? 'Blank' : `Source Page: ${p.originalIndex}`}</span>
                  <span>{p.rotation !== 0 ? `${p.rotation}°` : ''}</span>
                </div>

                {/* Grid controls */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                  <button onClick={() => rotatePage(idx, 'ccw')} title="Rotate Counter-Clockwise" style={{ padding: '6px', border: '1px solid var(--glass-border)', borderRadius: '6px', background: 'var(--card-bg)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '12px' }}>↩️</button>
                  <button onClick={() => rotatePage(idx, 'cw')} title="Rotate Clockwise" style={{ padding: '6px', border: '1px solid var(--glass-border)', borderRadius: '6px', background: 'var(--card-bg)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '12px' }}>↪️</button>
                  <button onClick={() => deletePage(idx)} title="Delete Page" style={{ padding: '6px', border: '1px solid var(--glass-border)', borderRadius: '6px', background: 'var(--card-bg)', color: 'red', cursor: 'pointer', fontSize: '12px' }}>🗑️</button>
                  
                  <button onClick={() => duplicatePage(idx)} title="Duplicate Page" style={{ padding: '6px', border: '1px solid var(--glass-border)', borderRadius: '6px', background: 'var(--card-bg)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '12px' }}>👯</button>
                  <button onClick={() => insertBlankPage(idx)} title="Insert Blank Page After" style={{ padding: '6px', border: '1px solid var(--glass-border)', borderRadius: '6px', background: 'var(--card-bg)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '12px' }}>➕</button>
                  <div style={{ display: 'flex', gap: '2px' }}>
                    <button disabled={idx === 0} onClick={() => movePage(idx, 'left')} title="Move Left" style={{ flex: 1, padding: '4px 2px', border: '1px solid var(--glass-border)', borderRadius: '6px', background: 'var(--card-bg)', color: 'var(--text-primary)', cursor: idx === 0 ? 'not-allowed' : 'pointer', opacity: idx === 0 ? 0.4 : 1, fontSize: '10px' }}>←</button>
                    <button disabled={idx === pages.length - 1} onClick={() => movePage(idx, 'right')} title="Move Right" style={{ flex: 1, padding: '4px 2px', border: '1px solid var(--glass-border)', borderRadius: '6px', background: 'var(--card-bg)', color: 'var(--text-primary)', cursor: idx === pages.length - 1 ? 'not-allowed' : 'pointer', opacity: idx === pages.length - 1 ? 0.4 : 1, fontSize: '10px' }}>→</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};

export default OrganizeViewer;
