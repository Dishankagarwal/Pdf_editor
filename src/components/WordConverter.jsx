import React, { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist/build/pdf';

const WordConverter = ({ file, decryptionPassword }) => {
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState(null);
  const [usedMethod, setUsedMethod] = useState(null);

  // Client-side fallback: extract text with pdfjs, build HTML, save as .doc
  const convertClientSide = async () => {
    const buffer = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      password: decryptionPassword || undefined
    }).promise;

    let htmlContent = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();

      let lastY = -1;
      let currentLine = '';
      const lines = [];

      for (const item of textContent.items) {
        const currentY = item.transform[5];
        const itemFontSize = Math.abs(item.transform[0]);

        if (lastY !== -1 && Math.abs(currentY - lastY) > 5) {
          lines.push({ text: currentLine.trim(), fontSize: itemFontSize });
          currentLine = '';
        }
        currentLine += item.str;
        lastY = currentY;
      }
      if (currentLine.trim()) {
        lines.push({ text: currentLine.trim(), fontSize: 12 });
      }

      // Build HTML with basic formatting
      htmlContent += `<div style="page-break-after: always; margin-bottom: 40px;">`;
      for (const line of lines) {
        if (!line.text) continue;
        if (line.fontSize > 20) {
          htmlContent += `<h1 style="font-size:${line.fontSize}pt; margin:10px 0;">${escapeHtml(line.text)}</h1>`;
        } else if (line.fontSize > 16) {
          htmlContent += `<h2 style="font-size:${line.fontSize}pt; margin:8px 0;">${escapeHtml(line.text)}</h2>`;
        } else if (line.fontSize > 13) {
          htmlContent += `<h3 style="font-size:${line.fontSize}pt; margin:6px 0;">${escapeHtml(line.text)}</h3>`;
        } else {
          htmlContent += `<p style="font-size:12pt; margin:4px 0; line-height:1.6;">${escapeHtml(line.text)}</p>`;
        }
      }
      htmlContent += `</div>`;
    }

    // Wrap in a Word-compatible HTML document
    const fullHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:w="urn:schemas-microsoft-com:office:word"
            xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Calibri, Arial, sans-serif; margin: 40px; color: #333; }
          h1 { color: #1a1a2e; }
          h2 { color: #334155; }
          p { color: #333; }
        </style>
      </head>
      <body>${htmlContent}</body>
      </html>
    `;

    const blob = new Blob([fullHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name.replace('.pdf', '.doc');
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const escapeHtml = (str) => {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  const handleConvert = async () => {
    setIsConverting(true);
    setError(null);
    setUsedMethod(null);

    // Try Python backend first (produces real .docx)
    try {
      const formData = new FormData();
      formData.append('file', file);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('http://localhost:5000/api/convert-to-word', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) throw new Error('Server error');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name.replace('.pdf', '.docx');
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setUsedMethod('server');
      setIsConverting(false);
      return;
    } catch (serverErr) {
      console.warn('Python server unavailable, falling back to client-side:', serverErr.message);
    }

    // Fallback: client-side conversion
    try {
      await convertClientSide();
      setUsedMethod('client');
    } catch (err) {
      console.error(err);
      setError('Conversion failed. Please try again.');
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: '80vh', backgroundColor: 'var(--bg-primary)' }}>
      <div style={{ backgroundColor: 'var(--card-bg)', padding: '50px', borderRadius: '16px', boxShadow: 'var(--shadow-lg)', textAlign: 'center', maxWidth: '500px', width: '100%' }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>📄</div>
        <h2 style={{ color: 'var(--text-primary)', marginBottom: '10px', fontSize: '28px' }}>Word Document Converter</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '30px', lineHeight: '1.6' }}>
          Your file <strong style={{ color: 'var(--text-primary)' }}>{file.name}</strong> is ready to be converted.
        </p>

        <div style={{ backgroundColor: 'rgba(99, 102, 241, 0.08)', padding: '16px', borderRadius: '10px', marginBottom: '30px', textAlign: 'left' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0, lineHeight: '1.6' }}>
            ⚡ Tries the Python server first for best quality (.docx). If unavailable, falls back to <strong style={{ color: 'var(--text-primary)' }}>100% client-side</strong> conversion (.doc) — no server needed!
          </p>
        </div>

        {error && (
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '14px', borderRadius: '8px', marginBottom: '20px', fontWeight: '600', fontSize: '14px' }}>
            ❌ {error}
          </div>
        )}

        {usedMethod && (
          <div style={{
            backgroundColor: usedMethod === 'server' ? 'rgba(5, 150, 105, 0.1)' : 'rgba(245, 158, 11, 0.1)',
            color: usedMethod === 'server' ? '#059669' : '#f59e0b',
            padding: '14px', borderRadius: '8px', marginBottom: '20px', fontWeight: '600', fontSize: '14px'
          }}>
            {usedMethod === 'server' ? '✅ Converted via Python server (.docx)' : '✅ Converted client-side (.doc — open with Word/LibreOffice)'}
          </div>
        )}

        <button 
          onClick={handleConvert}
          disabled={isConverting}
          style={{
            width: '100%',
            backgroundColor: isConverting ? 'var(--glass-border)' : 'var(--brand-primary)',
            color: 'white',
            padding: '16px 32px',
            border: 'none',
            borderRadius: '10px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: isConverting ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            boxShadow: isConverting ? 'none' : 'var(--shadow-md)',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {isConverting ? '⏳ Converting...' : '📥 Convert to Word & Download'}
        </button>
      </div>
    </div>
  );
};

export default WordConverter;
