// Runs the studio's local language model (WebLLM) off the main thread so the
// page stays responsive while it thinks. Loaded by assets/js/pages/studio.js.
import { WebWorkerMLCEngineHandler } from 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm';

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg) => handler.onmessage(msg);
