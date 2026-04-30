const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { log } = require('./logger');

const MMDC_PATH = path.resolve(__dirname, '../../node_modules/.bin/mmdc');
const PUPPETEER_CONFIG = path.resolve(__dirname, '../../puppeteer-config.json');
const MERMAID_THEME = path.resolve(__dirname, '../assets/mermaid-theme.json');
const MERMAID_CSS = path.resolve(__dirname, '../assets/mermaid-styles.css');
const RENDER_TIMEOUT_MS = 60000;

class DiagramRenderer {
  async renderToFile(mermaidSyntax, { timeout = RENDER_TIMEOUT_MS } = {}) {
    const tmpDir = os.tmpdir();
    const inputPath = path.join(tmpDir, `xc-diagram-${Date.now()}.mmd`);
    const outputPath = path.join(tmpDir, `xc-diagram-${Date.now()}.png`);

    fs.writeFileSync(inputPath, mermaidSyntax, 'utf-8');
    log('info', 'Diagram render starting', { inputPath, outputPath, timeout });

    try {
      await new Promise((resolve, reject) => {
        const proc = execFile(
          MMDC_PATH,
          ['-i', inputPath, '-o', outputPath, '-b', 'white', '-s', '2', '-p', PUPPETEER_CONFIG, '-c', MERMAID_THEME, '-C', MERMAID_CSS],
          { timeout },
          (error, stdout, stderr) => {
            if (error) {
              log('error', 'Diagram render failed', { error: error.message, stderr });
              reject(new Error(`Diagram render failed: ${error.message}\n${stderr}`));
            } else {
              log('info', 'Diagram render complete', { outputPath });
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
