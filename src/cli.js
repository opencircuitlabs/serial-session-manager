#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { encodeFrame, FrameDecoder } from './index.js';

const [command, configFile, input, output] = process.argv.slice(2);
try {
  if (!command || !configFile) throw new Error('Usage: serial-session <encode|decode> framing.json <hex|input.bin> [output.bin]'); const config = JSON.parse(readFileSync(configFile, 'utf8'));
  if (command === 'encode') { const data = encodeFrame(Buffer.from(input ?? '', 'hex'), config); if (output) writeFileSync(output, data); else console.log(data.toString('hex')); }
  else if (command === 'decode') { const decoder = new FrameDecoder(config); const frames = decoder.feed(readFileSync(input)); console.log(JSON.stringify(frames.map((frame) => ({ bytes: frame.length, hex: frame.toString('hex'), utf8: frame.toString('utf8') })), null, 2)); }
  else throw new Error(`Unknown command: ${command}`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
