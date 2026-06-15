import React, { useState, useEffect } from 'react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/build/pdf';

const MetadataViewer = ({ file, decryptionPassword }) => {
  // Input fields
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [subject, setSubject] = useState('');
  const [keywords, setKeywords] = useState('');
  const [creator, setCreator] = useState('');
  const [producer, setProducer] = useState('');

  // Info details (read-only)
  const [fileSizeStr, setFileSizeStr] = useState('');
  const [pageCount, setPageCount] = useState(0);
  const [creationDate, setCreationDate] = useState('');
  const [modDate, setModDate] = useState('');
  const [pdfVersion, setPdfVersion] = useState('');
  const [isEncrypted, setIsEncrypted] = useState(false);

  // UI status
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Format date helper
  const parsePdfDate = (dateStr) => {
    if (!dateStr) return 'Unknown';
    // PDF dates usually look like "D:20260615150819+05'30'" or similar
    let d = dateStr;
    if (d.startsWith('D:')) d = d.substring(2);
    if (d.length >= 8) {
      const year = d.substring(0, 4);
      const month = d.substring(4, 6);
      const day = d.substring(6, 8);
      let formatted = `${year}-${month}-${day}`;
      if (d.length >= 14) {
        const hour = d.substring(8, 10);
        const min = d.substring(10, 12);
        const sec = d.substring(12, 14);
        formatted += ` ${hour}:${min}:${sec}`;
      }
      return formatted;
    }
    return dateStr;
  };

  // Load metadata on mount
  useEffect(() => {
    if (!file) return;

    const loadMetadata = async () => {
      setIsLoading(true);
      try {
        // Read file size
        const kb = file.size / 1024;
        if (kb > 1024) {
          setFileSizeStr(`${(kb / 1024).toFixed(2)} MB`);
        } else {
          setFileSizeStr(`${kb.toFixed(2)} KB`);
        }

        const buffer = await file.arrayBuffer();
        
        // 1. Get properties via pdfjsLib
        const docJs = await pdfjsLib.getDocument({
          data: new Uint8Array(buffer),
          password: decryptionPassword || undefined
        }).promise;
        
        setPageCount(docJs.numPages);
        setIsEncrypted(!!decryptionPassword);

        const meta = await docJs.getMetadata();
        const info = meta.info || {};
        
        setTitle(info.Title || '');
        setAuthor(info.Author || '');
        setSubject(info.Subject || '');
        setKeywords(info.Keywords || '');
        setCreator(info.Creator || '');
        setProducer(info.Producer || '');
        setCreationDate(parsePdfDate(info.CreationDate));
        setModDate(parsePdfDate(info.ModDate));
        
        // 2. Load with pdf-lib to get version details
        const docLib = await PDFDocument.load(buffer, { password: decryptionPassword || undefined });
        setPdfVersion(docLib.getVersion() || '1.7');

      } catch (err) {
        console.error('Error loading metadata:', err);
        alert('Could not extract PDF metadata.');
      } finally {
        setIsLoading(false);
      }
    };

    loadMetadata();
  }, [file, decryptionPassword]);

  // Apply edits
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const buffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(buffer, { password: decryptionPassword || undefined });

      pdfDoc.setTitle(title.trim());
      pdfDoc.setAuthor(author.trim());
      pdfDoc.setSubject(subject.trim());
      
      // Split keywords by comma
      const keywordArray = keywords
        .split(',')
        .map(k => k.trim())
        .filter(Boolean);
      pdfDoc.setKeywords(keywordArray);

      pdfDoc.setCreator(creator.trim());
      pdfDoc.setProducer(producer.trim());

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Metadata_Edited_${file.name}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Error updating PDF metadata properties.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '30px', width: '100%', minHeight: '100vh', padding: '40px', backgroundColor: 'var(--bg-primary)', boxSizing: 'border-box' }}>
      
      {/* Left: Input Edit Form */}
      <div style={{ flex: 1, backgroundColor: 'var(--card-bg)', padding: '40px', borderRadius: '16px', boxShadow: 'var(--shadow-lg)' }}>
        <h2 style={{ fontSize: '26px', marginBottom: '8px', color: 'var(--text-primary)' }}>Document Metadata Properties</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '30px', fontSize: '14px' }}>
          Modify the descriptive descriptors embedded inside the PDF binary tree.
        </p>

        {isLoading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading PDF metadata...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Title */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '8px' }}>Document Title</label>
              <input 
                type="text" 
                value={title} 
                onChange={e => setTitle(e.target.value)} 
                placeholder="E.g., Quarterly Report 2026"
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>

            {/* Author */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '8px' }}>Author / Owner</label>
              <input 
                type="text" 
                value={author} 
                onChange={e => setAuthor(e.target.value)} 
                placeholder="E.g., Jane Doe"
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>

            {/* Subject */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '8px' }}>Subject</label>
              <input 
                type="text" 
                value={subject} 
                onChange={e => setSubject(e.target.value)} 
                placeholder="E.g., Business Analytics"
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>

            {/* Keywords */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '8px' }}>Keywords (comma separated)</label>
              <input 
                type="text" 
                value={keywords} 
                onChange={e => setKeywords(e.target.value)} 
                placeholder="E.g., Finance, PDF, Report, 2026"
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>

            {/* Creator / Application */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '8px' }}>Creator / Application</label>
              <input 
                type="text" 
                value={creator} 
                onChange={e => setCreator(e.target.value)} 
                placeholder="E.g., Ultimate PDF Suite"
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>

            {/* Producer */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '8px' }}>PDF Producer</label>
              <input 
                type="text" 
                value={producer} 
                onChange={e => setProducer(e.target.value)} 
                placeholder="E.g., pdf-lib engine"
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>

            <button 
              onClick={handleSave} 
              disabled={isSaving} 
              className="action-btn primary" 
              style={{ width: '100%', padding: '16px', fontSize: '16px', fontWeight: 'bold', marginTop: '10px' }}
            >
              {isSaving ? '⏳ Writing Metadata...' : '📥 Save Metadata & Download'}
            </button>

          </div>
        )}
      </div>

      {/* Right: Info Card */}
      <div style={{ flex: '0 0 380px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', padding: '30px', borderRadius: '16px', boxShadow: 'var(--shadow-lg)', height: 'fit-content' }}>
        <h3 style={{ fontSize: '18px', marginBottom: '20px', color: 'var(--text-primary)' }}>File Specifications</h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>File Name:</span>
            <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '13px', textAlign: 'right', wordBreak: 'break-all', maxWidth: '200px' }}>{file?.name}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>File Size:</span>
            <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '13px' }}>{fileSizeStr}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Total Pages:</span>
            <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '13px' }}>{pageCount}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>PDF Version:</span>
            <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '13px' }}>{pdfVersion}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Encryption:</span>
            <span style={{ fontWeight: '600', color: isEncrypted ? 'var(--brand-primary)' : 'var(--text-primary)', fontSize: '13px' }}>
              {isEncrypted ? '🔒 Yes (Password)' : '🔓 None'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Creation Date:</span>
            <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '13px' }}>{creationDate}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Last Modified:</span>
            <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '13px' }}>{modDate}</span>
          </div>

        </div>

      </div>

    </div>
  );
};

export default MetadataViewer;
