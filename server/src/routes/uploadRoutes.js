const express = require('express');
const multer = require('multer');
const router = express.Router();

// Keep the file in memory only - never written to disk, discarded after extraction.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB cap
});

// POST /api/upload/pdf
// multipart/form-data with a single field "file"
router.post('/pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'File must be a PDF' });
    }

    // pdfjs-dist is ESM-only, so it's dynamically imported here rather than
    // required at the top of the file. It's Mozilla's own actively-maintained
    // PDF.js library - more reliable with current Node versions than the
    // older pdf-parse package, which failed on valid PDFs during testing.
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(req.file.buffer);
    const doc = await pdfjsLib.getDocument({ data }).promise;

    let text = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item) => item.str).join(' ') + '\n';
    }
    text = text.trim();

    if (!text) {
      return res.status(400).json({ error: 'Could not extract any text from this PDF (it may be scanned images without OCR text).' });
    }

    // Cap length so we don't blow the model's context/token budget with a
    // huge textbook chapter - a few thousand characters is plenty for topic context.
    const capped = text.slice(0, 6000);

    res.json({ text: capped, truncated: text.length > 6000 });
  } catch (err) {
    console.error('[POST /api/upload/pdf]', err.message);
    res.status(500).json({ error: 'Failed to read PDF: ' + err.message });
  }
});

module.exports = router;
