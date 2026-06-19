import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.js?url';
import 'pdfjs-dist/web/pdf_viewer.css';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import OrganizeViewer from './OrganizeViewer';
import ConverterViewer from './ConverterViewer';
import HeaderFooterViewer from './HeaderFooterViewer';
import MetadataViewer from './MetadataViewer';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const getDistanceToSegment = (px, py, x1, y1, x2, y2) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return Math.hypot(px - x1, py - y1);
  }
  let t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  return Math.hypot(px - closestX, py - closestY);
};

const getDistanceToStroke = (px, py, stroke) => {
  let minDistance = Infinity;
  for (let i = 0; i < stroke.points.length - 1; i++) {
    const p1 = stroke.points[i];
    const p2 = stroke.points[i + 1];
    const dist = getDistanceToSegment(px, py, p1.x, p1.y, p2.x, p2.y);
    if (dist < minDistance) {
      minDistance = dist;
    }
  }
  if (stroke.points.length === 1) {
    const dist = Math.hypot(px - stroke.points[0].x, py - stroke.points[0].y);
    if (dist < minDistance) {
      minDistance = dist;
    }
  }
  return minDistance;
};

// ---------------------------------------------------------------------------
// PdfPage — Renders one page with Canvas (visible) + Click-to-Edit text layer
// ---------------------------------------------------------------------------
const PdfPage = ({ pdfDoc, pageNumber }) => {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const [page, setPage] = useState(null);
  const [hasText, setHasText] = useState(true);

  useEffect(() => {
    let isMounted = true;
    pdfDoc.getPage(pageNumber).then(p => {
      if (isMounted) setPage(p);
    });
    return () => { isMounted = false; };
  }, [pdfDoc, pageNumber]);

  useEffect(() => {
    if (!page) return;

    const render = async () => {
      const viewport = page.getViewport({ scale: 1.5 });
      
      // Setup Canvas — NOW VISIBLE so user sees the full PDF rendering
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };
      
      if (containerRef.current) {
        containerRef.current.style.height = viewport.height + 'px';
        containerRef.current.style.width = viewport.width + 'px';
      }

      await page.render(renderContext).promise;

      // Setup Text Layer (transparent overlay for click-to-edit)
      const textContent = await page.getTextContent();
      setHasText(textContent.items.length > 0);
      const textLayerDiv = textLayerRef.current;
      textLayerDiv.innerHTML = ''; 
      
      textLayerDiv.style.height = viewport.height + 'px';
      textLayerDiv.style.width = viewport.width + 'px';
      textLayerDiv.style.setProperty('--scale-factor', viewport.scale);

      await pdfjsLib.renderTextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport: viewport,
        textDivs: []
      }).promise;

      // -----------------------------------------------------
      // THE BLOCK-PUSH ALGORITHM (Collision & Reflow Engine)
      // -----------------------------------------------------
      const spans = textLayerDiv.querySelectorAll('span');
      let previousHeights = new Map();
      let previousWidths = new Map();

      // First pass: Setup styles and store initial heights/widths
      spans.forEach(span => {
        span.setAttribute('contenteditable', 'true');
        span.style.outline = 'none';
        span.style.cursor = 'text';
        // Text is visible (canvas is hidden, only text layer shows)
        span.style.color = 'black'; 
        span.style.backgroundColor = 'transparent';
        span.style.zIndex = '10';

        // Store initial height and width
        const rect = span.getBoundingClientRect();
        previousHeights.set(span, rect.height);
        previousWidths.set(span, rect.width);
        
        // Highlight block on focus
        span.addEventListener('focus', () => {
           span.style.boxShadow = '0 0 0 2px #4f46e5';
        });
        span.addEventListener('blur', () => {
           span.style.boxShadow = 'none';
        });

        // --- THE BLOCK-PUSH ALGORITHM (Collision & Reflow Engine) ---
        span.addEventListener('input', () => {
           requestAnimationFrame(() => {
               const newRect = span.getBoundingClientRect();
               const newHeight = newRect.height;
               const newWidth = newRect.width;
               
               const oldHeight = previousHeights.get(span);
               const oldWidth = previousWidths.get(span);
               
               const deltaY = newHeight - oldHeight;
               const deltaX = newWidth - oldWidth;
               
               if (deltaY !== 0 || deltaX !== 0) {
                  previousHeights.set(span, newHeight);
                  previousWidths.set(span, newWidth);
                  
                  const editedTop = newRect.top;
                  const editedLeft = newRect.left;
                  
                  spans.forEach(otherSpan => {
                      if (otherSpan !== span) {
                          const otherRect = otherSpan.getBoundingClientRect();
                          
                          // Horizontal Push (same line, to the right)
                          if (Math.abs(otherRect.top - editedTop) < 10) { 
                              if (otherRect.left > editedLeft) {
                                  const currentMarginLeft = parseFloat(otherSpan.style.marginLeft || 0);
                                  otherSpan.style.marginLeft = (currentMarginLeft + deltaX) + 'px';
                              }
                          }
                          
                          // Vertical Push (below the edited span)
                          if (otherRect.top > editedTop + 5) {
                              const currentMarginTop = parseFloat(otherSpan.style.marginTop || 0);
                              otherSpan.style.marginTop = (currentMarginTop + deltaY) + 'px';
                          }
                      }
                  });

                  // Dynamically expand or shrink the page boundary
                  if (deltaY !== 0 && containerRef.current) {
                      const currentHeight = parseFloat(containerRef.current.style.height);
                      containerRef.current.style.height = (currentHeight + deltaY) + 'px';
                  }
               }
           });
        });
      });
    };

    render();
  }, [page]);

  return (
    <div ref={containerRef} style={{ position: 'relative', marginBottom: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', backgroundColor: 'white' }}>
      {/* Canvas is hidden only if page contains text, to prevent text-doubling during editing. For image-only pages, it is visible. */}
      <canvas ref={canvasRef} style={{ visibility: hasText ? 'hidden' : 'visible', display: 'block' }} />
      <div 
        ref={textLayerRef} 
        className="textLayer" 
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1, opacity: 1, overflow: 'visible' }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// DraggableItem — Floating overlay elements (text box, image, redaction, sig)
// ---------------------------------------------------------------------------
const DraggableItem = ({ el, id, updateElement, deleteElement, onFocus }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [pos, setPos] = useState({ x: el.x || 100, y: el.y || 100 });
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e) => {
    if (e.target.tagName.toLowerCase() === 'textarea') return;
    setIsDragging(true);
    setStartPos({ x: e.clientX - pos.x, y: e.clientY - pos.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPos({ x: e.clientX - startPos.x, y: e.clientY - startPos.y });
  };

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      updateElement(id, { ...el, x: pos.x, y: pos.y });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (el.type !== 'text' || (el.type === 'text' && el.content === '')) {
        deleteElement(id);
      }
    }
  };

  return (
    <div
      tabIndex={0}
      onFocus={onFocus}
      style={{ 
        position: 'absolute', 
        left: pos.x, 
        top: pos.y, 
        cursor: isDragging ? 'grabbing' : 'grab', 
        zIndex: 100,
        border: isDragging || isHovered ? '2px dashed var(--brand-primary)' : '1px dashed transparent',
        padding: '2px',
        outline: 'none'
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        handleMouseUp();
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onKeyDown={handleKeyDown}
    >
      {(isHovered || isDragging) && (
        <button 
          onClick={() => deleteElement(id)}
          style={{ position: 'absolute', top: '-12px', right: '-12px', background: 'red', color: 'white', border: 'none', borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer', zIndex: 101, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}
        >
          X
        </button>
      )}
      {el.type === 'text' && (
        <textarea 
          style={{ background: 'transparent', border: '1px solid #ccc', resize: 'both', outline: 'none', fontSize: '16px', color: 'black', minWidth: '150px', minHeight: '30px', padding: '5px' }} 
          defaultValue={el.content} 
          onChange={(e) => updateElement(id, {...el, content: e.target.value})} 
          placeholder="Type here..." 
        />
      )}
      {el.type === 'image' && (
        <div style={{ resize: 'both', overflow: 'hidden', minWidth: '100px', minHeight: '100px', border: '1px solid #ccc' }}>
          <img src={el.src} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} alt="Uploaded" />
        </div>
      )}
      {el.type === 'redaction' && (
        <div style={{ width: '100px', height: '30px', backgroundColor: 'black' }} />
      )}
      {el.type === 'signature' && (
        <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
           <input 
              type="text" 
              defaultValue={el.content || 'Your Name'}
              onChange={(e) => updateElement(id, {...el, content: e.target.value})}
              style={{ fontFamily: '"Brush Script MT", cursive, "Comic Sans MS"', fontSize: '36px', color: 'var(--brand-primary)', background: 'transparent', border: 'none', outline: 'none', textAlign: 'center', minWidth: '200px' }}
           />
           <span style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '5px', borderTop: '1px solid var(--text-secondary)', paddingTop: '2px', width: '80%', textAlign: 'center', userSelect: 'none' }}>
              Signed digitally on {new Date(el.timestamp).toLocaleDateString()}
           </span>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// PdfViewer — Main viewer with toolbar, pages, overlays, drawing, and download
// ---------------------------------------------------------------------------
const PdfViewer = ({ file, decryptionPassword }) => {
  const containerRef = useRef(null);
  const imageInputRef = useRef(null);
  const [numPages, setNumPages] = useState(0);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [floatingElements, setFloatingElements] = useState([]);
  const [deletedPages, setDeletedPages] = useState([]);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [penColor, setPenColor] = useState('#4f46e5');
  const [penWidth, setPenWidth] = useState(4);
  const drawCanvasRef = useRef(null);
  const [strokes, setStrokes] = useState([]);
  const [drawingTool, setDrawingTool] = useState('pen'); // 'pen' | 'select'
  const [selectedStrokeId, setSelectedStrokeId] = useState(null);
  const [hoveredStrokeId, setHoveredStrokeId] = useState(null);
  const [activeModal, setActiveModal] = useState(null);
  const currentPointsRef = useRef([]);

  const redrawCanvas = () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    strokes.forEach(stroke => {
      if (stroke.points.length === 0) return;
      const isSelected = stroke.id === selectedStrokeId;
      const isHovered = stroke.id === hoveredStrokeId;

      // Draw hover or selection outline glow
      if (isSelected || isHovered) {
        ctx.save();
        if (stroke.points.length === 1) {
          ctx.fillStyle = isSelected ? 'rgba(79, 70, 229, 0.4)' : 'rgba(79, 70, 229, 0.2)';
          ctx.beginPath();
          ctx.arc(stroke.points[0].x, stroke.points[0].y, (stroke.width + 10) / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.strokeStyle = isSelected ? 'rgba(79, 70, 229, 0.4)' : 'rgba(79, 70, 229, 0.2)';
          ctx.lineWidth = stroke.width + 10;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
          for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
          }
          ctx.stroke();
        }
        ctx.restore();
      }

      // Draw standard stroke line
      if (stroke.points.length === 1) {
        ctx.beginPath();
        ctx.fillStyle = stroke.color;
        ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.width / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
      }

      // Draw dashed selection rectangle around the selected stroke
      if (isSelected) {
        const xs = stroke.points.map(p => p.x);
        const ys = stroke.points.map(p => p.y);
        const minX = Math.min(...xs) - 6;
        const maxX = Math.max(...xs) + 6;
        const minY = Math.min(...ys) - 6;
        const maxY = Math.max(...ys) + 6;

        ctx.save();
        ctx.strokeStyle = '#4f46e5';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);

        // Selection handle dots
        ctx.fillStyle = '#4f46e5';
        const sSize = 5;
        ctx.fillRect(minX - sSize / 2, minY - sSize / 2, sSize, sSize);
        ctx.fillRect(maxX - sSize / 2, minY - sSize / 2, sSize, sSize);
        ctx.fillRect(minX - sSize / 2, maxY - sSize / 2, sSize, sSize);
        ctx.fillRect(maxX - sSize / 2, maxY - sSize / 2, sSize, sSize);
        ctx.restore();
      }
    });
  };

  useEffect(() => {
    if (drawCanvasRef.current && containerRef.current) {
      const canvas = drawCanvasRef.current;
      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;
      if (newWidth > 0 && newHeight > 0) {
        if (canvas.width !== newWidth || canvas.height !== newHeight) {
          canvas.width = newWidth;
          canvas.height = newHeight;
        }
      }
    }
    redrawCanvas();
  }, [isDrawingMode, numPages, deletedPages, strokes, selectedStrokeId, hoveredStrokeId]);

  const startDrawing = (e) => {
    if (!isDrawingMode) return;
    const rect = drawCanvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (drawingTool === 'pen') {
      setIsDrawing(true);
      currentPointsRef.current = [{ x, y }];
      const ctx = drawCanvasRef.current.getContext('2d');
      ctx.beginPath();
      ctx.fillStyle = penColor;
      ctx.arc(x, y, penWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (drawingTool === 'select') {
      if (hoveredStrokeId) {
        setSelectedStrokeId(hoveredStrokeId);
      } else {
        setSelectedStrokeId(null);
      }
    }
  };

  const draw = (e) => {
    const rect = drawCanvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isDrawingMode && isDrawing && drawingTool === 'pen') {
      const ctx = drawCanvasRef.current.getContext('2d');
      const lastPoint = currentPointsRef.current[currentPointsRef.current.length - 1];
      ctx.beginPath();
      ctx.strokeStyle = penColor;
      ctx.lineWidth = penWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(lastPoint.x, lastPoint.y);
      ctx.lineTo(x, y);
      ctx.stroke();
      currentPointsRef.current.push({ x, y });
    } else if (isDrawingMode && drawingTool === 'select') {
      let minDistance = Infinity;
      let closestId = null;

      strokes.forEach(stroke => {
        const dist = getDistanceToStroke(x, y, stroke);
        if (dist < minDistance) {
          minDistance = dist;
          closestId = stroke.id;
        }
      });

      if (minDistance < 12) {
        setHoveredStrokeId(closestId);
      } else {
        setHoveredStrokeId(null);
      }
    }
  };

  const stopDrawing = () => {
    if (isDrawing && currentPointsRef.current.length > 0) {
      const newStroke = {
        id: Date.now() + '-' + Math.random(),
        points: [...currentPointsRef.current],
        color: penColor,
        width: penWidth
      };
      setStrokes(prev => [...prev, newStroke]);
      currentPointsRef.current = [];
    }
    setIsDrawing(false);
  };

  const triggerUndo = () => {
    setStrokes(prev => {
      if (prev.length === 0) return prev;
      return prev.slice(0, -1);
    });
    setSelectedStrokeId(null);
    setHoveredStrokeId(null);
  };

  const deleteSelectedStroke = () => {
    if (selectedStrokeId) {
      setStrokes(prev => prev.filter(s => s.id !== selectedStrokeId));
      setSelectedStrokeId(null);
      setHoveredStrokeId(null);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsDrawingMode(false);
        return;
      }

      const activeEl = document.activeElement;
      const isTyping = activeEl && (
        activeEl.tagName.toLowerCase() === 'input' ||
        activeEl.tagName.toLowerCase() === 'textarea' ||
        activeEl.isContentEditable
      );

      if (isTyping) return;

      if (selectedStrokeId && (e.key === 'Backspace' || e.key === 'Delete')) {
        deleteSelectedStroke();
        e.preventDefault();
      } else if (e.key === 'Backspace' || (e.ctrlKey && e.key === 'z')) {
        triggerUndo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedStrokeId, strokes]);

  const handleDeletePage = (pageNumber) => {
    setDeletedPages([...deletedPages, pageNumber]);
  };

  const addElement = (type, extra = {}) => {
    setIsDrawingMode(false);
    setFloatingElements([...floatingElements, { id: Date.now(), type, x: 100, y: window.scrollY + 100, ...extra }]);
  };

  const handleImageUpload = (e) => {
    const uploadedFile = e.target.files[0];
    if (uploadedFile) {
      const reader = new FileReader();
      reader.onload = (event) => addElement('image', { src: event.target.result });
      reader.readAsDataURL(uploadedFile);
    }
  };

  const updateElement = (id, newProps) => {
    setFloatingElements(floatingElements.map(el => el.id === id ? newProps : el));
  };

  const deleteElement = (id) => {
    setFloatingElements(floatingElements.filter(el => el.id !== id));
  };

  useEffect(() => {
    if (!file) return;

    const fileReader = new FileReader();
    fileReader.onload = async function() {
      const typedarray = new Uint8Array(this.result);
      try {
        const doc = await pdfjsLib.getDocument({
          data: typedarray,
          password: decryptionPassword || undefined
        }).promise;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
      } catch (error) {
        console.error("Error loading PDF", error);
      }
    };
    fileReader.readAsArrayBuffer(file);
  }, [file, decryptionPassword]);

  // --- DOWNLOAD HANDLER (improved: PNG + scale 3 for quality) ---
  useEffect(() => {
    const handleDownload = async (e) => {
      if (!containerRef.current) return;
      const password = e.detail?.password;

      // Before capture, ensure all edited text spans are visible
      // (they should already be, but force it for safety)
      const textSpans = containerRef.current.querySelectorAll('.textLayer span[contenteditable]');
      const originalStyles = [];
      textSpans.forEach(span => {
        originalStyles.push({
          span,
          color: span.style.color,
          bg: span.style.backgroundColor,
        });
      });

      try {
        // Capture with PNG (lossless) at high scale for best quality
        const canvas = await html2canvas(containerRef.current, { 
          scale: 3, 
          backgroundColor: '#ffffff',
          useCORS: true,
          allowTaint: true,
          logging: false,
        });

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'pt', 'a4');
        
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgHeight = (canvas.height * pdfWidth) / canvas.width;
        
        let heightLeft = imgHeight;
        let position = 0;
        
        // First page
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;
        
        // Remaining pages
        while (heightLeft > 0) {
          position -= pdfHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
          heightLeft -= pdfHeight;
        }
        
        if (password) {
          pdf.save('Layout_Edited.pdf', { encryption: { userPassword: password, ownerPassword: password, userPermissions: ['print'] } });
        } else {
          pdf.save('Layout_Edited.pdf');
        }
      } catch (err) {
        console.error('Download failed:', err);
        alert('Download failed. Please try again.');
      }
    };

    document.addEventListener('trigger-download', handleDownload);
    return () => document.removeEventListener('trigger-download', handleDownload);
  }, [numPages, floatingElements]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-primary)' }}>
      
      {/* Inline Advanced Toolbar */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center',
        alignItems: 'center',
        gap: '12px', 
        backgroundColor: 'var(--card-bg)', 
        padding: '12px', 
        borderBottom: '1px solid var(--glass-border)',
        boxShadow: 'var(--shadow-sm)',
        zIndex: 10
      }}>
        <strong style={{ color: 'var(--text-primary)', marginRight: '10px' }}>Advanced Tools:</strong>
        <button className="action-btn" onClick={() => addElement('text')}>+ Text Box</button>
        <button className="action-btn" onClick={() => imageInputRef.current?.click()}>+ Image</button>
        <input type="file" accept="image/*" ref={imageInputRef} onChange={handleImageUpload} style={{ display: 'none' }} />
        <button 
          className="action-btn" 
          onClick={() => setIsDrawingMode(!isDrawingMode)} 
          style={{ backgroundColor: isDrawingMode ? 'var(--brand-primary)' : 'var(--card-bg)', color: isDrawingMode ? 'white' : 'inherit' }}
        >
          {isDrawingMode ? '🎨 Close Drawing Panel' : '✏️ Draw (Pen)'}
        </button>
        <button 
          className="action-btn" 
          onClick={triggerUndo} 
          disabled={strokes.length === 0}
          style={{ opacity: strokes.length === 0 ? 0.5 : 1, cursor: strokes.length === 0 ? 'not-allowed' : 'pointer' }}
          title="Undo last drawing stroke"
        >
          ↩️ Undo
        </button>
        {isDrawingMode && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--glass-border)' }}>
            <button 
              className="action-btn" 
              onClick={() => { setDrawingTool('pen'); setSelectedStrokeId(null); }}
              style={{ backgroundColor: drawingTool === 'pen' ? 'var(--brand-primary)' : 'transparent', color: drawingTool === 'pen' ? 'white' : 'inherit', border: drawingTool === 'pen' ? 'none' : '1px solid var(--glass-border)', padding: '4px 8px', fontSize: '13px' }}
            >
              ✏️ Draw
            </button>
            <button 
              className="action-btn" 
              onClick={() => setDrawingTool('select')}
              style={{ backgroundColor: drawingTool === 'select' ? 'var(--brand-primary)' : 'transparent', color: drawingTool === 'select' ? 'white' : 'inherit', border: drawingTool === 'select' ? 'none' : '1px solid var(--glass-border)', padding: '4px 8px', fontSize: '13px' }}
            >
              👆 Select Stroke
            </button>
            
            {drawingTool === 'pen' && (
              <>
                <input type="color" value={penColor} onChange={(e) => setPenColor(e.target.value)} style={{ padding: '0', border: 'none', width: '24px', height: '24px', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }} title="Pen Color" />
                <select 
                  value={penWidth} 
                  onChange={(e) => setPenWidth(Number(e.target.value))}
                  style={{ background: 'var(--card-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: '4px', padding: '2px 4px', fontSize: '12px', cursor: 'pointer' }}
                >
                  <option value={2}>Thin (2px)</option>
                  <option value={4}>Medium (4px)</option>
                  <option value={6}>Thick (6px)</option>
                  <option value={10}>Extra Thick (10px)</option>
                </select>
              </>
            )}
            
            {selectedStrokeId && (
              <button 
                className="action-btn" 
                onClick={deleteSelectedStroke}
                style={{ backgroundColor: 'red', color: 'white', border: 'none', padding: '4px 8px', fontSize: '13px' }}
              >
                🗑️ Delete Selected
              </button>
            )}
            
            <button 
              className="action-btn" 
              onClick={() => { if (window.confirm("Clear all drawings?")) setStrokes([]); }}
              style={{ padding: '4px 8px', fontSize: '13px', opacity: strokes.length === 0 ? 0.5 : 1 }}
              disabled={strokes.length === 0}
            >
              🧹 Clear All
            </button>
          </div>
        )}
        <button className="action-btn" onClick={() => addElement('redaction')} style={{ backgroundColor: '#0f172a', color: 'white', border: 'none' }}>+ Redaction</button>
        <button className="action-btn" onClick={() => addElement('signature')} style={{ backgroundColor: 'var(--card-bg)', color: 'var(--brand-primary)', border: '1px solid var(--brand-primary)' }}>+ Signature</button>
        <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--glass-border)', margin: '0 8px' }} />
        <button className="action-btn" onClick={() => { setIsDrawingMode(false); setActiveModal('organize'); }}>🗂️ Organize Pages</button>
        <button className="action-btn" onClick={() => { setIsDrawingMode(false); setActiveModal('headerfooter'); }}>🔢 Headers & Footers</button>
        <button className="action-btn" onClick={() => { setIsDrawingMode(false); setActiveModal('metadata'); }}>ℹ️ Edit Metadata</button>
        <button className="action-btn" onClick={() => { setIsDrawingMode(false); setActiveModal('pdf2img'); }}>📷 Export to Images</button>
      </div>

      {/* Editing hint banner */}
      <div style={{
        textAlign: 'center',
        padding: '8px',
        backgroundColor: 'rgba(99, 102, 241, 0.08)',
        color: 'var(--brand-primary)',
        fontSize: '13px',
        fontWeight: '500',
        borderBottom: '1px solid var(--glass-border)',
      }}>
        💡 Click on any text in the PDF to edit it directly. Use the toolbar above to add overlays.
      </div>

      {/* Scrollable Workspace */}
      <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', backgroundColor: 'var(--bg-primary)', padding: '2rem', overflowY: 'auto', flex: 1 }}>
        
        {/* Main Canvas Container (html2canvas captures this) */}
        <div ref={containerRef} style={{ position: 'relative', display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff', width: 'max-content', height: 'max-content' }}>
          
          {/* Pen Tool Canvas Overlay */}
          <canvas 
            ref={drawCanvasRef} 
            style={{ 
              position: 'absolute', 
              top: 0, 
              left: 0, 
              zIndex: 90, 
              pointerEvents: isDrawingMode ? 'auto' : 'none',
              cursor: isDrawingMode ? (drawingTool === 'select' ? (hoveredStrokeId ? 'pointer' : 'default') : 'crosshair') : 'default'
            }} 
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
          />

          {/* Render PDF Pages with Delete Button */}
          {Array.from({ length: numPages }, (_, i) => i + 1)
            .filter(pageNumber => !deletedPages.includes(pageNumber))
            .map(pageNumber => (
              <div key={pageNumber} style={{ position: 'relative' }}>
                <PdfPage pdfDoc={pdfDoc} pageNumber={pageNumber} />
                <button 
                  onClick={() => handleDeletePage(pageNumber)} 
                  style={{ position: 'absolute', top: '10px', right: '-45px', background: 'var(--card-bg)', color: 'red', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '10px', cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}
                  title="Delete Page"
                >
                  Delete
                </button>
              </div>
          ))}

          {/* Render Custom Floating Elements */}
          {floatingElements.map(el => (
            <DraggableItem key={el.id} el={el} id={el.id} updateElement={updateElement} deleteElement={deleteElement} onFocus={() => setIsDrawingMode(false)} />
          ))}
          
        </div>
      </div>
      
      {activeModal && (
        <div style={modalOverlayStyle} onClick={() => setActiveModal(null)}>
          <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
            <button style={modalCloseBtnStyle} onClick={() => setActiveModal(null)}>×</button>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {activeModal === 'organize' && <OrganizeViewer file={file} decryptionPassword={decryptionPassword} />}
              {activeModal === 'headerfooter' && <HeaderFooterViewer file={file} decryptionPassword={decryptionPassword} />}
              {activeModal === 'metadata' && <MetadataViewer file={file} decryptionPassword={decryptionPassword} />}
              {activeModal === 'pdf2img' && <ConverterViewer file={file} decryptionPassword={decryptionPassword} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const modalOverlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.65)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 10000,
  backdropFilter: 'blur(8px)',
  padding: '40px',
  boxSizing: 'border-box'
};

const modalContentStyle = {
  backgroundColor: 'var(--bg-primary)',
  borderRadius: '16px',
  width: '95%',
  maxWidth: '1200px',
  height: '90vh',
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
  border: '1px solid var(--glass-border)',
  boxShadow: 'var(--shadow-lg)',
  overflow: 'hidden'
};

const modalCloseBtnStyle = {
  position: 'absolute',
  top: '15px',
  right: '25px',
  background: 'transparent',
  border: 'none',
  fontSize: '28px',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  zIndex: 10001,
  fontWeight: 'bold',
  transition: 'transform 0.2s ease'
};

export default PdfViewer;
