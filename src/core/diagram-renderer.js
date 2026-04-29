const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MMDC_PATH = path.resolve(__dirname, '../../node_modules/.bin/mmdc');
const PUPPETEER_CONFIG = path.resolve(__dirname, '../../puppeteer-config.json');
const RENDER_TIMEOUT_MS = 60000;

class DiagramRenderer {
  async renderToFile(mermaidSyntax, { timeout = RENDER_TIMEOUT_MS } = {}) {
    const tmpDir = os.tmpdir();
    const inputPath = path.join(tmpDir, `xc-diagram-${Date.now()}.mmd`);
    const outputPath = path.join(tmpDir, `xc-diagram-${Date.now()}.png`);

    fs.writeFileSync(inputPath, mermaidSyntax, 'utf-8');

    try {
      await new Promise((resolve, reject) => {
        const proc = execFile(
          MMDC_PATH,
          ['-i', inputPath, '-o', outputPath, '-b', 'white', '-s', '2', '-p', PUPPETEER_CONFIG],
          { timeout },
          (error, stdout, stderr) => {
            if (error) {
              reject(new Error(`Diagram render failed: ${error.message}\n${stderr}`));
            } else {
              resolve();
            }
          }
        );
      });
    } finally {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    }

    if (!fs.existsSync(outputPath)) {
      throw new Error('Diagram render produced no output');
    }

    return outputPath;
  }

  cleanup(filePath) {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

module.exports = { DiagramRenderer };
