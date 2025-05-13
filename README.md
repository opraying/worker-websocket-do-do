worker-websocket-do-do

To install dependencies:

```bash
pnpm install
```

To run:

```bash
npm dev
```

```bash
❯ pnpm tsx --tsconfig ./test/tsconfig.json ./test/test-client.ts
[21:26:48.796] INFO (#6): echo
  [worker-2-1747142808790] - [worker-1-1747142808791]
[21:26:48.986] INFO (#11): date
  DateTime.Utc(2025-05-13T13:26:48.980Z)
[21:26:49.183] INFO (#11): date
  DateTime.Utc(2025-05-13T13:26:49.181Z)
[21:26:49.386] INFO (#11): date
  DateTime.Utc(2025-05-13T13:26:49.382Z)
[21:26:49.588] INFO (#11): date
  DateTime.Utc(2025-05-13T13:26:49.583Z)
[21:26:49.785] INFO (#11): date
  DateTime.Utc(2025-05-13T13:26:49.783Z)
[21:26:49.801] INFO (#6): echo
  [worker-2-1747142809800] - [worker-1-1747142809800]
[21:26:49.986] INFO (#11): date
  DateTime.Utc(2025-05-13T13:26:49.984Z)
[21:26:50.187] INFO (#11): date
  DateTime.Utc(2025-05-13T13:26:50.185Z)
```

This repository was forked from opraying/workers-starter.
