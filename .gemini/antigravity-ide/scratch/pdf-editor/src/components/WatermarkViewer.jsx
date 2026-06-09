import React, { useState } from 'react';
import { PDFDocument, rgb, degrees } from 'pdf-lib';

const WatermarkViewer = ({ file }) => {
  const [text, setText] = useState('CONFIDENTIAL');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleWatermark = async () => {
    if (!text.trim()) {
      alert('Please enter watermark text.');
      return;
    }
    
    setIsProcessing(true);
    
    try {
      const fileBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(fileBuffer);
      const pages = pdfDoc.getPages();
      
      pages.forEach(page => {
         const { width, height } = page.getSize();
         page.drawText(text.toUpperCase(), {
            x: width / 2 - 180,
            y: height / 2 - 50,
            size: 60,
            color: rgb(0.8, 0.8, 0.8), // light gray
            opacity: 0.5,
            rotate: degrees(45),
         });
      });
      
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Watermarked_${file.name}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (err) {
      console.error(err);
      alert('Error applying watermark.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', minHeight: '80vh', padding: '40px', backgroundColor: 'var(--bg-primary)' }}>
      <div style={{ maxWidth: '600px', width: '100%', backgroundColor: 'var(--card-bg)', padding: '40px', borderRadius: '16px', boxShadow: 'var(--shadow-lg)' }}>
        <h2 style={{ fontSize: '28px', marginBottom: '10px', color: 'var(--text-primary)' }}>Batch Watermark</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '30px' }}>Apply a watermark stamp diagonally across all pages of <strong>{file?.name}</strong>.</p>

        <label style={{ display: 'block', marginBottom: '10px', color: 'var(--text-primary)', fontWeight: 'bold' }}>Watermark Text</label>
        <input 
          type="text" 
          value={text} 
          onChange={e => setText(e.target.value)} 
          placeholder="CONFIDENTIAL" 
          style={{ width: '100%', padding: '15px', borderRadius: '8px', border: '1px solid var(--glass-border)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '16px', marginBottom: '30px', textTransform: 'uppercase' }}
        />

        <button 
          onClick={handleWatermark} 
          disabled={isProcessing}
          style={{ width: '100%', padding: '16px', fontSize: '18px', background: 'var(--brand-primary)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          {isProcessing ? 'Stamping...' : 'Apply Watermark'}
        </button>
      </div>
    </div>
  );
};

export default WatermarkViewer;
