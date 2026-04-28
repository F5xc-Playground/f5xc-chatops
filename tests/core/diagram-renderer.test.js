const fs = require('fs');
const path = require('path');
const { DiagramRenderer } = require('../../src/core/diagram-renderer');

describe('DiagramRenderer', () => {
  const renderer = new DiagramRenderer();

  test('renderToFile generates a PNG from mermaid syntax', async () => {
    const mermaid = `graph TD
      A[User] --> B[Load Balancer]
      B --> C[Origin Pool]
    `;
    const outputPath = await renderer.renderToFile(mermaid);
    expect(outputPath).toMatch(/\.png$/);
    expect(fs.existsSync(outputPath)).toBe(true);
    const stats = fs.statSync(outputPath);
    expect(stats.size).toBeGreaterThan(0);
    fs.unlinkSync(outputPath);
  }, 30000);

  test('renderToFile rejects on invalid mermaid', async () => {
    await expect(renderer.renderToFile('not valid mermaid {{{')).rejects.toThrow();
  }, 30000);

  test('cleanup removes temp file', async () => {
    const mermaid = `graph TD\n  A --> B`;
    const outputPath = await renderer.renderToFile(mermaid);
    expect(fs.existsSync(outputPath)).toBe(true);
    renderer.cleanup(outputPath);
    expect(fs.existsSync(outputPath)).toBe(false);
  }, 30000);
});
