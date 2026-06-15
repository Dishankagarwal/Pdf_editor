import React, { useState } from 'react';
import { PDFDocument } from 'pdf-lib';

const MergeViewer = ({ files }) => {
  const [isMerging, setIsMerging] = useState(false);
  const [fileList, setFileList] = useState(files.map((f, i) => ({ id: i, file: f })));
  const [draggedIdx, setDraggedIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  // Drag & Drop handlers
  const handleDragStart = (idx) => {
    setDraggedIdx(idx);
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };

  const handleDrop = (idx) => {
    if (draggedIdx === null || draggedIdx === idx) {
      setDraggedIdx(null);
      setDragOverIdx(null);
      return;
    }
    const newList = [...fileList];
    const [dragged] = newList.splice(draggedIdx, 1);
    newList.splice(idx, 0, dragged);
    setFileList(newList);
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  // Move up/down fallback
  const moveItem = (idx, direction) => {
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= fileList.length) return;
    const newList = [...fileList];
    [newList[idx], newList[newIdx]] = [newList[newIdx], newList[idx]];
    setFileList(newList);
  };

  const handleMerge = async () => {
    if (fileList.length < 2) {
      alert('Please select at least 2 PDFs to merge.');
      return;
    }

    setIsMerging(true);

    try {
      const mergedPdf = await PDFDocument.create();

      for (let i = 0; i < fileList.length; i++) {
        const fileBuffer = await fileList[i].file.arrayBuffer();
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
      URL.revokeObjectURL(url);
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
        <div style={{ fontSize: '48px', textAlign: 'center', marginBottom: '16px' }}>📑</div>
        <h2 style={{ fontSize: '28px', marginBottom: '10px', color: 'var(--text-primary)', textAlign: 'center' }}>Merge PDFs</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '10px', textAlign: 'center' }}>Combine multiple PDF files into one single document.</p>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '30px', textAlign: 'center', fontSize: '13px' }}>
          ⠿ Drag to reorder • Files merge in the order shown below
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '30px' }}>
          {fileList.map((item, index) => (
            <div
              key={item.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={() => handleDrop(index)}
              onDragEnd={handleDragEnd}
              style={{
                padding: '14px 16px',
                border: dragOverIdx === index ? '2px dashed var(--brand-primary)' : '1px solid var(--glass-border)',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                backgroundColor: draggedIdx === index ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-primary)',
                cursor: 'grab',
                transition: 'all 0.15s ease',
                opacity: draggedIdx === index ? 0.5 : 1,
                userSelect: 'none',
              }}
            >
              {/* Drag handle */}
              <span style={{ color: 'var(--text-secondary)', fontSize: '18px', cursor: 'grab', lineHeight: 1 }}>⠿</span>
              
              {/* Order number */}
              <span style={{
                width: '28px', height: '28px', borderRadius: '50%',
                background: 'var(--brand-primary)', color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '13px', fontWeight: '700', flexShrink: 0,
              }}>{index + 1}</span>

              {/* File info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: 'var(--text-primary)', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.file.name}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{(item.file.size / 1024 / 1024).toFixed(2)} MB</div>
              </div>

              {/* Move buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); moveItem(index, -1); }}
                  disabled={index === 0}
                  style={{ border: 'none', background: 'transparent', cursor: index === 0 ? 'not-allowed' : 'pointer', color: index === 0 ? 'var(--glass-border)' : 'var(--text-secondary)', fontSize: '14px', padding: '2px 6px', borderRadius: '4px', lineHeight: 1 }}
                  title="Move up"
                >▲</button>
                <button
                  onClick={(e) => { e.stopPropagation(); moveItem(index, 1); }}
                  disabled={index === fileList.length - 1}
                  style={{ border: 'none', background: 'transparent', cursor: index === fileList.length - 1 ? 'not-allowed' : 'pointer', color: index === fileList.length - 1 ? 'var(--glass-border)' : 'var(--text-secondary)', fontSize: '14px', padding: '2px 6px', borderRadius: '4px', lineHeight: 1 }}
                  title="Move down"
                >▼</button>
              </div>
            </div>
          ))}
        </div>

        <button 
          onClick={handleMerge} 
          disabled={isMerging}
          style={{ width: '100%', padding: '16px', fontSize: '18px', background: 'var(--brand-primary)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontFamily: "'Inter', sans-serif", boxShadow: 'var(--shadow-md)' }}
        >
          {isMerging ? '⏳ Merging...' : '📥 Merge Now'}
        </button>
      </div>
    </div>
  );
};

export default MergeViewer;
