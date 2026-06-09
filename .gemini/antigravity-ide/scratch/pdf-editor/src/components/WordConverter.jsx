import React, { useState } from 'react';

const WordConverter = ({ file }) => {
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState(null);

  const handleConvert = async () => {
    setIsConverting(true);
    setError(null);
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      // Send the file to our local Python microservice!
      const response = await fetch('http://localhost:5000/api/convert-to-word', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Conversion failed. Is the Python server running in your terminal?');
      }
      
      // Receive the DOCX file and trigger a download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name.replace('.pdf', '.docx');
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: '80vh', backgroundColor: '#f8fafc' }}>
      <div style={{ backgroundColor: 'white', padding: '40px', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', textAlign: 'center', maxWidth: '500px' }}>
        <h2 style={{ color: '#1e293b', marginBottom: '20px' }}>Word Document Converter</h2>
        <p style={{ color: '#64748b', marginBottom: '30px', lineHeight: '1.6' }}>
          Your file <strong>{file.name}</strong> is ready to be converted.
        </p>
        
        {error && <p style={{ color: '#ef4444', marginBottom: '20px', fontWeight: 'bold' }}>Error: {error}</p>}
        
        <button 
          onClick={handleConvert}
          disabled={isConverting}
          style={{
            backgroundColor: isConverting ? '#94a3b8' : '#2563eb',
            color: 'white',
            padding: '16px 32px',
            border: 'none',
            borderRadius: '6px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: isConverting ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }}
        >
          {isConverting ? 'Converting... Please wait' : 'Convert to .docx & Download'}
        </button>
      </div>
    </div>
  );
};

export default WordConverter;
