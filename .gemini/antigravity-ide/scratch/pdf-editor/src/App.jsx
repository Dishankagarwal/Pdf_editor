import React, { useState, useEffect } from 'react';
import PdfViewer from './components/PdfViewer';
import NotepadViewer from './components/NotepadViewer';
import WordConverter from './components/WordConverter';
import MergeViewer from './components/MergeViewer';
import CompressViewer from './components/CompressViewer';
import SplitViewer from './components/SplitViewer';
import WatermarkViewer from './components/WatermarkViewer';
import LandingPage from './components/LandingPage';
import { PDFDocument, rgb } from 'pdf-lib';
import './App.css';

function App() {
  const [file, setFile] = useState(null);
  const [mergeFiles, setMergeFiles] = useState([]);
  const [editorMode, setEditorMode] = useState('layout'); 
  const [theme, setTheme] = useState('dark');
  const [pdfPassword, setPdfPassword] = useState('');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const handleSingleFileSelect = (selectedFile, mode) => {
    setFile(selectedFile);
    setMergeFiles([]);
    setEditorMode(mode);
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
    if (editorMode === 'layout' && file) return <PdfViewer file={file} />;
    if (editorMode === 'notepad' && file) return <NotepadViewer file={file} />;
    if (editorMode === 'word' && file) return <WordConverter file={file} />;
    if (editorMode === 'merge' && mergeFiles.length > 0) return <MergeViewer files={mergeFiles} />;
    if (editorMode === 'compress' && file) return <CompressViewer file={file} />;
    if (editorMode === 'split' && file) return <SplitViewer file={file} />;
    if (editorMode === 'watermark' && file) return <WatermarkViewer file={file} />;
    return <LandingPage onFileSelect={handleSingleFileSelect} onMultipleFilesSelect={handleMultipleFilesSelect} theme={theme} toggleTheme={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')} />;
  };

  return (
    <div className="app-container">
      { (file || mergeFiles.length > 0) && (
        <div className="toolbar">
          <div className="toolbar-left">
            <span style={{ fontWeight: '600' }}>Editing: </span>
            <span style={{ color: 'var(--text-secondary)', marginLeft: '10px' }}>
              {file ? file.name : `${mergeFiles.length} files selected`}
            </span>
          </div>

          {file && !['merge', 'compress', 'split', 'watermark'].includes(editorMode) && (
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

      {renderActiveViewer()}
    </div>
  );
}

export default App;
