import os
from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
from pdf2docx import Converter
import tempfile

app = Flask(__name__)
CORS(app)

@app.route('/api/convert-to-word', methods=['POST'])
def convert_to_word():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
        
    if file:
        # Create temp files for pdf and docx
        temp_dir = tempfile.gettempdir()
        pdf_path = os.path.join(temp_dir, 'uploaded.pdf')
        docx_path = os.path.join(temp_dir, 'converted.docx')
        
        try:
            # Save the uploaded PDF
            file.save(pdf_path)
            
            # Convert PDF to DOCX using the free pdf2docx library
            cv = Converter(pdf_path)
            cv.convert(docx_path, start=0, end=None)
            cv.close()
            
            # Send the converted DOCX file back to the browser
            return send_file(docx_path, as_attachment=True, download_name="Converted_Document.docx")
            
        except Exception as e:
            return jsonify({"error": str(e)}), 500
            
if __name__ == '__main__':
    # Run the server on port 5000
    app.run(port=5000, debug=True)
