// FFmpeg Node.js Server with Google Drive Folder Upload, Logging, Graceful Shutdown, and ENV-Based Base64 Key Support
const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { google } = require('googleapis');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());
app.use(cors());

const upload = multer({ dest: 'uploads/' });

// Auto decode base64 service account if available
if (process.env.SERVICE_ACCOUNT_B64) {
  const buffer = Buffer.from(process.env.SERVICE_ACCOUNT_B64, 'base64');
  fs.writeFileSync('./service-account.json', buffer);
}

// Google Drive auth setup
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  scopes: ['https://www.googleapis.com/auth/drive.file']
});
const drive = google.drive({ version: 'v3', auth });
const driveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

// Ensure render dir exists
if (!fs.existsSync('renders')) fs.mkdirSync('renders');

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Endpoint to render video from image + audio
app.post('/render', upload.fields([{ name: 'image' }, { name: 'audio' }]), async (req, res) => {
  try {
    if (!req.files?.image?.[0] || !req.files?.audio?.[0]) {
      return res.status(400).json({ error: 'Missing image or audio file' });
    }

    const image = req.files.image[0];
    const audio = req.files.audio[0];
    const filename = req.body.filename || 'output.mp4';
    const outputPath = path.join('renders', filename);

    const cmd = `ffmpeg -loop 1 -i ${image.path} -i ${audio.path} -shortest -c:v libx264 -pix_fmt yuv420p -tune stillimage -y ${outputPath}`;
    console.log(`Rendering ${filename}...`);

    exec(cmd, { timeout: 120000 }, async (err) => {
      if (err) return res.status(500).json({ error: err.message });

      const fileMetadata = {
        name: filename,
        parents: driveFolderId ? [driveFolderId] : []
      };
      const media = {
        mimeType: 'video/mp4',
        body: fs.createReadStream(outputPath)
      };

      try {
        const driveRes = await drive.files.create({
          resource: fileMetadata,
          media,
          fields: 'id, webViewLink'
        });

        fs.unlinkSync(image.path);
        fs.unlinkSync(audio.path);
        fs.unlinkSync(outputPath);

        const uploadDir = 'uploads';
        const isUploadsEmpty = fs.readdirSync(uploadDir).length === 0;
        if (isUploadsEmpty) fs.rmdirSync(uploadDir);

        res.json({
          message: 'Rendered and uploaded',
          driveLink: driveRes.data.webViewLink
        });
      } catch (uploadErr) {
        res.status(500).json({ error: uploadErr.message });
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Unexpected error' });
  }
});

// Endpoint to concatenate multiple .mp4 clips into one long take
app.post('/concat', async (req, res) => {
  try {
    const list = req.body.concatList;
    const filename = req.body.output || 'long_take.mp4';
    const listPath = 'concat_list.txt';
    const outputPath = path.join('renders', filename);

    fs.writeFileSync(listPath, list);
    const cmd = `ffmpeg -f concat -safe 0 -i ${listPath} -c copy -y ${outputPath}`;
    console.log(`Concatenating into ${filename}...`);

    exec(cmd, { timeout: 180000 }, async (err) => {
      if (err) return res.status(500).json({ error: err.message });

      const fileMetadata = {
        name: filename,
        parents: driveFolderId ? [driveFolderId] : []
      };
      const media = {
        mimeType: 'video/mp4',
        body: fs.createReadStream(outputPath)
      };

      try {
        const driveRes = await drive.files.create({
          resource: fileMetadata,
          media,
          fields: 'id, webViewLink'
        });

        fs.unlinkSync(listPath);
        fs.unlinkSync(outputPath);

        res.json({ message: 'Concatenated and uploaded', driveLink: driveRes.data.webViewLink });
      } catch (uploadErr) {
        res.status(500).json({ error: uploadErr.message });
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Unexpected error' });
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nGracefully shutting down...');
  process.exit();
});

// Health check endpoint
app.get('/ping', (req, res) => {
  res.json({ status: 'ok', message: 'FFmpeg server is alive!' });
});

app.listen(port, () => {
  console.log(`FFmpeg server listening on port ${port}`);
});
