import React, { useState } from 'react';
import { PDFDocument } from 'pdf-lib';

const SplitViewer = ({ file }) => {
  const [range, setRange] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSplit = async () => {
    if (!range.trim()) {
      alert('Please enter a page range.');
      return;
    }
    
    setIsProcessing(true);
    
    try {
      const fileBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(fileBuffer);
      const totalPages = pdfDoc.getPageCount();
      
      const pagesToExtract = new Set();
      const parts = range.split(',');
      for (let part of parts) {
        part = part.trim();
        if (part.includes('-')) {
          const [start, end] = part.split('-').map(Number);
          if (start && end && start <= end) {
            for (let i = start; i <= end; i++) {
              if (i >= 1 && i <= totalPages) pagesToExtract.add(i - 1); 
            }
          }
        } else {
          const num = Number(part);
          if (num && num >= 1 && num <= totalPages) {
            pagesToExtract.add(num - 1);
          }
        }
      }

      const indices = Array.from(pagesToExtract).sort((a, b) => a - b);
      if (indices.length === 0) {
         alert('No valid pages found in range. Note: Document has ' + totalPages + ' pages.');
         setIsProcessing(false);
         return;
      }

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

    } catch (err) {
      console.error(err);
      alert('Error extracting pages.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', minHeight: '80vh', padding: '40px', backgroundColor: 'var(--bg-primary)' }}>
      <div style={{ maxWidth: '600px', width: '100%', backgroundColor: 'var(--card-bg)', padding: '40px', borderRadius: '16px', boxShadow: 'var(--shadow-lg)' }}>
        <h2 style={{ fontSize: '28px', marginBottom: '10px', color: 'var(--text-primary)' }}>Split / Extract PDF</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '30px' }}>Extract specific pages from <strong>{file?.name}</strong> to create a new document.</p>

        <label style={{ display: 'block', marginBottom: '10px', color: 'var(--text-primary)', fontWeight: 'bold' }}>Page Range</label>
        <input 
          type="text" 
          value={range} 
          onChange={e => setRange(e.target.value)} 
          placeholder="e.g. 1, 3, 5-7" 
          style={{ width: '100%', padding: '15px', borderRadius: '8px', border: '1px solid var(--glass-border)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '16px', marginBottom: '30px' }}
        />

        <button 
          onClick={handleSplit} 
          disabled={isProcessing}
          style={{ width: '100%', padding: '16px', fontSize: '18px', background: 'var(--brand-primary)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          {isProcessing ? 'Extracting...' : 'Extract Pages'}
        </button>
      </div>
    </div>
  );
};

export default SplitViewer;
