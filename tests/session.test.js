import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { cobsDecode, cobsEncode, encodeFrame, FrameDecoder, MockTransport, SerialSession, slipDecode, slipEncode } from '../src/index.js';

test('COBS round trips zero-rich and 254-byte blocks', () => {
  const input = Buffer.concat([Buffer.from([0,1,0,2]), Buffer.alloc(254, 7), Buffer.from([0])]); assert.deepEqual(cobsDecode(cobsEncode(input)), input); assert.throws(() => cobsDecode(Buffer.from([0])), /zero code/);
});
test('SLIP escapes END and ESC bytes losslessly', () => {
  const input = Buffer.from([1, 0xc0, 2, 0xdb, 3]); assert.deepEqual(slipDecode(slipEncode(input)), input); assert.throws(() => slipDecode(Buffer.from([0xc0,0xdb,0x01,0xc0])), /Invalid SLIP/);
});
test('line decoder handles split chunks and CRLF stripping', () => {
  const decoder = new FrameDecoder({ mode: 'line' }); assert.deepEqual(decoder.feed('hel'), []); assert.deepEqual(decoder.feed('lo\r\nworld\n').map((x) => x.toString()), ['hello','world']);
});
test('delimiter decoder handles binary multi-byte delimiters', () => {
  const decoder = new FrameDecoder({ mode: 'delimiter', delimiter: Buffer.from([0xaa,0x55]) }); const frames = decoder.feed(Buffer.from([1,2,0xaa,0x55,3,0xaa,0x55])); assert.deepEqual(frames.map((x) => [...x]), [[1,2],[3]]);
});
test('length-prefixed decoder supports fragmentation and multiple frames', () => {
  const decoder = new FrameDecoder({ mode: 'length-prefix', lengthBytes: 2, endian: 'little' }); const encoded = Buffer.concat([encodeFrame('abc', { mode: 'length-prefix', lengthBytes: 2, endian: 'little' }), encodeFrame('x', { mode: 'length-prefix', lengthBytes: 2, endian: 'little' })]); assert.deepEqual(decoder.feed(encoded.subarray(0,3)), []); assert.deepEqual(decoder.feed(encoded.subarray(3)).map((x) => x.toString()), ['abc','x']);
});
test('COBS and SLIP stream framing decode multiple packets', () => {
  const cobs = new FrameDecoder({ mode: 'cobs' }); assert.deepEqual(cobs.feed(Buffer.concat([encodeFrame(Buffer.from([1,0,2]), { mode:'cobs' }), encodeFrame(Buffer.from([3]), { mode:'cobs' })])).map((x)=>[...x]), [[1,0,2],[3]]);
  const slip = new FrameDecoder({ mode: 'slip' }); assert.deepEqual(slip.feed(Buffer.concat([slipEncode(Buffer.from([0xc0])), slipEncode(Buffer.from([2]))])).map((x)=>[...x]), [[0xc0],[2]]);
});
test('oversized declared frames fail before allocation', () => {
  const decoder = new FrameDecoder({ mode: 'length-prefix', lengthBytes: 2, maxFrameBytes: 8 }); assert.throws(() => decoder.feed(Buffer.from([0,9])), /exceeds/); assert.equal(decoder.errors[0].declaredBytes, 9);
});
test('session sends framed data and correlates a response', async () => {
  const transport = new MockTransport({ onWrite(data, self) { assert.equal(data.toString(), 'PING\n'); queueMicrotask(() => self.receive('PONG\n')); } }); const session = new SerialSession({ transportFactory: async () => transport, framing: { mode:'line' } }); await session.open(); const frame = await session.request('PING', { match: (data) => data.toString() === 'PONG' }); assert.equal(frame.toString(), 'PONG'); assert.equal(session.pending.size, 0); await session.close();
});
test('request timeout cleans pending state', async () => {
  const transport = new MockTransport(); const session = new SerialSession({ transportFactory: async () => transport, framing: { mode:'line' } }); await session.open(); await assert.rejects(session.request('PING', { timeoutMs: 5 }), /timed out/); assert.equal(session.pending.size, 0); await session.close();
});
test('unmatched frames are emitted as unhandled', async () => {
  const transport = new MockTransport(); const session = new SerialSession({ transportFactory: async () => transport, framing: { mode:'line' } }); await session.open(); const received = once(session, 'frame'); transport.receive('NOTICE\n'); const [frame, info] = await received; assert.equal(frame.toString(), 'NOTICE'); assert.equal(info.handled, false); await session.close();
});
test('transcript records bounded binary-safe TX and RX', async () => {
  const transport = new MockTransport(); const session = new SerialSession({ transportFactory: async () => transport, framing: { mode:'line' }, transcriptLimit: 2 }); await session.open(); await session.send('one'); await session.send('two'); transport.receive('ok\n'); assert.equal(session.getTranscript().length, 2); assert.equal(session.getTranscript()[1].direction, 'rx'); await session.close();
});
test('unexpected disconnect rejects requests and reconnects', async () => {
  const transports = [new MockTransport(), new MockTransport()]; let calls = 0; const session = new SerialSession({ transportFactory: async () => transports[calls++], framing: { mode:'line' }, reconnect: true, reconnectDelayMs: 1, reconnectMaxDelayMs: 2 }); await session.open(); const pending = session.request('wait', { timeoutMs: 100 }); const connectedAgain = new Promise((resolve) => { let seen = 0; session.on('state', (state) => { if (state === 'connected' && ++seen === 1) resolve(); }); }); transports[0].disconnect(); await assert.rejects(pending, /disconnected/); await connectedAgain; assert.equal(calls, 2); await session.close();
});
test('closing a session rejects outstanding work and prevents writes', async () => {
  const transport = new MockTransport(); const session = new SerialSession({ transportFactory: async () => transport, framing: { mode:'line' } }); await session.open(); const pending = session.request('wait', { timeoutMs: 100 }); await session.close(); await assert.rejects(pending, /closed/); await assert.rejects(session.send('x'), /not connected/);
});
