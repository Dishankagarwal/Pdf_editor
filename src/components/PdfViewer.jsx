import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.js?url';
import 'pdfjs-dist/web/pdf_viewer.css';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// ---------------------------------------------------------------------------
// PdfPage — Renders one page with Canvas (visible) + Click-to-Edit text layer
// ---------------------------------------------------------------------------
const PdfPage = ({ pdfDoc, pageNumber }) => {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const [page, setPage] = useState(null);

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
      {/* Canvas is hidden but still renders to provide correct page dimensions */}
      <canvas ref={canvasRef} style={{ visibility: 'hidden', display: 'block' }} />
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
const DraggableItem = ({ el, id, updateElement, deleteElement }) => {
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
  const drawCanvasRef = useRef(null);
  const drawingHistoryRef = useRef([]);

  useEffect(() => {
    if (isDrawingMode && drawCanvasRef.current && containerRef.current) {
        drawCanvasRef.current.width = containerRef.current.clientWidth;
        drawCanvasRef.current.height = containerRef.current.clientHeight;
    }
  }, [isDrawingMode, numPages, deletedPages]);

  const startDrawing = (e) => {
    if (!isDrawingMode) return;
    const ctx = drawCanvasRef.current.getContext('2d');
    drawingHistoryRef.current.push(ctx.getImageData(0, 0, drawCanvasRef.current.width, drawCanvasRef.current.height));
    const rect = drawCanvasRef.current.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing || !isDrawingMode) return;
    const ctx = drawCanvasRef.current.getContext('2d');
    const rect = drawCanvasRef.current.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = 3;
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawingMode) return;
    setIsDrawing(false);
  };

  useEffect(() => {
    const handleUndo = (e) => {
      if (isDrawingMode && (e.key === 'Backspace' || (e.ctrlKey && e.key === 'z'))) {
        const ctx = drawCanvasRef.current?.getContext('2d');
        if (!ctx) return;
        if (drawingHistoryRef.current.length > 0) {
          const lastState = drawingHistoryRef.current.pop();
          ctx.putImageData(lastState, 0, 0);
        } else {
          ctx.clearRect(0, 0, drawCanvasRef.current.width, drawCanvasRef.current.height);
        }
      }
    };
    window.addEventListener('keydown', handleUndo);
    return () => window.removeEventListener('keydown', handleUndo);
  }, [isDrawingMode]);

  const handleDeletePage = (pageNumber) => {
    setDeletedPages([...deletedPages, pageNumber]);
  };

  const addElement = (type, extra = {}) => {
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
        <button className="action-btn" onClick={() => setIsDrawingMode(!isDrawingMode)} style={{ backgroundColor: isDrawingMode ? 'var(--brand-primary)' : 'var(--card-bg)', color: isDrawingMode ? 'white' : 'inherit' }}>
          {isDrawingMode ? 'Stop Drawing' : 'Draw (Pen)'}
        </button>
        {isDrawingMode && (
          <input type="color" value={penColor} onChange={(e) => setPenColor(e.target.value)} style={{ padding: '0', border: 'none', width: '30px', height: '30px', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }} title="Pen Color" />
        )}
        <button className="action-btn" onClick={() => addElement('redaction')} style={{ backgroundColor: '#0f172a', color: 'white', border: 'none' }}>+ Redaction</button>
        <button className="action-btn" onClick={() => addElement('signature')} style={{ backgroundColor: 'var(--card-bg)', color: 'var(--brand-primary)', border: '1px solid var(--brand-primary)' }}>+ Signature</button>
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
            style={{ position: 'absolute', top: 0, left: 0, zIndex: 90, pointerEvents: isDrawingMode ? 'auto' : 'none' }} 
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
            <DraggableItem key={el.id} el={el} id={el.id} updateElement={updateElement} deleteElement={deleteElement} />
          ))}
          
        </div>
      </div>
    </div>
  );
};

export default PdfViewer;
