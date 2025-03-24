const express = require('express');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const app = express();
app.use(express.json());

// Serve static files from the "public" folder
app.use(express.static('public'));

// Function to sanitize the URL and create a valid filename
function getFilenameFromUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    const sanitized = hostname.replace(/[^a-zA-Z0-9]/g, '_');
    return sanitized.substring(0, 50);
  } catch (error) {
    console.error(`Invalid URL: ${url}`, error.message);
    return `screenshot_${Date.now()}`;
  }
}

// Launch a persistent browser instance
let browser;
(async () => {
  browser = await puppeteer.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', // Update this path
    headless: 'new', // Use the new headless mode for faster performance
  });
  console.log('Browser launched successfully.');
})();

// Endpoint to capture screenshots
app.post('/capture', async (req, res) => {
  const { links, format, width, height, pdfOption } = req.body;
  const screenshotDir = path.join(__dirname, 'screenshots');

  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir);
  }

  const downloadUrls = [];

  try {
    if (format === 'pdf' && pdfOption === 'single') {
      // Create a single PDF for all links
      const pdfDoc = new PDFDocument();
      const pdfFilename = `screenshots_${Date.now()}.pdf`;
      const pdfPath = path.join(screenshotDir, pdfFilename);
      pdfDoc.pipe(fs.createWriteStream(pdfPath));

      for (const link of links) {
        const page = await browser.newPage();

        // Set viewport dimensions if provided
        if (width && height) {
          await page.setViewport({ width: parseInt(width), height: parseInt(height) });
        } else {
          await page.setViewport({ width: 1280, height: 1024 });
        }

        console.log(`Navigating to: ${link}`);
        await page.goto(link, {
          waitUntil: 'networkidle2', // Wait for the page to fully load
          timeout: 60000, // 60 seconds timeout
        });

        // Capture screenshot as PNG and add to PDF
        const screenshotBuffer = await page.screenshot({ fullPage: true, type: 'png' });
        pdfDoc.image(screenshotBuffer, { fit: [500, 700] });
        pdfDoc.addPage();

        await page.close();
      }

      pdfDoc.end();
      downloadUrls.push({ url: `/download/${pdfFilename}`, filename: pdfFilename });
    } else {
      // Capture individual screenshots
      for (const link of links) {
        const page = await browser.newPage();

        // Set viewport dimensions if provided
        if (width && height) {
          await page.setViewport({ width: parseInt(width), height: parseInt(height) });
        } else {
          await page.setViewport({ width: 1280, height: 1024 });
        }

        console.log(`Navigating to: ${link}`);
        await page.goto(link, {
          waitUntil: 'networkidle2', // Wait for the page to fully load
          timeout: 60000, // 60 seconds timeout
        });

        const filename = `${getFilenameFromUrl(link)}.${format}`;
        const screenshotPath = path.join(screenshotDir, filename);

        console.log(`Capturing screenshot: ${filename}`);
        if (format === 'pdf') {
          await page.pdf({ path: screenshotPath, format: 'A4' });
        } else {
          await page.screenshot({
            path: screenshotPath,
            fullPage: true, // Capture full page
            type: format,
            quality: format === 'jpeg' ? 80 : undefined, // Compress JPEG images (80% quality)
          });
        }

        await page.close();
        downloadUrls.push({ url: `/download/${filename}`, filename: filename });
      }
    }

    res.json({ downloadUrls });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to capture screenshots.' });
  }
});

// Endpoint to download screenshots
app.get('/download/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'screenshots', req.params.filename);

  if (fs.existsSync(filePath)) {
    res.download(filePath, req.params.filename, () => {
      fs.unlinkSync(filePath); // Delete the file after download
    });
  } else {
    res.status(404).send('File not found.');
  }
});

// Start the server
app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});