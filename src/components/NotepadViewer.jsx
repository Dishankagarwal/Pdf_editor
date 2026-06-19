import React, { useEffect, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import { jsPDF } from 'jspdf';
import Tesseract from 'tesseract.js';


const NotepadViewer = ({ file, decryptionPassword }) => {
  const [extractedText, setExtractedText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showProModal, setShowProModal] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [isScannedPdf, setIsScannedPdf] = useState(false);
  const [ocrProgress, setOcrProgress] = useState('');
  const [isOcrRunning, setIsOcrRunning] = useState(false);

  const runOcr = async () => {
    setIsOcrRunning(true);
    setOcrProgress('Initializing Tesseract OCR Engine...');
    
    try {
      const fileReader = new FileReader();
      fileReader.onload = async function() {
        const typedarray = new Uint8Array(this.result);
        try {
          const doc = await pdfjsLib.getDocument({
            data: typedarray,
            password: decryptionPassword || undefined
          }).promise;
          
          let combinedText = '';

          for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
            setOcrProgress(`Reading page ${pageNum} of ${doc.numPages}...`);
            const page = await doc.getPage(pageNum);
            
            // Render to hidden canvas at scale 2.0 for higher OCR accuracy
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            
            await page.render({ canvasContext: ctx, viewport }).promise;
            
            // Run Tesseract recognition
            const { data: { text } } = await Tesseract.recognize(canvas, 'eng', {
              logger: m => {
                if (m.status === 'recognizing text') {
                  setOcrProgress(`Scanning Page ${pageNum} of ${doc.numPages} (${Math.round(m.progress * 100)}%)...`);
                }
              }
            });
            
            combinedText += text + `\n\n--- Page ${pageNum} ---\n\n`;
          }

          setExtractedText(combinedText.trim());
          setIsScannedPdf(false);
        } catch (err) {
          console.error('OCR failed:', err);
          alert('OCR failed: ' + err.message);
        } finally {
          setIsOcrRunning(false);
          setOcrProgress('');
        }
      };
      fileReader.readAsArrayBuffer(file);
    } catch (err) {
      console.error(err);
      alert('Failed to read PDF file.');
      setIsOcrRunning(false);
      setOcrProgress('');
    }
  };

  const simulateProUpgrade = () => {
    setIsPolishing(true);
    setShowProModal(false);
    
    // Simulate API delay for realism
    setTimeout(() => {
      setExtractedText(prev => prev + '\n\n[PRO UPGRADE ACTIVE: Your resume has been rewritten to be perfectly ATS-optimized! (This is a mocked API response so you don\'t spend tokens!)]');
      setIsPolishing(false);
    }, 2500);
  };

  useEffect(() => {
    if (!file) return;

    const extractText = async () => {
      setIsLoading(true);
      const fileReader = new FileReader();
      
      fileReader.onload = async function() {
        const typedarray = new Uint8Array(this.result);
        try {
          const doc = await pdfjsLib.getDocument({
            data: typedarray,
            password: decryptionPassword || undefined
          }).promise;
          let fullText = '';

          for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
            const page = await doc.getPage(pageNum);
            const textContent = await page.getTextContent();
            
            let lastY = -1;
            let lastX = -1;
            let pageText = '';

            for (const item of textContent.items) {
              const currentY = item.transform[5];
              const currentX = item.transform[4];
              const fontSize = Math.abs(item.transform[0]);
              
              if (lastY !== -1 && Math.abs(currentY - lastY) > 6) {
                pageText += '\n';
                if (lastX !== -1 && currentX - lastX > 25) {
                  pageText += '  '; // Indent detection
                }
              }
              
              // Header detection: large text at the start of a line
              if ((lastY === -1 || Math.abs(currentY - lastY) > 6) && fontSize > 16 && item.str.trim()) {
                pageText += fontSize > 20 ? '# ' : '## ';
              }
              
              pageText += item.str;
              lastY = currentY;
              lastX = currentX;
            }
            
            fullText += pageText + '\n\n--- Page ' + pageNum + ' ---\n\n';
          }

          setExtractedText(fullText.trim());
          const isTextEmpty = fullText.replace(/--- Page \d+ ---/g, '').trim().length === 0;
          setIsScannedPdf(isTextEmpty);
        } catch (error) {
          console.error("Error extracting text", error);
          setExtractedText('Error extracting text from PDF.');
        } finally {
          setIsLoading(false);
        }
      };
      
      fileReader.readAsArrayBuffer(file);
    };

    extractText();
  }, [file]);

  useEffect(() => {
    const handleDownload = () => {
      if (!extractedText) return;
      const doc = new jsPDF();
      // Split text to fit within A4 width (approx 180mm with margins)
      const splitText = doc.splitTextToSize(extractedText, 180);
      doc.text(splitText, 15, 20);
      doc.save('Notepad_Edited.pdf');
    };
    
    document.addEventListener('trigger-download', handleDownload);
    return () => document.removeEventListener('trigger-download', handleDownload);
  }, [extractedText]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: '100vh', padding: '2rem', backgroundColor: 'var(--bg-primary)', boxSizing: 'border-box' }}>
      {isLoading ? (
        <p style={{ color: 'var(--text-primary)', textAlign: 'center', width: '100%', marginTop: '50px' }}>Extracting text into Notepad... Please wait.</p>
      ) : (
        <>
          {/* Scanned PDF warning banner */}
          {isScannedPdf && !isOcrRunning && (
            <div style={{
              backgroundColor: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid #f59e0b',
              padding: '20px',
              borderRadius: '8px',
              marginBottom: '20px',
              textAlign: 'left'
            }}>
              <h3 style={{ color: '#f59e0b', margin: '0 0 8px 0', fontSize: '16px', fontWeight: 'bold' }}>⚠️ Scanned PDF / Image-Only File Detected</h3>
              <p style={{ color: 'var(--text-secondary)', margin: '0 0 16px 0', fontSize: '13px', lineHeight: '1.5' }}>
                This PDF appears to be a scanned document or contains only images, as no selectable text could be extracted.
                You can run client-side OCR (Optical Character Recognition) to scan and extract the text from the images.
              </p>
              <button className="action-btn primary" onClick={runOcr} style={{ display: 'flex', alignItems: 'center', gap: '8px', border: 'none', cursor: 'pointer' }}>
                🔍 Run OCR on PDF
              </button>
            </div>
          )}

          {/* OCR running progress */}
          {isOcrRunning && (
            <div style={{
              backgroundColor: 'rgba(99, 102, 241, 0.08)',
              border: '1px solid var(--brand-primary)',
              padding: '25px',
              borderRadius: '8px',
              marginBottom: '20px',
              textAlign: 'center'
            }}>
              <span style={{ fontSize: '24px', display: 'inline-block', marginBottom: '10px' }}>⏳</span>
              <h3 style={{ color: 'var(--text-primary)', margin: '0 0 8px 0', fontSize: '16px', fontWeight: 'bold' }}>Running OCR Scanning</h3>
              <p style={{ color: 'var(--text-secondary)', margin: '0 0 16px 0', fontSize: '13px' }}>
                {ocrProgress || 'Initializing Tesseract OCR Engine...'}
              </p>
              <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--glass-border)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '100%', backgroundColor: 'var(--brand-primary)', animation: 'ocrPulse 1.5s ease-in-out infinite' }} />
              </div>
              <style>{`@keyframes ocrPulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }`}</style>
            </div>
          )}

          {/* Advanced Notepad Toolbar */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
            <button className="action-btn" onClick={() => setShowProModal(true)} style={{ background: 'linear-gradient(135deg, #6366f1, #f472b6)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer' }} disabled={isOcrRunning}>
              {isPolishing ? 'Polishing...' : 'AI Polish (Pro)'}
            </button>
          </div>

          <textarea
            value={extractedText}
            onChange={(e) => setExtractedText(e.target.value)}
            disabled={isPolishing}
            style={{
              flex: 1,
              width: '100%',
              minHeight: '80vh',
              padding: '40px',
              fontSize: '16px',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              lineHeight: '1.6',
              color: 'var(--text-primary)',
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--glass-border)',
              borderRadius: '8px',
              boxShadow: 'var(--shadow-md)',
              resize: 'none',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />

          {/* Subscription Modal */}
          {showProModal && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000, backdropFilter: 'blur(3px)' }}>
              <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--glass-border)', padding: '40px', borderRadius: '16px', maxWidth: '400px', textAlign: 'center', boxShadow: 'var(--shadow-lg)' }}>
                <h2 style={{ marginBottom: '15px', color: 'var(--text-primary)' }}>Pro Features (Beta)</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '30px', lineHeight: '1.5' }}>
                  The AI Resume Polisher is currently in closed Beta testing to ensure maximum accuracy and performance. Payment gateways will open once Beta testing is complete!
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button className="action-btn primary" disabled style={{ padding: '15px', fontSize: '16px', cursor: 'not-allowed', opacity: 0.5 }}>
                    Join Beta Waitlist (Coming Soon)
                  </button>
                  <button className="action-btn" onClick={() => setShowProModal(false)} style={{ padding: '10px', cursor: 'pointer' }}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default NotepadViewer;
