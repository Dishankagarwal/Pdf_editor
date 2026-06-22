import React, { useState, useEffect, Suspense, lazy } from 'react';
import LandingPage from './components/LandingPage';
import { PDFDocument, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.js?url';
import './App.css';

// Lazy load tools components to optimize bundle size and speed up page load
const PdfViewer = lazy(() => import('./components/PdfViewer'));
const NotepadViewer = lazy(() => import('./components/NotepadViewer'));
const WordConverter = lazy(() => import('./components/WordConverter'));
const MergeViewer = lazy(() => import('./components/MergeViewer'));
const CompressViewer = lazy(() => import('./components/CompressViewer'));
const SplitViewer = lazy(() => import('./components/SplitViewer'));
const WatermarkViewer = lazy(() => import('./components/WatermarkViewer'));
const InvoiceGenerator = lazy(() => import('./components/InvoiceGenerator'));
const ConverterViewer = lazy(() => import('./components/ConverterViewer'));

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

function App() {
  const [file, setFile] = useState(null);
  const [mergeFiles, setMergeFiles] = useState([]);
  const [editorMode, setEditorMode] = useState('layout'); 
  const [theme, setTheme] = useState('dark');
  const [pdfPassword, setPdfPassword] = useState('');

  // Password decryption states
  const [decryptionPassword, setDecryptionPassword] = useState('');
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [pendingMode, setPendingMode] = useState('');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    let title = "Ultimate PDF Suite | Free Online Editor, Organizer, Converter & PDF Tools";
    let desc = "A premium, 100% free PDF utility suite. Edit layouts, organize & rotate pages, convert PDF to images, stitch images to PDF, add running page numbers, edit metadata, compress, split, merge, and watermark pages securely in your browser.";

    const hasFile = !!file;

    if (editorMode === 'invoice') {
      title = "Free Invoice Generator - Custom Invoice Maker | Ultimate PDF Suite";
      desc = "Create beautiful, professional invoices in seconds. Customize templates, line items, and currencies, and download as PDF instantly.";
    } else if (editorMode === 'converter') {
      title = "Images to PDF - Convert JPG, PNG to PDF Online | Ultimate PDF Suite";
      desc = "Stitch multiple JPG, PNG, and WebP images together into a clean, unified PDF document with custom page sizes and margins.";
    } else if (hasFile) {
      switch (editorMode) {
        case 'layout':
          title = "Layout Editor - Edit PDF Text & Annotate Online | Ultimate PDF Suite";
          desc = "Add custom text, drawings, signatures, and redactions over pages in your PDF. Lock documents with password encryption.";
          break;
        case 'notepad':
          title = "OCR PDF & AI Notepad - Extract Text from Scanned PDFs | Ultimate PDF Suite";
          desc = "Extract raw text from PDF files using client-side OCR, edit them directly in a notepad workspace, and download as a new PDF.";
          break;
        case 'word':
          title = "PDF to Word Converter - Convert PDF to Docx Online | Ultimate PDF Suite";
          desc = "Extract text and convert directly to an editable Microsoft Word document (.docx) online using high-fidelity conversion.";
          break;
        case 'compress':
          title = "Compress PDF Online - Reduce PDF File Size Free | Ultimate PDF Suite";
          desc = "Optimize PDF structure or downscale internal images to shrink your PDF file size while keeping all vector layout and text sharp.";
          break;
        case 'split':
          title = "Split PDF - Extract Specific Pages Online | Ultimate PDF Suite";
          desc = "Extract specific pages from a PDF or split a large document instantly using page selection tools.";
          break;
        case 'watermark':
          title = "Add Watermark to PDF - Batch Watermark Online | Ultimate PDF Suite";
          desc = "Stamp semi-transparent text or image watermarks diagonally across all pages of your PDF simultaneously.";
          break;
        case 'organize':
          title = "Organize PDF Pages - Rotate, Delete & Reorder PDF Online | Ultimate PDF Suite";
          desc = "Rearrange, rotate, delete, duplicate, and insert blank pages in your PDF document visually using client-side organizer tools.";
          break;
        case 'headerfooter':
          title = "Add Page Numbers to PDF - Headers & Footers Online | Ultimate PDF Suite";
          desc = "Add running page numbers, custom headers, or footers to your PDF documents easily with fully customizable layout settings.";
          break;
        case 'metadata':
          title = "Edit PDF Metadata - Edit Title, Author & Properties Online | Ultimate PDF Suite";
          desc = "Modify PDF metadata properties such as Title, Author, Subject, Keywords, Creator, and Producer entirely client-side.";
          break;
        default:
          break;
      }
    } else if (mergeFiles.length > 0 && editorMode === 'merge') {
      title = "Merge PDFs Online - Combine PDF Files Free | Ultimate PDF Suite";
      desc = "Select and combine multiple PDF files into one clean document. Drag and drop to reorder files before merging.";
    }

    document.title = title;
    
    // Update the description meta tag
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', desc);
    }
  }, [editorMode, file, mergeFiles]);

  const handleSingleFileSelect = async (selectedFile, mode) => {
    try {
      const fileBuffer = await selectedFile.arrayBuffer();
      // Test loading without password
      await pdfjsLib.getDocument({ data: new Uint8Array(fileBuffer) }).promise;
      setFile(selectedFile);
      setDecryptionPassword('');
      setMergeFiles([]);
      setEditorMode(mode);
    } catch (err) {
      if (err.name === 'PasswordException') {
        setPendingFile(selectedFile);
        setPendingMode(mode);
        setPasswordModalOpen(true);
        setPasswordError('');
      } else {
        alert('Error reading PDF: ' + err.message);
      }
    }
  };

  const handlePasswordSubmit = async (enteredPassword) => {
    if (!pendingFile) return;
    try {
      const fileBuffer = await pendingFile.arrayBuffer();
      await pdfjsLib.getDocument({ data: new Uint8Array(fileBuffer), password: enteredPassword }).promise;
      setFile(pendingFile);
      setDecryptionPassword(enteredPassword);
      setMergeFiles([]);
      setEditorMode(pendingMode);
      setPasswordModalOpen(false);
      setPendingFile(null);
      setPendingMode('');
      setPasswordError('');
    } catch (err) {
      if (err.name === 'PasswordException') {
        setPasswordError('Incorrect password. Please try again.');
      } else {
        setPasswordError('Error: ' + err.message);
      }
    }
  };

  const handleMultipleFilesSelect = (files) => {
    setMergeFiles(files);
    setFile(null);
    setEditorMode('merge');
  };

  const goHome = () => {
    setFile(null);
    setMergeFiles([]);
    setEditorMode('layout');
  };

  const renderActiveViewer = () => {
    if (editorMode === 'layout' && file) return <PdfViewer file={file} decryptionPassword={decryptionPassword} />;
    if (editorMode === 'notepad' && file) return <NotepadViewer file={file} decryptionPassword={decryptionPassword} />;
    if (editorMode === 'word' && file) return <WordConverter file={file} decryptionPassword={decryptionPassword} />;
    if (editorMode === 'merge' && mergeFiles.length > 0) return <MergeViewer files={mergeFiles} />;
    if (editorMode === 'compress' && file) return <CompressViewer file={file} decryptionPassword={decryptionPassword} />;
    if (editorMode === 'split' && file) return <SplitViewer file={file} decryptionPassword={decryptionPassword} />;
    if (editorMode === 'watermark' && file) return <WatermarkViewer file={file} decryptionPassword={decryptionPassword} />;
    if (editorMode === 'converter') return <ConverterViewer file={file} decryptionPassword={decryptionPassword} />;
    if (editorMode === 'invoice') return <InvoiceGenerator onGoHome={goHome} />;
    return <LandingPage onFileSelect={handleSingleFileSelect} onMultipleFilesSelect={handleMultipleFilesSelect} onModeSelect={setEditorMode} theme={theme} toggleTheme={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')} />;
  };

  return (
    <div className="app-container">
      { (file || mergeFiles.length > 0 || ['invoice', 'converter'].includes(editorMode)) && (
        <div className="toolbar">
          <div className="toolbar-left">
            <span style={{ fontWeight: '600' }}>Editing: </span>
            <span style={{ color: 'var(--text-secondary)', marginLeft: '10px' }}>
              {file ? file.name : mergeFiles.length > 0 ? `${mergeFiles.length} files selected` : editorMode === 'invoice' ? 'Invoice Builder' : 'Images to PDF'}
            </span>
          </div>

          {file && ['layout', 'notepad'].includes(editorMode) && (
            <div style={{ display: 'flex', gap: '5px', background: 'var(--glass-border)', padding: '4px', borderRadius: '8px' }}>
              <button 
                className={`action-btn ${editorMode === 'layout' ? 'primary' : ''}`}
                onClick={() => setEditorMode('layout')}
                style={{ border: 'none', background: editorMode === 'layout' ? 'var(--brand-primary)' : 'transparent', color: editorMode === 'layout' ? 'white' : 'var(--text-primary)' }}
              >
                Layout Mode
              </button>
              <button 
                className={`action-btn ${editorMode === 'notepad' ? 'primary' : ''}`}
                onClick={() => setEditorMode('notepad')}
                style={{ border: 'none', background: editorMode === 'notepad' ? 'var(--brand-primary)' : 'transparent', color: editorMode === 'notepad' ? 'white' : 'var(--text-primary)' }}
              >
                Notepad Mode
              </button>
            </div>
          )}

          <div className="toolbar-right">
            <button className="action-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} style={{ marginRight: '10px', fontSize: '16px' }}>
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              {editorMode === 'layout' && (
                <input 
                  type="password" 
                  placeholder="Lock with Password (Optional)" 
                  value={pdfPassword}
                  onChange={(e) => setPdfPassword(e.target.value)}
                  style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: '12px', width: '180px' }}
                />
              )}
              <button className="action-btn" onClick={goHome}>← Back to Home</button>
              {editorMode === 'layout' && (
                <button className="action-btn primary" onClick={() => document.dispatchEvent(new CustomEvent('trigger-download', { detail: { password: pdfPassword } }))}>
                  Download PDF
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <Suspense fallback={
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '80vh',
          color: 'var(--text-secondary)'
        }}>
          <div style={{
            border: '4px solid var(--glass-border)',
            borderTop: '4px solid var(--brand-primary)',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            animation: 'spin 1s linear infinite',
            marginBottom: '16px'
          }} />
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
          <span>Loading tool modules...</span>
        </div>
      }>
        {renderActiveViewer()}
      </Suspense>

      {passwordModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 2000,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            backgroundColor: 'var(--card-bg)',
            border: '1px solid var(--glass-border)',
            padding: '30px',
            borderRadius: '16px',
            maxWidth: '400px',
            width: '90%',
            textAlign: 'center',
            boxShadow: 'var(--shadow-lg)',
          }}>
            <h3 style={{ color: 'var(--text-primary)', marginBottom: '10px', fontSize: '20px' }}>🔒 Password Protected</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '14px', lineHeight: '1.5' }}>
              This PDF document is encrypted. Please enter the password to open it.
            </p>
            <input
              type="password"
              placeholder="Enter PDF password"
              id="pdf-decryption-password-input"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  handlePasswordSubmit(e.target.value);
                }
              }}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid var(--glass-border)',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                marginBottom: '15px',
                boxSizing: 'border-box',
                outline: 'none'
              }}
            />
            {passwordError && (
              <div style={{ color: '#ef4444', fontSize: '13px', marginBottom: '15px', fontWeight: '500' }}>
                {passwordError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className="action-btn"
                onClick={() => {
                  setPasswordModalOpen(false);
                  setPendingFile(null);
                  setPendingMode('');
                  setPasswordError('');
                }}
                style={{ flex: 1, padding: '10px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                className="action-btn primary"
                onClick={() => {
                  const input = document.getElementById('pdf-decryption-password-input');
                  if (input) handlePasswordSubmit(input.value);
                }}
                style={{ flex: 1, padding: '10px', cursor: 'pointer' }}
              >
                Open PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
