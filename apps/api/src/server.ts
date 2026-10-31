import { getExtractionProvider } from './adapters/extraction.js';
import { createApp } from './app.js';
import { InMemoryStore } from './store.js';

const secret = process.env.JWT_SECRET;
if (!secret && process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET is required in production');

const app = createApp({
  store: new InMemoryStore(), // TODO: swap for Prisma-backed store (see README status)
  provider: getExtractionProvider(),
  jwtSecret: secret ?? 'dev-only-secret',
});
const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`API listening on :${port}`));
