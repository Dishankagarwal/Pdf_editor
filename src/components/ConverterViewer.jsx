import React, { useState, useEffect, useRef } from 'react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import JSZip from 'jszip';

const ConverterViewer = ({ file: initialFile, decryptionPassword }) => {
  const [activeTab, setActiveTab] = useState('pdf2img'); // 'pdf2img' or 'img2pdf'
  const [file, setFile] = useState(initialFile || null);
  const [pdfDocJs, setPdfDocJs] = useState(null);
  
  // PDF to Image state
  const [extractedImages, setExtractedImages] = useState([]); // Array of { pageNum, dataUrl }
  const [isExtracting, setIsExtracting] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  
  // Image to PDF state
  const [imageFiles, setImageFiles] = useState([]); // Array of { id, file, previewUrl, width, height, rotation }
  const [pageSize, setPageSize] = useState('A4'); // 'A4', 'Letter', 'Fit'
  const [orientation, setOrientation] = useState('portrait'); // 'portrait', 'landscape'
  const [margin, setMargin] = useState(0); // 0, 15, 30, 50
  const [isCompiling, setIsCompiling] = useState(false);
  
  const fileInputRef = useRef(null);
  const imgInputRef = useRef(null);

  // Load PDF when file changes
  useEffect(() => {
    if (activeTab !== 'pdf2img' || !file) return;

    const loadAndExtract = async () => {
      setIsExtracting(true);
      setExtractedImages([]);
      try {
        const buffer = await file.arrayBuffer();
        const doc = await pdfjsLib.getDocument({
          data: new Uint8Array(buffer),
          password: decryptionPassword || undefined
        }).promise;
        setPdfDocJs(doc);

        const imageList = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          // Extract page at high scale for clean image output (scale 2)
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          
          await page.render({ canvasContext: ctx, viewport }).promise;
          imageList.push({
            pageNum: i,
            dataUrl: canvas.toDataURL('image/png')
          });
          
          // Set progress intermediate states
          setExtractedImages([...imageList]);
        }
      } catch (err) {
        console.error('Error extracting PDF pages:', err);
        alert('Could not extract images from PDF.');
      } finally {
        setIsExtracting(false);
      }
    };

    loadAndExtract();
  }, [file, activeTab, decryptionPassword]);

  // Handle PDF upload
  const handlePdfUpload = (e) => {
    const uploadedFile = e.target.files[0];
    if (uploadedFile) {
      setFile(uploadedFile);
    }
  };

  // Download ZIP of all pages
  const downloadAllImagesZip = async () => {
    if (extractedImages.length === 0) return;
    setIsZipping(true);
    try {
      const zip = new JSZip();
      extractedImages.forEach((img) => {
        const base64Data = img.dataUrl.split(',')[1];
        zip.file(`Page_${img.pageNum}.png`, base64Data, { base64: true });
      });

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Images_${file?.name || 'document'}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('ZIP compilation failed:', err);
      alert('Error building ZIP archive.');
    } finally {
      setIsZipping(false);
    }
  };

  // Image to PDF handlers
  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    files.forEach(f => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          setImageFiles(prev => [...prev, {
            id: `img-${Date.now()}-${Math.random()}`,
            file: f,
            previewUrl: ev.target.result,
            width: img.naturalWidth,
            height: img.naturalHeight,
            rotation: 0
          }]);
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(f);
    });
    e.target.value = '';
  };

  const removeImage = (id) => {
    setImageFiles(prev => prev.filter(img => img.id !== id));
  };

  const moveImage = (index, direction) => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= imageFiles.length) return;
    setImageFiles(prev => {
      const nextList = [...prev];
      const [moved] = nextList.splice(index, 1);
      nextList.splice(target, 0, moved);
      return nextList;
    });
  };

  const rotateImage = (index) => {
    setImageFiles(prev => prev.map((img, idx) => {
      if (idx !== index) return img;
      return { ...img, rotation: (img.rotation + 90) % 360 };
    }));
  };

  // Embedded helper to convert formats on canvas
  const embedImageFile = async (pdfDoc, imgItem) => {
    const { file: f, rotation } = imgItem;
    
    // We render the image on canvas to handle rotation and WebP/SVG format conversions
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = async () => {
          try {
            const canvas = document.createElement('canvas');
            
            // Adjust canvas size for rotation
            const is90or270 = rotation === 90 || rotation === 270;
            const width = is90or270 ? img.naturalHeight : img.naturalWidth;
            const height = is90or270 ? img.naturalWidth : img.naturalHeight;
            
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext('2d');
            ctx.translate(width / 2, height / 2);
            ctx.rotate((rotation * Math.PI) / 180);
            ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
            
            const dataUrl = canvas.toDataURL('image/png');
            const base64Data = dataUrl.split(',')[1];
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            
            const embedded = await pdfDoc.embedPng(bytes);
            resolve({ embedded, width, height });
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = () => reject(new Error('Failed to render image canvas.'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Failed to read image bytes.'));
      reader.readAsDataURL(f);
    });
  };

  const compilePdf = async () => {
    if (imageFiles.length === 0) return;
    setIsCompiling(true);
    try {
      const pdfDoc = await PDFDocument.create();

      // Page dimensions mapping
      const sizes = {
        'A4': [595.27, 841.89],
        'Letter': [612, 792]
      };

      for (const imgItem of imageFiles) {
        const { embedded, width: imgWidth, height: imgHeight } = await embedImageFile(pdfDoc, imgItem);
        
        let pageWidth, pageHeight;
        if (pageSize === 'Fit') {
          pageWidth = imgWidth + margin * 2;
          pageHeight = imgHeight + margin * 2;
        } else {
          const baseSize = sizes[pageSize];
          pageWidth = orientation === 'landscape' ? baseSize[1] : baseSize[0];
          pageHeight = orientation === 'landscape' ? baseSize[0] : baseSize[1];
        }

        const page = pdfDoc.addPage([pageWidth, pageHeight]);

        const availWidth = pageWidth - margin * 2;
        const availHeight = pageHeight - margin * 2;

        // Scale proportionally
        const scale = Math.min(availWidth / imgWidth, availHeight / imgHeight);
        const drawWidth = imgWidth * scale;
        const drawHeight = imgHeight * scale;

        // Center the image within layout margins
        const x = margin + (availWidth - drawWidth) / 2;
        const y = margin + (availHeight - drawHeight) / 2;

        page.drawImage(embedded, {
          x,
          y,
          width: drawWidth,
          height: drawHeight
        });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Images_Compiled.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to compile PDF:', err);
      alert('Error creating PDF from images.');
    } finally {
      setIsCompiling(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: '100vh', backgroundColor: 'var(--bg-primary)', padding: '40px', boxSizing: 'border-box' }}>
      
      {/* Top Tabs */}
      <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', padding: '6px', borderRadius: '12px', width: 'fit-content', margin: '0 auto 40px auto', boxShadow: 'var(--shadow-sm)' }}>
        <button 
          onClick={() => setActiveTab('pdf2img')}
          style={{
            padding: '12px 24px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px', fontFamily: "'Inter', sans-serif",
            background: activeTab === 'pdf2img' ? 'var(--brand-primary)' : 'transparent',
            color: activeTab === 'pdf2img' ? 'white' : 'var(--text-secondary)'
          }}
        >
          🖼️ PDF to Image
        </button>
        <button 
          onClick={() => setActiveTab('img2pdf')}
          style={{
            padding: '12px 24px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px', fontFamily: "'Inter', sans-serif",
            background: activeTab === 'img2pdf' ? 'var(--brand-primary)' : 'transparent',
            color: activeTab === 'img2pdf' ? 'white' : 'var(--text-secondary)'
          }}
        >
          📄 Image to PDF
        </button>
      </div>

      <div style={{ display: 'flex', gap: '30px', width: '100%' }}>
        {activeTab === 'pdf2img' ? (
          <>
            {/* PDF to Image: Left Controls */}
            <div style={{ flex: '0 0 350px', backgroundColor: 'var(--card-bg)', padding: '30px', borderRadius: '16px', boxShadow: 'var(--shadow-lg)', maxHeight: '75vh', overflowY: 'auto' }}>
              <div style={{ fontSize: '48px', textAlign: 'center', marginBottom: '16px' }}>🖼️</div>
              <h2 style={{ fontSize: '24px', marginBottom: '10px', color: 'var(--text-primary)', textAlign: 'center' }}>PDF to Image</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '30px', textAlign: 'center', fontSize: '14px', lineHeight: '1.4' }}>
                Convert each page of your PDF file into a crisp, high-resolution PNG image.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="action-btn"
                  style={{ width: '100%' }}
                >
                  📁 Upload Different PDF
                </button>
                <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handlePdfUpload} style={{ display: 'none' }} />

                {file && (
                  <div style={{ padding: '12px', background: 'var(--bg-primary)', borderRadius: '8px', fontSize: '13px', border: '1px solid var(--glass-border)', wordBreak: 'break-all' }}>
                    <strong>Selected:</strong> {file.name}
                  </div>
                )}

                <button
                  onClick={downloadAllImagesZip}
                  disabled={extractedImages.length === 0 || isZipping || isExtracting}
                  className="action-btn primary"
                  style={{ width: '100%', padding: '15px', fontSize: '16px', fontWeight: 'bold', marginTop: '10px' }}
                >
                  {isZipping ? 'Generating ZIP...' : '📥 Download All as ZIP'}
                </button>
              </div>
            </div>

            {/* PDF to Image: Right Preview Gallery */}
            <div style={{ flex: 1, backgroundColor: 'var(--card-bg)', padding: '30px', borderRadius: '16px', boxShadow: 'var(--shadow-lg)', minHeight: '500px' }}>
              <h3 style={{ fontSize: '18px', color: 'var(--text-primary)', marginBottom: '20px' }}>Extracted Images Gallery</h3>
              
              {isExtracting ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '350px', color: 'var(--text-secondary)' }}>
                  <span style={{ fontSize: '32px', marginBottom: '12px', animation: 'spin 2s linear infinite' }}>⏳</span>
                  <span>Extracting page canvases from PDF...</span>
                </div>
              ) : extractedImages.length === 0 ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '350px', border: '2px dashed var(--glass-border)', borderRadius: '12px', color: 'var(--text-secondary)' }}>
                  Upload a PDF to view and download images.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
                  {extractedImages.map((img) => (
                    <div key={img.pageNum} style={{ border: '1px solid var(--glass-border)', borderRadius: '10px', overflow: 'hidden', backgroundColor: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', padding: '10px', gap: '10px', boxShadow: 'var(--shadow-sm)' }}>
                      <div style={{ width: '100%', height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff', borderRadius: '6px', overflow: 'hidden' }}>
                        <img src={img.dataUrl} alt={`Page ${img.pageNum}`} style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-primary)' }}>Page {img.pageNum}</span>
                        <a 
                          href={img.dataUrl} 
                          download={`Page_${img.pageNum}_${file?.name.replace('.pdf', '') || 'image'}.png`}
                          style={{
                            textDecoration: 'none', background: 'var(--brand-primary)', color: 'white', fontSize: '11px', fontWeight: 'bold', padding: '6px 12px', borderRadius: '6px', transition: 'background-color 0.2s'
                          }}
                        >
                          Download
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Image to PDF: Left Controls */}
            <div style={{ flex: '0 0 350px', backgroundColor: 'var(--card-bg)', padding: '30px', borderRadius: '16px', boxShadow: 'var(--shadow-lg)' }}>
              <div style={{ fontSize: '48px', textAlign: 'center', marginBottom: '16px' }}>📄</div>
              <h2 style={{ fontSize: '24px', marginBottom: '10px', color: 'var(--text-primary)', textAlign: 'center' }}>Image to PDF</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '25px', textAlign: 'center', fontSize: '14px', lineHeight: '1.4' }}>
                Select images and stitch them together into a single, beautifully scaled PDF document.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <button 
                    onClick={() => imgInputRef.current?.click()}
                    className="action-btn"
                    style={{ width: '100%', padding: '12px' }}
                  >
                    📸 Select Images
                  </button>
                  <input ref={imgInputRef} type="file" accept="image/*" multiple onChange={handleImageUpload} style={{ display: 'none' }} />
                </div>

                {/* Page Size Selection */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '8px' }}>Page Size</label>
                  <select 
                    value={pageSize} 
                    onChange={e => setPageSize(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--glass-border)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }}
                  >
                    <option value="A4">A4 (Standard)</option>
                    <option value="Letter">US Letter</option>
                    <option value="Fit">Fit to Image Size</option>
                  </select>
                </div>

                {/* Orientation (Conditional) */}
                {pageSize !== 'Fit' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '8px' }}>Orientation</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        onClick={() => setOrientation('portrait')}
                        style={{
                          flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', border: '1px solid var(--glass-border)', fontWeight: '600', fontSize: '13px',
                          background: orientation === 'portrait' ? 'rgba(99, 102, 241, 0.1)' : 'var(--bg-primary)',
                          color: orientation === 'portrait' ? 'var(--brand-primary)' : 'var(--text-secondary)',
                          borderColor: orientation === 'portrait' ? 'var(--brand-primary)' : 'var(--glass-border)'
                        }}
                      >
                        Portrait
                      </button>
                      <button 
                        onClick={() => setOrientation('landscape')}
                        style={{
                          flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', border: '1px solid var(--glass-border)', fontWeight: '600', fontSize: '13px',
                          background: orientation === 'landscape' ? 'rgba(99, 102, 241, 0.1)' : 'var(--bg-primary)',
                          color: orientation === 'landscape' ? 'var(--brand-primary)' : 'var(--text-secondary)',
                          borderColor: orientation === 'landscape' ? 'var(--brand-primary)' : 'var(--glass-border)'
                        }}
                      >
                        Landscape
                      </button>
                    </div>
                  </div>
                )}

                {/* Margins */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '8px' }}>Page Margins</label>
                  <select 
                    value={margin} 
                    onChange={e => setMargin(Number(e.target.value))}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--glass-border)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }}
                  >
                    <option value={0}>None (Full Bleed)</option>
                    <option value={15}>Small (15pt)</option>
                    <option value={30}>Medium (30pt)</option>
                    <option value={50}>Large (50pt)</option>
                  </select>
                </div>

                <button
                  onClick={compilePdf}
                  disabled={imageFiles.length === 0 || isCompiling}
                  className="action-btn primary"
                  style={{ width: '100%', padding: '15px', fontSize: '16px', fontWeight: 'bold', marginTop: '15px' }}
                >
                  {isCompiling ? 'Creating PDF...' : '📥 Stitch into PDF'}
                </button>
              </div>
            </div>

            {/* Image to PDF: Right Reorder List */}
            <div style={{ flex: 1, backgroundColor: 'var(--card-bg)', padding: '30px', borderRadius: '16px', boxShadow: 'var(--shadow-lg)' }}>
              <h3 style={{ fontSize: '18px', color: 'var(--text-primary)', marginBottom: '20px' }}>Stitched Images Queue ({imageFiles.length})</h3>

              {imageFiles.length === 0 ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '350px', border: '2px dashed var(--glass-border)', borderRadius: '12px', color: 'var(--text-secondary)' }}>
                  No images selected. Upload JPG, PNG or WebP images to convert them.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '600px', overflowY: 'auto' }}>
                  {imageFiles.map((img, idx) => (
                    <div 
                      key={img.id} 
                      style={{
                        display: 'flex', alignItems: 'center', gap: '20px', padding: '15px', border: '1px solid var(--glass-border)', borderRadius: '10px', backgroundColor: 'var(--bg-secondary)', boxShadow: 'var(--shadow-sm)'
                      }}
                    >
                      {/* Image Preview */}
                      <div style={{ width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--glass-border)' }}>
                        <img 
                          src={img.previewUrl} 
                          alt="Thumbnail" 
                          style={{
                            maxWidth: '90%', maxHeight: '90%', objectFit: 'contain',
                            transform: `rotate(${img.rotation}deg)`,
                            transition: 'transform 0.2s'
                          }} 
                        />
                      </div>

                      {/* Image details */}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 'bold', color: 'var(--text-primary)', fontSize: '14px', wordBreak: 'break-all' }}>{img.file.name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          Size: {img.width}x{img.height} px | Format: {img.file.type.split('/')[1].toUpperCase()}
                        </div>
                      </div>

                      {/* Control operations */}
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => rotateImage(idx)} title="Rotate image 90°" style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--glass-border)', cursor: 'pointer', background: 'var(--card-bg)', color: 'var(--text-primary)' }}>↪️ Rotate</button>
                        <button disabled={idx === 0} onClick={() => moveImage(idx, 'up')} style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--glass-border)', cursor: idx === 0 ? 'not-allowed' : 'pointer', opacity: idx === 0 ? 0.4 : 1, background: 'var(--card-bg)', color: 'var(--text-primary)' }}>▲</button>
                        <button disabled={idx === imageFiles.length - 1} onClick={() => moveImage(idx, 'down')} style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--glass-border)', cursor: idx === imageFiles.length - 1 ? 'not-allowed' : 'pointer', opacity: idx === imageFiles.length - 1 ? 0.4 : 1, background: 'var(--card-bg)', color: 'var(--text-primary)' }}>▼</button>
                        <button onClick={() => removeImage(img.id)} style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--glass-border)', cursor: 'pointer', background: '#ef4444', color: 'white' }}>🗑️ Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ConverterViewer;
