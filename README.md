# Serial Session Manager

Binary-safe framing and resilient request/response sessions for embedded serial links.

The package separates byte transport from protocol framing. It works with Web Serial bridges, native serial adapters, TCP tunnels, test fixtures, or the included mock transport without binding the core to a platform-specific serial dependency.

## Quick start

```bash
npm install
npm test
node src/cli.js encode examples/cobs-framing.json 010002
node src/cli.js decode examples/line-framing.json serial-capture.bin
```

```js
import { SerialSession } from '@opencircuitlabs/serial-session-manager';

const session = new SerialSession({
  transportFactory: () => createPlatformTransport('/dev/ttyACM0'),
  framing: { mode: 'line', maxFrameBytes: 4096 },
  requestTimeoutMs: 1000,
  reconnect: true
});

await session.open();
const response = await session.request('status', {
  match: (frame) => frame.toString().startsWith('STATUS ')
});
```

## Framing modes

- Line framing with configurable delimiters and optional CR stripping.
- Arbitrary binary single- or multi-byte delimiters.
- 1-, 2-, or 4-byte length prefixes in big- or little-endian order.
- Consistent Overhead Byte Stuffing (COBS) with zero delimiters.
- RFC 1055-style SLIP with END and ESC escaping.

Decoders accept arbitrarily fragmented chunks and return zero or more complete frames. Declared and buffered sizes are bounded before expansion. Malformed COBS/SLIP escapes, impossible lengths, and overflow are surfaced explicitly instead of being silently discarded.

## Session behavior

`SerialSession` provides:

- explicit `idle`, `connecting`, `connected`, `disconnected`, and `closed` states;
- framed writes and bounded outstanding request count;
- first-match response correlation with per-request timeout;
- unhandled-frame events for notifications and telemetry;
- rejection and cleanup of pending requests on disconnect or close;
- exponential reconnect delays with a configurable ceiling;
- bounded binary-safe TX/RX transcript records.

The transport contract is deliberately small: optional `open`, required `write`, optional `close`, and EventEmitter-compatible `data`, `close`, and `error` events. Abort and authorization policy remain with the host adapter.

## Testing

`MockTransport` captures writes, injects incoming bytes, simulates disconnects, and can respond inside an `onWrite` hook. It enables deterministic protocol and reconnect tests without serial hardware.

## License

MIT
