import React, { useState, useEffect, useRef, useCallback } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import './InvoiceGenerator.css';

// Promise-based IndexedDB utility for large client-side drafts storage
const DB_NAME = 'InvoiceDraftsDB';
const STORE_NAME = 'drafts';

const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
};

const getDraftsFromDB = async () => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const sorted = (request.result || []).sort((a, b) => b.timestamp - a.timestamp);
        resolve(sorted);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('getDraftsFromDB error:', err);
    return [];
  }
};

const saveDraftToDB = async (draft) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(draft);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const deleteDraftFromDB = async (id) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const TEMPLATES = [
  { id: 'indigo', name: 'Indigo', color: '#4f46e5' },
  { id: 'emerald', name: 'Emerald', color: '#059669' },
  { id: 'sunset', name: 'Sunset', color: '#f97316' },
  { id: 'rose', name: 'Rose', color: '#e11d48' },
];

const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
];

const emptyItem = () => ({ id: Date.now(), description: '', qty: 1, rate: 0 });

// Custom section helpers
const emptyTextSection = () => ({ id: Date.now(), type: 'text', title: '', content: '' });
const emptyTableSection = () => ({
  id: Date.now() + 1,
  type: 'table',
  title: '',
  columns: ['Column 1', 'Column 2', 'Column 3'],
  rows: [['', '', '']],
});

const InvoiceGenerator = ({ onGoHome }) => {
  // Template
  const [template, setTemplate] = useState('indigo');
  const [currency, setCurrency] = useState('USD');

  // Company / Sender
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [companyGst, setCompanyGst] = useState('');
  const [logo, setLogo] = useState(null);

  // Client / Receiver
  const [clientName, setClientName] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientGst, setClientGst] = useState('');

  // Invoice details
  const [invoiceNumber, setInvoiceNumber] = useState('INV-001');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');

  // Line items
  const [items, setItems] = useState([emptyItem()]);

  // Tax & Discount
  const [taxRate, setTaxRate] = useState(0);
  const [discount, setDiscount] = useState(0);

  // Notes (optional - empty by default)
  const [notes, setNotes] = useState('');

  // Custom sections
  const [customSections, setCustomSections] = useState([]);

  // UI State
  const [isDownloading, setIsDownloading] = useState(false);
  const [showToast, setShowToast] = useState(false);

  // Drafts State
  const [selectedDraftId, setSelectedDraftId] = useState('');
  const [drafts, setDrafts] = useState([]);

  useEffect(() => {
    const loadAndMigrate = async () => {
      try {
        let dbDrafts = await getDraftsFromDB();
        
        // Migrate legacy drafts from localStorage if present
        const legacy = localStorage.getItem('invoice_drafts');
        if (legacy) {
          try {
            const parsed = JSON.parse(legacy);
            if (Array.isArray(parsed) && parsed.length > 0) {
              for (const draft of parsed) {
                if (draft && draft.id) {
                  await saveDraftToDB(draft);
                }
              }
              dbDrafts = await getDraftsFromDB();
              localStorage.removeItem('invoice_drafts');
            }
          } catch (err) {
            console.error('Failed to migrate legacy drafts:', err);
          }
        }
        setDrafts(dbDrafts);
      } catch (err) {
        console.error('Failed to load drafts:', err);
      }
    };
    loadAndMigrate();
  }, []);

  const sheetRef = useRef(null);
  const logoInputRef = useRef(null);

  const currencySymbol = CURRENCIES.find(c => c.code === currency)?.symbol || '$';

  // --- Item Handlers ---
  const updateItem = (id, field, value) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const addItem = () => setItems(prev => [...prev, emptyItem()]);

  const removeItem = (id) => {
    if (items.length === 1) return;
    setItems(prev => prev.filter(item => item.id !== id));
  };

  // --- Logo Handler ---
  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setLogo(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // --- Draft Handlers ---
  const handleSaveDraft = async () => {
    const draftId = invoiceNumber || 'Draft_' + Date.now();
    const newDraft = {
      id: draftId,
      invoiceNumber,
      invoiceDate,
      dueDate,
      currency,
      template,
      companyName,
      companyAddress,
      companyEmail,
      companyGst,
      logo,
      clientName,
      clientAddress,
      clientEmail,
      clientGst,
      items,
      taxRate,
      discount,
      notes,
      customSections,
      timestamp: Date.now()
    };

    try {
      await saveDraftToDB(newDraft);
      const updated = await getDraftsFromDB();
      setDrafts(updated);
      setSelectedDraftId(draftId);
      alert('Draft saved successfully to browser DB!');
    } catch (err) {
      console.error('Failed to save draft to IndexedDB:', err);
      alert('Error saving draft: ' + err.message);
    }
  };

  const handleLoadDraft = (draftId) => {
    const draft = drafts.find(d => d.id === draftId);
    if (!draft) return;
    setInvoiceNumber(draft.invoiceNumber || '');
    setInvoiceDate(draft.invoiceDate || '');
    setDueDate(draft.dueDate || '');
    setCurrency(draft.currency || 'USD');
    setTemplate(draft.template || 'indigo');
    setCompanyName(draft.companyName || '');
    setCompanyAddress(draft.companyAddress || '');
    setCompanyEmail(draft.companyEmail || '');
    setCompanyGst(draft.companyGst || '');
    setLogo(draft.logo || null);
    setClientName(draft.clientName || '');
    setClientAddress(draft.clientAddress || '');
    setClientEmail(draft.clientEmail || '');
    setClientGst(draft.clientGst || '');
    setItems(draft.items || [emptyItem()]);
    setTaxRate(draft.taxRate || 0);
    setDiscount(draft.discount || 0);
    setNotes(draft.notes || '');
    setCustomSections(draft.customSections || []);
  };

  const handleDeleteDraft = async (draftId) => {
    if (!draftId) return;
    if (!confirm('Are you sure you want to delete this draft?')) return;
    try {
      await deleteDraftFromDB(draftId);
      const updated = await getDraftsFromDB();
      setDrafts(updated);
      setSelectedDraftId('');
      alert('Draft deleted successfully.');
    } catch (err) {
      console.error('Failed to delete draft from IndexedDB:', err);
      alert('Error deleting draft: ' + err.message);
    }
  };

  const handleExportJSON = () => {
    const data = {
      invoiceNumber,
      invoiceDate,
      dueDate,
      currency,
      template,
      companyName,
      companyAddress,
      companyEmail,
      companyGst,
      logo,
      clientName,
      clientAddress,
      clientEmail,
      clientGst,
      items,
      taxRate,
      discount,
      notes,
      customSections,
    };
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', `Invoice_${invoiceNumber || 'draft'}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportJSON = (e) => {
    const fileReader = new FileReader();
    const file = e.target.files[0];
    if (!file) return;

    fileReader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (parsed.items && Array.isArray(parsed.items)) {
          setInvoiceNumber(parsed.invoiceNumber || '');
          setInvoiceDate(parsed.invoiceDate || new Date().toISOString().slice(0, 10));
          setDueDate(parsed.dueDate || '');
          setCurrency(parsed.currency || 'USD');
          setTemplate(parsed.template || 'indigo');
          setCompanyName(parsed.companyName || '');
          setCompanyAddress(parsed.companyAddress || '');
          setCompanyEmail(parsed.companyEmail || '');
          setCompanyGst(parsed.companyGst || '');
          setLogo(parsed.logo || null);
          setClientName(parsed.clientName || '');
          setClientAddress(parsed.clientAddress || '');
          setClientEmail(parsed.clientEmail || '');
          setClientGst(parsed.clientGst || '');
          setItems(parsed.items);
          setTaxRate(parsed.taxRate || 0);
          setDiscount(parsed.discount || 0);
          setNotes(parsed.notes || '');
          setCustomSections(parsed.customSections || []);
          alert('Invoice imported successfully!');
        } else {
          alert('Invalid invoice template format.');
        }
      } catch (err) {
        alert('Failed to parse file: ' + err.message);
      }
    };
    fileReader.readAsText(file);
    e.target.value = '';
  };


  // --- Custom Section Handlers ---
  const addCustomSection = (type) => {
    if (type === 'text') setCustomSections(prev => [...prev, emptyTextSection()]);
    else setCustomSections(prev => [...prev, emptyTableSection()]);
  };

  const removeCustomSection = (id) => {
    setCustomSections(prev => prev.filter(s => s.id !== id));
  };

  const updateCustomSection = (id, field, value) => {
    setCustomSections(prev => prev.map(s =>
      s.id === id ? { ...s, [field]: value } : s
    ));
  };

  const updateTableColumn = (sectionId, colIdx, value) => {
    setCustomSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const newCols = [...s.columns];
      newCols[colIdx] = value;
      return { ...s, columns: newCols };
    }));
  };

  const updateTableCell = (sectionId, rowIdx, colIdx, value) => {
    setCustomSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const newRows = s.rows.map(r => [...r]);
      newRows[rowIdx][colIdx] = value;
      return { ...s, rows: newRows };
    }));
  };

  const addTableRow = (sectionId) => {
    setCustomSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      return { ...s, rows: [...s.rows, Array(s.columns.length).fill('')] };
    }));
  };

  const removeTableRow = (sectionId, rowIdx) => {
    setCustomSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      if (s.rows.length <= 1) return s;
      return { ...s, rows: s.rows.filter((_, i) => i !== rowIdx) };
    }));
  };

  const addTableColumn = (sectionId) => {
    setCustomSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      return {
        ...s,
        columns: [...s.columns, `Column ${s.columns.length + 1}`],
        rows: s.rows.map(r => [...r, '']),
      };
    }));
  };

  const removeTableColumn = (sectionId, colIdx) => {
    setCustomSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      if (s.columns.length <= 1) return s;
      return {
        ...s,
        columns: s.columns.filter((_, i) => i !== colIdx),
        rows: s.rows.map(r => r.filter((_, i) => i !== colIdx)),
      };
    }));
  };

  // --- Calculations ---
  const subtotal = items.reduce((sum, item) => sum + (Number(item.qty) * Number(item.rate)), 0);
  const taxAmount = (subtotal * Number(taxRate)) / 100;
  const afterTax = subtotal + taxAmount;
  const discountAmount = (afterTax * Number(discount)) / 100;
  const grandTotal = afterTax - discountAmount;

  const formatCurrency = useCallback((amount) => {
    return `${currencySymbol}${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, [currencySymbol]);

  // --- PDF Download (fixed to always output .pdf) ---
  const handleDownload = async () => {
    if (!sheetRef.current) return;
    setIsDownloading(true);

    try {
      const canvas = await html2canvas(sheetRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      // If content exceeds one page, split across multiple pages
      if (imgHeight > pageHeight) {
        let yOffset = 0;
        const totalPages = Math.ceil(imgHeight / pageHeight);
        for (let i = 0; i < totalPages; i++) {
          if (i > 0) pdf.addPage();
          pdf.addImage(imgData, 'PNG', 0, -yOffset, imgWidth, imgHeight);
          yOffset += pageHeight;
        }
      } else {
        pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      }

      const filename = invoiceNumber
        ? `${invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`
        : 'invoice.pdf';

      // Use blob to force .pdf download
      const pdfBlob = pdf.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (err) {
      console.error('PDF generation failed:', err);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="invoice-container">
      {/* ===== LEFT: Form Panel ===== */}
      <div className="invoice-form-panel">
        <div className="invoice-form-header">
          <h2>Invoice Generator</h2>
          <p>Create beautiful, professional invoices in seconds.</p>
        </div>

        <div className="invoice-form-scroll">
          {/* Saved Drafts */}
          <div className="form-section" style={{ borderBottom: '1px dashed var(--glass-border)', paddingBottom: '20px' }}>
            <div className="form-section-title">Saved Drafts</div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <select
                className="drafts-select"
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--glass-border)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  outline: 'none'
                }}
                value={selectedDraftId}
                onChange={e => { setSelectedDraftId(e.target.value); handleLoadDraft(e.target.value); }}
              >
                <option value="" disabled>Select a saved draft...</option>
                {drafts.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.invoiceNumber || 'No Number'} - {d.companyName || 'No Company'} ({new Date(d.timestamp).toLocaleDateString()})
                  </option>
                ))}
              </select>
              {selectedDraftId && (
                <button
                  onClick={() => handleDeleteDraft(selectedDraftId)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #ef4444',
                    background: 'transparent',
                    color: '#ef4444',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '13px',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => {
                    e.target.style.background = 'rgba(239, 68, 68, 0.08)';
                  }}
                  onMouseLeave={e => {
                    e.target.style.background = 'transparent';
                  }}
                >
                  Delete
                </button>
              )}
            </div>
            <button
              onClick={handleSaveDraft}
              style={{
                width: '100%',
                padding: '11px',
                borderRadius: '8px',
                border: '1px solid var(--brand-primary)',
                background: 'rgba(99, 102, 241, 0.08)',
                color: 'var(--brand-primary)',
                fontWeight: '700',
                cursor: 'pointer',
                fontSize: '13px',
                transition: 'all 0.2s',
                fontFamily: "'Inter', sans-serif"
              }}
              onMouseEnter={e => {
                e.target.style.background = 'rgba(99, 102, 241, 0.15)';
              }}
              onMouseLeave={e => {
                e.target.style.background = 'rgba(99, 102, 241, 0.08)';
              }}
            >
              💾 Save Current as Draft
            </button>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button
                onClick={handleExportJSON}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid var(--glass-border)',
                  background: 'var(--card-bg)',
                  color: 'var(--text-primary)',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontFamily: "'Inter', sans-serif"
                }}
              >
                📤 Export JSON
              </button>
              <label
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid var(--glass-border)',
                  background: 'var(--card-bg)',
                  color: 'var(--text-primary)',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontSize: '12px',
                  textAlign: 'center',
                  fontFamily: "'Inter', sans-serif",
                  boxSizing: 'border-box'
                }}
              >
                📥 Import JSON
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportJSON}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>

          {/* Template Selector */}
          <div className="form-section">
            <div className="form-section-title">Template Color</div>
            <div className="color-picker-row">
              {TEMPLATES.map(t => (
                <div
                  key={t.id}
                  className={`color-swatch swatch-${t.id} ${template === t.id ? 'active' : ''}`}
                  title={t.name}
                  onClick={() => setTemplate(t.id)}
                />
              ))}
            </div>
          </div>

          {/* Currency */}
          <div className="form-section">
            <div className="form-section-title">Currency</div>
            <select
              className="currency-select"
              value={currency}
              onChange={e => setCurrency(e.target.value)}
            >
              {CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>{c.symbol} — {c.name} ({c.code})</option>
              ))}
            </select>
          </div>

          {/* Your Company */}
          <div className="form-section">
            <div className="form-section-title">Your Company</div>
            <div className="logo-upload-area">
              <div className="logo-upload-btn" onClick={() => logoInputRef.current?.click()}>
                {logo ? <img src={logo} alt="Logo" /> : <span style={{ fontSize: 24, color: 'var(--text-secondary)' }}>+</span>}
              </div>
              <input type="file" accept="image/*" ref={logoInputRef} style={{ display: 'none' }} onChange={handleLogoUpload} />
              <div className="logo-upload-text">
                <span onClick={() => logoInputRef.current?.click()}>Upload logo</span><br />
                PNG, JPG up to 2MB
              </div>
            </div>
            <div className="form-row" style={{ marginTop: 14 }}>
              <div className="form-group">
                <label>Company Name</label>
                <input type="text" placeholder="Acme Corp" value={companyName} onChange={e => setCompanyName(e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Email</label>
                <input type="email" placeholder="billing@acme.com" value={companyEmail} onChange={e => setCompanyEmail(e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>GST Number <span className="optional-label">(Optional)</span></label>
                <input type="text" placeholder="e.g. 22AAAAA0000A1Z5" value={companyGst} onChange={e => setCompanyGst(e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Address</label>
                <textarea placeholder={"123 Main Street\nNew York, NY 10001"} value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Client / Bill To */}
          <div className="form-section">
            <div className="form-section-title">Bill To</div>
            <div className="form-row">
              <div className="form-group">
                <label>Client Name</label>
                <input type="text" placeholder="Jane Smith" value={clientName} onChange={e => setClientName(e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Client Email</label>
                <input type="email" placeholder="jane@example.com" value={clientEmail} onChange={e => setClientEmail(e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Client GST Number <span className="optional-label">(Optional)</span></label>
                <input type="text" placeholder="e.g. 29BBBBB0000B1Z6" value={clientGst} onChange={e => setClientGst(e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Client Address</label>
                <textarea placeholder={"456 Oak Avenue\nLos Angeles, CA 90001"} value={clientAddress} onChange={e => setClientAddress(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Invoice Details */}
          <div className="form-section">
            <div className="form-section-title">Invoice Details</div>
            <div className="form-row">
              <div className="form-group">
                <label>Invoice Number</label>
                <input type="text" placeholder="INV-001" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Issue Date</label>
                <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Due Date</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="form-section">
            <div className="form-section-title">Line Items</div>
            <div className="line-items-header">
              <span className="lih-desc">Description</span>
              <span className="lih-qty">Qty</span>
              <span className="lih-rate">Rate</span>
              <span className="lih-amount">Amount</span>
              <span className="lih-action"></span>
            </div>
            {items.map(item => (
              <div key={item.id} className="line-item-row">
                <input
                  className="li-desc"
                  type="text"
                  placeholder="Service or product"
                  value={item.description}
                  onChange={e => updateItem(item.id, 'description', e.target.value)}
                />
                <input
                  className="li-qty"
                  type="number"
                  min="0"
                  value={item.qty}
                  onChange={e => updateItem(item.id, 'qty', e.target.value)}
                />
                <input
                  className="li-rate"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={item.rate}
                  onChange={e => updateItem(item.id, 'rate', e.target.value)}
                />
                <span className="li-amount">
                  {formatCurrency(Number(item.qty) * Number(item.rate))}
                </span>
                <button
                  className="li-remove-btn"
                  onClick={() => removeItem(item.id)}
                  title="Remove item"
                >
                  ×
                </button>
              </div>
            ))}
            <button className="add-item-btn" onClick={addItem}>
              + Add Line Item
            </button>
          </div>

          {/* Tax & Discount */}
          <div className="form-section">
            <div className="form-section-title">Tax & Discount</div>
            <div className="tax-discount-row">
              <div className="form-group">
                <label>Tax Rate (%)</label>
                <input type="number" min="0" max="100" step="0.5" value={taxRate} onChange={e => setTaxRate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Discount (%)</label>
                <input type="number" min="0" max="100" step="0.5" value={discount} onChange={e => setDiscount(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Notes (Optional) */}
          <div className="form-section">
            <div className="form-section-title">Notes / Terms <span className="optional-label">(Optional)</span></div>
            <div className="form-group">
              <textarea
                placeholder="Payment terms, bank details, etc."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          {/* Custom Sections Editor */}
          <div className="form-section">
            <div className="form-section-title">Custom Sections <span className="optional-label">(Optional)</span></div>
            <p className="custom-sections-desc">Add extra content blocks to your invoice — text paragraphs or custom tables.</p>

            {customSections.map((section, idx) => (
              <div key={section.id} className="custom-section-card">
                <div className="custom-section-header">
                  <span className="custom-section-type-badge">{section.type === 'text' ? '📝 Text' : '📊 Table'}</span>
                  <button className="li-remove-btn" onClick={() => removeCustomSection(section.id)} title="Remove section">×</button>
                </div>
                <div className="form-group" style={{ marginBottom: 10 }}>
                  <label>Section Title</label>
                  <input type="text" placeholder="e.g. Payment Details, Terms & Conditions" value={section.title} onChange={e => updateCustomSection(section.id, 'title', e.target.value)} />
                </div>

                {section.type === 'text' && (
                  <div className="form-group">
                    <label>Content</label>
                    <textarea
                      placeholder="Write your content here..."
                      value={section.content}
                      onChange={e => updateCustomSection(section.id, 'content', e.target.value)}
                      rows={4}
                    />
                  </div>
                )}

                {section.type === 'table' && (
                  <div className="custom-table-editor">
                    {/* Column headers */}
                    <div className="custom-table-header-row">
                      {section.columns.map((col, colIdx) => (
                        <div key={colIdx} className="custom-table-col-header">
                          <input
                            type="text"
                            value={col}
                            onChange={e => updateTableColumn(section.id, colIdx, e.target.value)}
                            className="custom-table-col-input"
                          />
                          {section.columns.length > 1 && (
                            <button className="custom-table-col-remove" onClick={() => removeTableColumn(section.id, colIdx)} title="Remove column">×</button>
                          )}
                        </div>
                      ))}
                      <button className="custom-table-add-col" onClick={() => addTableColumn(section.id)} title="Add column">+</button>
                    </div>
                    {/* Rows */}
                    {section.rows.map((row, rowIdx) => (
                      <div key={rowIdx} className="custom-table-data-row">
                        {row.map((cell, colIdx) => (
                          <input
                            key={colIdx}
                            type="text"
                            value={cell}
                            onChange={e => updateTableCell(section.id, rowIdx, colIdx, e.target.value)}
                            placeholder="—"
                            className="custom-table-cell"
                          />
                        ))}
                        {section.rows.length > 1 && (
                          <button className="li-remove-btn custom-table-row-remove" onClick={() => removeTableRow(section.id, rowIdx)} title="Remove row">×</button>
                        )}
                      </div>
                    ))}
                    <button className="add-item-btn" style={{ marginTop: 6 }} onClick={() => addTableRow(section.id)}>+ Add Row</button>
                  </div>
                )}
              </div>
            ))}

            <div className="custom-section-actions">
              <button className="add-item-btn" onClick={() => addCustomSection('text')}>+ Add Text Block</button>
              <button className="add-item-btn" onClick={() => addCustomSection('table')}>+ Add Custom Table</button>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="form-actions">
          {onGoHome && (
            <button className="action-btn" onClick={onGoHome}>
              ← Home
            </button>
          )}
          <button
            className={`download-btn ${isDownloading ? 'downloading' : ''}`}
            onClick={handleDownload}
          >
            {isDownloading ? '⏳ Generating...' : '📄 Download PDF'}
          </button>
        </div>
      </div>

      {/* ===== RIGHT: Live Preview ===== */}
      <div className="invoice-preview-panel">
        <div className="invoice-sheet" ref={sheetRef}>
          {/* Accent bar */}
          <div className={`invoice-accent-bar accent-${template}`} />

          {/* Header */}
          <div className="invoice-header">
            <div className="invoice-brand">
              {logo && <img src={logo} alt="Company Logo" className="invoice-logo" />}
              <div>
                <span className="invoice-company-name">{companyName || 'Your Company'}</span>
                {companyGst && <div className="invoice-gst-label">GST: {companyGst}</div>}
              </div>
            </div>
            <div className="invoice-title-block">
              <div className={`invoice-title-label color-${template}`}>INVOICE</div>
              <div className="invoice-number">{invoiceNumber || 'INV-001'}</div>
            </div>
          </div>

          {/* Info Grid */}
          <div className="invoice-info-grid">
            <div className="invoice-info-block">
              <h4>From</h4>
              <p className="info-name">{companyName || 'Company Name'}</p>
              {companyEmail && <p>{companyEmail}</p>}
              {companyGst && <p><strong>GST:</strong> {companyGst}</p>}
              {companyAddress && <p style={{ whiteSpace: 'pre-line' }}>{companyAddress}</p>}
            </div>
            <div className="invoice-info-block">
              <h4>Bill To</h4>
              <p className="info-name">{clientName || 'Client Name'}</p>
              {clientEmail && <p>{clientEmail}</p>}
              {clientGst && <p><strong>GST:</strong> {clientGst}</p>}
              {clientAddress && <p style={{ whiteSpace: 'pre-line' }}>{clientAddress}</p>}
            </div>
            <div className="invoice-info-block">
              <h4>Details</h4>
              <p><strong>Date:</strong> {invoiceDate || '—'}</p>
              {dueDate && <p><strong>Due:</strong> {dueDate}</p>}
              <p><strong>Currency:</strong> {currency}</p>
            </div>
          </div>

          {/* Line Items Table */}
          <table className="invoice-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Qty</th>
                <th>Rate</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  <td>{item.description || '—'}</td>
                  <td>{item.qty}</td>
                  <td>{formatCurrency(Number(item.rate))}</td>
                  <td>{formatCurrency(Number(item.qty) * Number(item.rate))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals — Tax first, then Discount */}
          <div className="invoice-totals">
            <div className="totals-box">
              <div className="totals-row">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {Number(taxRate) > 0 && (
                <div className="totals-row">
                  <span>Tax ({taxRate}%)</span>
                  <span>+{formatCurrency(taxAmount)}</span>
                </div>
              )}
              {Number(discount) > 0 && (
                <div className="totals-row">
                  <span>Discount ({discount}%)</span>
                  <span>-{formatCurrency(discountAmount)}</span>
                </div>
              )}
              <div className="totals-row grand-total">
                <span>Total</span>
                <span>{formatCurrency(grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* Custom Sections rendered on the invoice */}
          {customSections.map(section => (
            <div key={section.id} className="invoice-custom-section">
              {section.title && <h4 className="invoice-custom-section-title">{section.title}</h4>}
              {section.type === 'text' && section.content && (
                <p className="invoice-custom-section-text">{section.content}</p>
              )}
              {section.type === 'table' && (
                <table className="invoice-custom-table">
                  <thead>
                    <tr>
                      {section.columns.map((col, i) => <th key={i}>{col}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map((row, rIdx) => (
                      <tr key={rIdx}>
                        {row.map((cell, cIdx) => <td key={cIdx}>{cell || '—'}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}

          {/* Notes (only shown if user typed something) */}
          {notes && (
            <div className="invoice-notes">
              <h4>Notes</h4>
              <p>{notes}</p>
            </div>
          )}

          {/* No watermark / footer */}
        </div>
      </div>

      {/* Toast */}
      {showToast && (
        <div className="download-toast">
          ✅ Invoice downloaded successfully!
        </div>
      )}
    </div>
  );
};

export default InvoiceGenerator;
