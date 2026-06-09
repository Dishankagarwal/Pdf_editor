import React, { useState } from 'react';
import { PDFDocument } from 'pdf-lib';

const MergeViewer = ({ files }) => {
  const [isMerging, setIsMerging] = useState(false);
  const [fileList, setFileList] = useState(files);

  const handleMerge = async () => {
    if (fileList.length < 2) {
      alert('Please select at least 2 PDFs to merge.');
      return;
    }

    setIsMerging(true);

    try {
      const mergedPdf = await PDFDocument.create();

      for (let i = 0; i < fileList.length; i++) {
        const fileBuffer = await fileList[i].arrayBuffer();
        const pdf = await PDFDocument.load(fileBuffer);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }

      const mergedPdfBytes = await mergedPdf.save();
      const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = 'Merged_Document.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Error merging PDFs:", error);
      alert('Failed to merge PDFs. Make sure they are not encrypted.');
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', minHeight: '100vh', padding: '40px', backgroundColor: 'var(--bg-primary)' }}>
      <div style={{ maxWidth: '600px', width: '100%', backgroundColor: 'var(--card-bg)', padding: '40px', borderRadius: '16px', boxShadow: 'var(--shadow-lg)' }}>
        <h2 style={{ fontSize: '28px', marginBottom: '10px', color: 'var(--text-primary)' }}>Merge PDFs</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '30px' }}>Combine multiple PDF files into one single document.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '30px' }}>
          {fileList.map((f, index) => (
            <div key={index} style={{ padding: '15px', border: '1px solid var(--glass-border)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', backgroundColor: 'var(--bg-primary)' }}>
              <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{f.name}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{(f.size / 1024 / 1024).toFixed(2)} MB</span>
            </div>
          ))}
        </div>

        <button 
          onClick={handleMerge} 
          disabled={isMerging}
          style={{ width: '100%', padding: '16px', fontSize: '18px', background: 'var(--brand-primary)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          {isMerging ? 'Merging...' : 'Merge Now'}
        </button>
      </div>
    </div>
  );
};

export default MergeViewer;
