import fs from 'node:fs';
import path from 'node:path';
import { localApiEnvironment } from './local-api-config.mjs';

Object.assign(process.env, localApiEnvironment(process.env));
const webRoot = path.resolve(process.env.WEB_DIST_DIR || 'dist');
if (!fs.existsSync(path.join(webRoot, 'index.html'))) {
  throw new Error('The website has not been built. Run npm run start:local to build and start it.');
}
console.log(`Local Route Guard development access: http://localhost:${process.env.PORT}`);
console.log('Real routing; no subscription required on this computer. Do not expose this server through a tunnel or proxy.');
await import('../backend/server.mjs');
