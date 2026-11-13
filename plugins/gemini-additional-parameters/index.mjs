import { readFile } from 'node:fs/promises';
import * as modules from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseParameters, requestParameters } from './parameters.mjs';

export const info = {
    id: 'gemini-additional-parameters',
    name: 'Gemini Additional Parameters',
    description: 'Native request parameters for Google AI Studio and Vertex AI chat generation.',
};

const supportedSources = new Set(['makersuite', 'vertexai']);

async function loadGeminiRouter(root) {
    if (typeof modules.registerHooks !== 'function') {
        throw new Error('Gemini Additional Parameters requires Node.js 22.15 or later.');
    }

    const backend = pathToFileURL(join(root, 'src/endpoints/backends/chat-completions.js'));
    backend.searchParams.set('plugin', info.id);
    const source = await readFile(backend, 'utf8');
    const fetchCall = 'const generateResponse = await fetch(url, {';
    const geminiHandler = source.indexOf('async function sendMakerSuiteRequest(');
    const geminiEnd = source.indexOf('async function sendAI21Request(', geminiHandler);
    const callIndex = source.indexOf(fetchCall, geminiHandler);
    if (geminiHandler < 0 || geminiEnd < 0 || callIndex < 0 || callIndex >= geminiEnd ||
        source.indexOf(fetchCall, callIndex + fetchCall.length) !== -1) {
        throw new Error('This version of the SillyTavern Gemini backend is unsupported.');
    }

    // Load a private copy of the router with only the Gemini fetch call adapted.
    const adapterUrl = new URL('./parameters.mjs', import.meta.url).href;
    const adapted = `import { fetchGemini } from ${JSON.stringify(adapterUrl)};\n` +
        source.slice(0, callIndex) + 'const generateResponse = await fetchGemini(request, fetch, url, {' +
        source.slice(callIndex + fetchCall.length);
    const hook = modules.registerHooks({
        load(url, context, nextLoad) {
            if (url === backend.href) {
                return { format: 'module', source: adapted, shortCircuit: true };
            }
            return nextLoad(url, context);
        },
    });
    try {
        const { router } = await import(backend.href);
        return router;
    } finally {
        hook.deregister();
    }
}

export async function init(router, { sillyTavernRoot = fileURLToPath(new URL('../../', import.meta.url)) } = {}) {
    const require = modules.createRequire(join(sillyTavernRoot, 'package.json'));
    const { parse } = require('yaml');
    const geminiRouter = await loadGeminiRouter(sillyTavernRoot);

    router.post('/validate', (request, response) => {
        try {
            parseParameters(request.body, parse);
            response.json({ ok: true });
        } catch (error) {
            response.status(400).json({ error: { message: error.message } });
        }
    });

    router.post('/generate', (request, response, next) => {
        if (!supportedSources.has(request.body?.chat_completion_source)) {
            return response.status(400).json({ error: { message: 'Выберите Google AI Studio или Vertex AI.' } });
        }
        try {
            request[requestParameters] = parseParameters(request.body.gemini_parameters, parse);
        } catch (error) {
            return response.status(400).json({ error: { message: error.message } });
        }
        return geminiRouter(request, response, next);
    });
}
