import React, { useRef } from 'react';
import './LandingPage.css';

const LandingPage = ({ onFileSelect, onMultipleFilesSelect, onModeSelect, theme, toggleTheme }) => {
  const singleInputRef = useRef(null);
  const multipleInputRef = useRef(null);
  const currentModeRef = useRef('layout');

  const handleSingleSelect = (mode) => {
    currentModeRef.current = mode;
    singleInputRef.current.click();
  };

  const handleMultipleSelect = () => {
    multipleInputRef.current.click();
  };

  const onSingleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0], currentModeRef.current);
    }
    e.target.value = ''; 
  };

  const onMultipleFilesChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      onMultipleFilesSelect(Array.from(e.target.files));
    }
    e.target.value = ''; 
  };

  const handleToolClick = (tool) => {
    if (tool.type === 'direct') {
      onModeSelect(tool.mode);
    } else if (tool.type === 'single') {
      handleSingleSelect(tool.mode);
    } else {
      handleMultipleSelect();
    }
  };

  const tools = [
    { mode: 'layout', title: 'Layout Editor', desc: 'Add text, images, redactions, signatures, and drawings.', isPro: false, type: 'single' },
    { mode: 'converter', title: 'Images to PDF', desc: 'Stitch multiple JPG, PNG, and WebP images into a clean PDF document.', isPro: false, type: 'direct' },
    { mode: 'notepad', title: 'AI Notepad', desc: 'Extract raw text and let AI polish your resume instantly.', isPro: true, type: 'single' },
    { mode: 'word', title: 'Convert to Word', desc: 'Extract text and convert directly to an editable Word document.', isPro: false, type: 'single' },
    { mode: 'merge', title: 'Merge PDFs', desc: 'Combine multiple PDF files into one clean document.', isPro: false, type: 'multiple' },
    { mode: 'compress', title: 'Compress PDF', desc: 'Reduce file size drastically for easy emailing.', isPro: false, type: 'single' },
    { mode: 'split', title: 'Split / Extract', desc: 'Extract specific pages or split a large document instantly.', isPro: false, type: 'single' },
    { mode: 'watermark', title: 'Batch Watermark', desc: 'Stamp text diagonally across every page simultaneously.', isPro: false, type: 'single' },
    { mode: 'invoice', title: 'Invoice Generator', desc: 'Create stunning, professional invoices and download as PDF instantly.', isPro: false, type: 'direct', icon: '🧾' },
  ];

  const faqs = [
    { q: "What is Ultimate PDF Suite?", a: "Ultimate PDF Suite is a comprehensive, free online platform that allows you to edit, merge, split, compress, watermark, and digitally sign your PDF documents directly in your browser without any software installation." },
    { q: "Is this PDF editor really free?", a: "Yes! All of our core tools including the Layout Editor, Merger, Splitter, and Compressor are 100% free to use. Premium AI features are currently in closed beta." },
    { q: "How do I merge multiple PDF files?", a: "Simply click on the 'Merge PDFs' tool on the dashboard, select two or more PDF files from your computer, and our engine will instantly combine them into a single, clean document." },
    { q: "Can I split a large PDF into smaller files?", a: "Yes, our 'Split / Extract' tool allows you to type in specific page numbers or ranges (e.g., '1, 3, 5-10') and it will instantly extract those exact pages into a new, smaller PDF." },
    { q: "How do I add a digital signature to a PDF online?", a: "Open your document in the 'Layout Editor' and click the '+ Signature' button. You can type your name, which will automatically convert to a cursive signature with a digital timestamp, and drag it anywhere on the page." },
    { q: "How do I edit existing text in a PDF?", a: "Our advanced Layout Editor features a 'Block-Push' engine for standard English documents. Just click on existing text to modify it, and surrounding text will automatically reflow to accommodate your changes." },
    { q: "Does the PDF editor support Hindi and other complex languages?", a: "Yes, our platform supports viewing and stamping annotations over almost any language, including Hindi. However, due to complex font subsetting, editing existing text in non-English extracted files may not be fully supported." },
    { q: "How do I compress a PDF file size?", a: "Select the 'Compress PDF' tool, upload your heavy document, and our optimization engine will reduce the file size drastically while maintaining visual quality, making it perfect for email attachments." },
    { q: "What is the AI Notepad and Resume Polisher?", a: "The AI Notepad extracts the raw text from your PDF. The Pro Resume Polisher feature (currently in Beta) uses AI to rewrite your bullet points for maximum ATS (Applicant Tracking System) compatibility." },
    { q: "Can I convert a PDF to a Word document?", a: "Yes! Click the 'Convert to Word' tool, upload your PDF, and our system will extract the text and generate an editable .docx Word file that you can download instantly." },
    { q: "How do I add a watermark to my PDF?", a: "Use the 'Batch Watermark' tool. Type any phrase like 'CONFIDENTIAL' or 'DRAFT', and our engine will stamp it in large, semi-transparent letters diagonally across every single page simultaneously." },
    { q: "Are my uploaded PDF files secure?", a: "Absolutely. Most of our tools, including the Layout Editor and Merger, run entirely 'client-side'. This means your files are processed directly inside your browser and are never uploaded to any external servers." },
    { q: "How do I redact sensitive information?", a: "Open the Layout Editor and click the '+ Redaction' button. A black box will appear that you can resize and drag over sensitive text, passwords, or personal information before downloading the final PDF." },
    { q: "Can I draw or highlight freely on my PDF?", a: "Yes, the Layout Editor includes a 'Draw (Pen)' tool with a custom color picker. You can sketch, highlight, or draw arrows anywhere on the document. You can also easily 'Undo' strokes if you make a mistake." },
    { q: "Will watermarking or merging reduce the quality of my PDF?", a: "No, our PDF manipulation tools use mathematical vector processing (`pdf-lib`) to preserve 100% of the original document quality and resolution when merging, splitting, or watermarking." }
  ];

  return (
    <div className="landing-container">
      <div className="landing-sidebar">
        <h2 className="sidebar-logo">PDF Magic Suite</h2>
        <nav className="sidebar-nav">
          {tools.map(tool => (
            <button 
               key={tool.mode} 
               className={`sidebar-btn ${tool.isPro ? 'pro-btn' : ''}`}
               onClick={() => handleToolClick(tool)}
            >
              {tool.title}
              {tool.isPro && <span className="pro-badge-small">PRO</span>}
            </button>
          ))}
        </nav>
      </div>

      <div className="landing-content" style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', top: '30px', right: '30px', zIndex: 10 }}>
          <button 
            className="action-btn" 
            onClick={toggleTheme} 
            style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', padding: '8px 16px' }}
          >
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>
        </div>
        <div className="landing-hero">
          <h1 className="hero-title">Welcome to your Workspace</h1>
          <p className="hero-subtitle">Select a highly-optimized utility from the dashboard to begin.</p>
          
          <div className="feature-cards-grid">
            {tools.map(tool => (
              <div 
                 key={tool.mode}
                 className={`feature-card ${tool.isPro ? 'pro-card' : ''}`} 
                 onClick={() => handleToolClick(tool)}
              >
                 {tool.isPro && <div className="pro-badge">PRO</div>}
                 <h3>{tool.title}</h3>
                 <p>{tool.desc}</p>
              </div>
            ))}
          </div>
          
          <div className="faq-section">
            <h2 className="faq-title">Frequently Asked Questions</h2>
            <div className="faq-grid">
              {faqs.map((faq, idx) => (
                <div key={idx} className="faq-card">
                  <h4 className="faq-q">{faq.q}</h4>
                  <p className="faq-a">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <input type="file" accept="application/pdf" ref={singleInputRef} style={{ display: 'none' }} onChange={onSingleFileChange} />
        <input type="file" accept="application/pdf" multiple ref={multipleInputRef} style={{ display: 'none' }} onChange={onMultipleFilesChange} />
      </div>
    </div>
  );
};

export default LandingPage;
