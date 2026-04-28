const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const { DiagramRenderer } = require('../../src/core/diagram-renderer');

jest.mock('child_process', () => ({
  execFile: jest.fn(),
}));

describe('DiagramRenderer', () => {
  let renderer;

  beforeEach(() => {
    renderer = new DiagramRenderer();
    jest.clearAllMocks();
  });

  test('renderToFile calls mmdc and returns png path', async () => {
    childProcess.execFile.mockImplementation((cmd, args, opts, cb) => {
      const outputPath = args[args.indexOf('-o') + 1];
      fs.writeFileSync(outputPath, 'fake-png-data');
      cb(null, '', '');
      return {};
    });

    const outputPath = await renderer.renderToFile('graph TD\n  A --> B');
    expect(outputPath).toMatch(/\.png$/);
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(childProcess.execFile).toHaveBeenCalledTimes(1);

    const callArgs = childProcess.execFile.mock.calls[0][1];
    expect(callArgs).toContain('-b');
    expect(callArgs).toContain('white');

    fs.unlinkSync(outputPath);
  });

  test('renderToFile rejects when mmdc fails', async () => {
    childProcess.execFile.mockImplementation((cmd, args, opts, cb) => {
      cb(new Error('mmdc crashed'), '', 'some stderr');
      return {};
    });

    await expect(renderer.renderToFile('bad input')).rejects.toThrow('Diagram render failed');
  });

  test('cleanup removes temp file', () => {
    const tmpPath = path.join(require('os').tmpdir(), `test-cleanup-${Date.now()}.png`);
    fs.writeFileSync(tmpPath, 'data');
    expect(fs.existsSync(tmpPath)).toBe(true);
    renderer.cleanup(tmpPath);
    expect(fs.existsSync(tmpPath)).toBe(false);
  });

  test('cleanup is safe on non-existent file', () => {
    expect(() => renderer.cleanup('/tmp/does-not-exist.png')).not.toThrow();
  });

  test('renderToFile cleans up input file', async () => {
    let capturedInputPath;
    childProcess.execFile.mockImplementation((cmd, args, opts, cb) => {
      capturedInputPath = args[args.indexOf('-i') + 1];
      const outputPath = args[args.indexOf('-o') + 1];
      fs.writeFileSync(outputPath, 'fake-png');
      cb(null, '', '');
      return {};
    });

    const outputPath = await renderer.renderToFile('graph TD\n  A --> B');
    expect(fs.existsSync(capturedInputPath)).toBe(false);
    fs.unlinkSync(outputPath);
  });
});
