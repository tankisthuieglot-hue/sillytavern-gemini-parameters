const unsafeKeys = new Set(['__proto__', 'constructor', 'prototype']);
const controlledHeaders = new Set([
    'authorization', 'x-goog-api-key', 'cookie', 'cookie2', 'host', 'origin', 'referer',
    'connection', 'content-length', 'expect', 'keep-alive', 'te', 'trailer', 'transfer-encoding',
    'upgrade', 'accept-charset', 'accept-encoding', 'date', 'via', 'user-agent',
    'access-control-request-headers', 'access-control-request-method',
]);
const gemini4 = /^gemini-4(?:[.-]|$)/;
const hydrogen = /^gemini-4-hydrogen(?:-|$)/;
const imageModels = /^(?:gemini-2\.0-flash-exp|gemini-(?:2\.|3\.)[\w.-]+-image(?:-[\w.-]+)?)$/;

function isMapping(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseField(label, value, fallback, parse) {
    if (value === undefined || (typeof value === 'string' && !value.trim())) return fallback;
    if (typeof value !== 'string') throw new Error(`${label} — ожидается текст YAML или JSON.`);
    try {
        return parse(value) ?? fallback;
    } catch {
        throw new Error(`${label} — проверьте синтаксис YAML или JSON.`);
    }
}

function validateBody(value, depth = 0) {
    if (depth > 64) throw new Error('Слишком глубокая вложенность полей в теле запроса.');
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Ожидаются конечные числа.');
    if (value === null || typeof value !== 'object') return;
    for (const [name, child] of Object.entries(value)) {
        if (unsafeKeys.has(name)) throw new Error(`Недопустимое имя поля: ${name}.`);
        validateBody(child, depth + 1);
    }
}

export function parseParameters(values, parse) {
    const include = parseField('Добавить в тело', values.include, {}, parse);
    if (!isMapping(include)) throw new Error('Добавить в тело — ожидается объект YAML или JSON.');
    validateBody(include);

    const exclude = parseField('Исключить из тела', values.exclude, [], parse);
    const paths = Array.isArray(exclude) ? exclude : isMapping(exclude) ? Object.keys(exclude) : [exclude];
    const excludePaths = paths.map(path => {
        if (typeof path !== 'string') throw new Error('Исключить из тела — ожидаются имена полей или пути через точку.');
        const segments = path.trim().split('.');
        if (segments.length > 64 || segments.some(key => !key || unsafeKeys.has(key))) {
            throw new Error(`Недопустимый путь исключения: ${path}.`);
        }
        return segments;
    });

    const entries = parseField('Заголовки запроса', values.headers, {}, parse);
    if (!isMapping(entries)) throw new Error('Заголовки запроса — ожидается объект YAML или JSON.');
    const headers = new Headers();
    for (const [name, value] of Object.entries(entries)) {
        const key = name.toLowerCase();
        if (controlledHeaders.has(key) || key.startsWith('sec-') || key.startsWith('proxy-')) {
            throw new Error(`Заголовок ${name} задаётся подключением или браузером.`);
        }
        if (!['string', 'number', 'boolean'].includes(typeof value) || /[\r\n]/.test(String(value))) {
            throw new Error(`Укажите одно значение без переноса строки для заголовка ${name}.`);
        }
        try {
            headers.set(name, String(value));
        } catch {
            throw new Error(`Проверьте имя и значение заголовка ${name}.`);
        }
    }
    return { include, excludePaths, headers };
}

export function requiresDirect(parameters) {
    return parameters.excludePaths.length > 0 || !parameters.headers.keys().next().done;
}

export function mergeBody(base, patch) {
    const result = { ...base };
    for (const [key, value] of Object.entries(patch)) {
        if (unsafeKeys.has(key)) throw new Error(`Недопустимое имя поля: ${key}.`);
        const previous = Object.hasOwn(result, key) ? result[key] : undefined;
        result[key] = isMapping(value) ? mergeBody(isMapping(previous) ? previous : {}, value) : value;
    }
    return result;
}

function excludeFields(body, paths) {
    for (const path of paths) {
        let parent = body;
        for (const key of path.slice(0, -1)) {
            parent = isMapping(parent) && Object.hasOwn(parent, key) ? parent[key] : undefined;
        }
        if (isMapping(parent)) delete parent[path.at(-1)];
    }
}

function credentialMode(payload) {
    if (payload.chat_completion_source === 'makersuite') return 'studio';
    return payload.vertexai_auth_mode === 'full' ? 'vertex-full' : 'vertex-express';
}

function buildUrl(payload, model, credentials) {
    const method = payload.stream ? 'streamGenerateContent' : 'generateContent';
    const mode = credentialMode(payload);
    let url;
    if (mode === 'studio') {
        url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${model}:${method}`);
    } else if (mode === 'vertex-express') {
        url = new URL(`https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:${method}`);
    } else {
        const project = credentials.project;
        if (!/^[a-z0-9][a-z0-9.:-]{0,126}$/i.test(project ?? '')) {
            throw new Error('Укажите ID проекта Google Cloud для Vertex AI Full.');
        }
        const region = String(payload.vertexai_region || 'global').trim();
        if (!/^[a-z][a-z0-9-]{0,31}$/.test(region)) throw new Error('Проверьте регион Vertex AI.');
        if (hydrogen.test(model) && !['global', 'us', 'eu'].includes(region)) {
            throw new Error('Для Hydrogen укажите регион Vertex AI global, us или eu.');
        }
        const multiRegion = ['us', 'eu'].includes(region);
        const host = region === 'global' ? 'aiplatform.googleapis.com'
            : multiRegion ? `aiplatform.${region}.rep.googleapis.com` : `${region}-aiplatform.googleapis.com`;
        url = new URL(`https://${host}/v1/projects/${encodeURIComponent(project)}/locations/${region}/publishers/google/models/${model}:${method}`);
    }
    if (payload.stream) url.searchParams.set('alt', 'sse');
    return url;
}

function messageName(message, payload) {
    if (message.name === 'example_user') return payload.user_name;
    if (message.name === 'example_assistant') {
        const named = (payload.group_names ?? []).some(name => String(message.content).startsWith(`${name}: `));
        return named ? '' : payload.char_name;
    }
    return message.name;
}

function toolResponse(content) {
    try {
        const value = JSON.parse(content);
        return isMapping(value) ? value : { output: value };
    } catch {
        return isMapping(content) ? content : { output: String(content ?? '') };
    }
}

function convertMessages(payload, model, useSystemPrompt) {
    const system = [];
    const contents = [];
    const calls = new Map();
    const messages = payload.messages;
    if (!Array.isArray(messages) || !messages.length) throw new Error('В запросе Gemini нет сообщений.');

    for (const [index, message] of messages.entries()) {
        const parts = [];
        const name = messageName(message, payload);
        const role = message.role === 'assistant' ? 'model' : 'user';
        const isTool = message.role === 'tool' || Boolean(message.tool_call_id);
        const content = Array.isArray(message.content) ? message.content : [{ type: 'text', text: message.content }];
        if (isTool) {
            const call = calls.get(message.tool_call_id);
            if (!call && !message.name) throw new Error('В истории Gemini отсутствует вызов для результата инструмента.');
            parts.push({ functionResponse: {
                name: call?.name ?? message.name,
                response: toolResponse(message.content),
            } });
        } else {
            for (const item of content) {
                if (['text', 'input_text'].includes(item.type)) {
                    const text = String(item.text ?? '');
                    if (text) parts.push({ text });
                    continue;
                }
                const media = item[item.type];
                const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(media?.url ?? '');
                if (!match) throw new Error(`Вложение ${item.type} должно быть передано как данные Base64.`);
                const part = { inlineData: { mimeType: match[1], data: match[2] } };
                if (/^gemini-3/.test(model) && ['low', 'high'].includes(media.detail)) {
                    part.mediaResolution = { level: `MEDIA_RESOLUTION_${media.detail.toUpperCase()}` };
                }
                parts.push(part);
            }

            const firstText = parts.find(part => typeof part.text === 'string');
            if (name && firstText && !firstText.text.startsWith(`${name}: `)) firstText.text = `${name}: ${firstText.text}`;
            const lastText = parts.findLast(part => typeof part.text === 'string');
            if (lastText && role === 'model' && message.signature) lastText.thoughtSignature = message.signature;

            for (const call of message.tool_calls ?? []) {
                const { name, arguments: args } = call.function;
                const functionCall = { name, args: typeof args === 'string' ? JSON.parse(args) : args ?? {} };
                calls.set(call.id, functionCall);
                parts.push({ functionCall, ...(call.signature ? { thoughtSignature: call.signature } : {}) });
            }
        }

        if (!parts.length) continue;
        if (useSystemPrompt && !contents.length && message.role === 'system' && index < messages.length - 1 && parts.every(part => part.text)) {
            system.push(...parts);
        } else if (contents.at(-1)?.role === role) {
            contents.at(-1).parts.push(...parts);
        } else {
            contents.push({ role, parts });
        }
    }

    if (!contents.length) throw new Error('В запросе Gemini нет текста или вложений.');
    if (gemini4.test(model) && contents.at(-1).role === 'model') {
        contents.push({ role: 'user', parts: [{ text: 'Continue from the last message.' }] });
    }
    return { contents, ...(system.length ? { systemInstruction: { parts: system } } : {}) };
}

function thinkingConfig(payload, model) {
    const effort = payload.reasoning_effort;
    const includeThoughts = Boolean(payload.include_reasoning);
    if (gemini4.test(model) || /^gemini-3[.\d]*-(?:flash|pro)/.test(model)) {
        const pro = /^gemini-3[.\d]*-pro/.test(model);
        const levels = {
            min: gemini4.test(model) || pro ? 'LOW' : 'MINIMAL', low: 'LOW',
            medium: pro ? 'LOW' : 'MEDIUM', high: 'HIGH',
            max: hydrogen.test(model) ? 'XHIGH' : 'HIGH',
        };
        return { includeThoughts, thinkingLevel: Object.hasOwn(levels, effort) ? levels[effort] : undefined };
    }
    if (/^gemini-2\.5-(?:flash|pro)/.test(model)) {
        const pro = model.includes('-pro');
        const min = pro ? 128 : model.includes('-lite') ? 512 : 0;
        const max = pro ? 32768 : 24576;
        const fraction = { low: 0.1, medium: 0.25, high: 0.5, max: 1 }[effort];
        const budget = fraction ? Math.max(min, Math.min(max, Math.floor(Number(payload.max_tokens || max) * fraction))) : min;
        const thinkingBudget = effort === 'min' ? (pro ? min : 0) : !fraction ? -1 : budget;
        return { includeThoughts: includeThoughts && (payload.chat_completion_source !== 'vertexai' || thinkingBudget !== 0), thinkingBudget };
    }
    return undefined;
}

function getTools(payload, model, allowTools) {
    if (!allowTools) return {};
    const declarations = [];
    const tools = [];
    for (const tool of payload.tools ?? []) {
        if (tool.type === 'function') {
            const { name, description, parameters } = tool.function;
            declarations.push({ name, description, parametersJsonSchema: parameters });
        } else if (tool[tool.type]) {
            tools.push({ [tool.type]: tool[tool.type] });
        }
    }

    if (!declarations.length) {
        if (payload.enable_web_search && !/(?:gemini-2\.0-flash-lite|gemini-robotics-er-1\.5-preview|learnlm)/.test(model)) {
            tools.push({ googleSearch: {} });
        }
        return tools.length ? { tools } : {};
    }

    const mode = { auto: 'AUTO', required: 'ANY', none: 'NONE' };
    const choice = payload.tool_choice;
    const config = typeof choice === 'string' && Object.hasOwn(mode, choice) ? { mode: mode[choice] }
        : choice?.function?.name ? { mode: 'ANY', allowedFunctionNames: [choice.function.name] } : null;
    return {
        tools: [{ functionDeclarations: declarations }],
        ...(config ? { toolConfig: { functionCallingConfig: config } } : {}),
    };
}

export function buildGeminiRequest(payload, parameters, credentials) {
    const model = String(payload.model ?? '').replace(/^models\//, '');
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(model)) throw new Error('Проверьте ID модели Gemini.');
    if (!['makersuite', 'vertexai'].includes(payload.chat_completion_source)) throw new Error('Выберите подключение Gemini.');
    if (!credentials?.value) throw new Error('Введите ключ для прямого запроса в «Доп. параметры».');

    const url = buildUrl(payload, model, credentials);
    const headers = new Headers(parameters.headers);
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    if (credentialMode(payload) === 'vertex-full') headers.set('authorization', `Bearer ${credentials.value}`);
    else headers.set('x-goog-api-key', credentials.value);

    const image = Boolean(payload.request_images) && imageModels.test(model);
    const allowTools = !image && !/^gemma/.test(model);
    const schema = payload.json_schema?.value;
    const defaults = {
        ...convertMessages(payload, model, allowTools && payload.use_sysprompt),
        ...getTools(payload, model, allowTools),
        generationConfig: {
            candidateCount: 1,
            maxOutputTokens: payload.max_tokens,
            stopSequences: payload.stop?.length ? payload.stop : undefined,
            seed: payload.seed,
            ...(!gemini4.test(model) && { temperature: payload.temperature, topP: payload.top_p, topK: payload.top_k || undefined }),
            ...(image ? { responseModalities: ['TEXT', 'IMAGE'] } : { thinkingConfig: thinkingConfig(payload, model) }),
            ...(image && (payload.request_image_aspect_ratio || payload.request_image_resolution) ? { imageConfig: {
                aspectRatio: payload.request_image_aspect_ratio || undefined,
                imageSize: /^gemini-3/.test(model) ? payload.request_image_resolution || undefined : undefined,
            } } : {}),
            responseMimeType: payload.responseMimeType ?? (schema ? 'application/json' : undefined),
            ...(payload.responseSchema ? { responseSchema: payload.responseSchema } : { responseJsonSchema: schema }),
        },
    };
    const existing = payload.custom_request_body ?? {};
    if (!isMapping(existing)) throw new Error('Дополнительное тело запроса должно быть объектом.');
    validateBody(existing);
    const body = mergeBody(mergeBody(defaults, existing), parameters.include);
    excludeFields(body, parameters.excludePaths);
    return { url, headers, body: JSON.parse(JSON.stringify(body)) };
}

function errorResponse(message, status = 400) {
    return Response.json({ error: { message } }, { status });
}

export async function requestGemini(payload, parameters, credentials, signal, fetch) {
    const { url, headers, body } = buildGeminiRequest(payload, parameters, credentials);
    let response;
    try {
        response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), credentials: 'omit', redirect: 'error', signal });
    } catch (error) {
        if (signal?.aborted || error.name === 'AbortError') throw error;
        return errorResponse('Браузер не смог подключиться к Google. Проверьте сеть и разрешённые Google заголовки запроса.', 502);
    }
    if (response.ok && payload.stream && response.headers.get('content-type')?.includes('text/event-stream')) return response;

    const data = await response.json().catch(() => null);
    if (!response.ok || data?.error) {
        const message = String(data?.error?.message ?? `Google вернул ошибку HTTP ${response.status}.`);
        return errorResponse(message.replaceAll(credentials.value, '[скрыто]'), response.ok ? 502 : response.status);
    }
    const candidate = data?.candidates?.[0];
    const responseContent = candidate?.content ?? candidate?.output;
    const parts = responseContent?.parts ?? [];
    const text = typeof responseContent === 'string' ? responseContent : parts.filter(part => !part.thought).map(part => part.text).filter(Boolean).join('\n\n');
    if (!text && !parts.some(part => part.functionCall || part.inlineData)) {
        const reason = data?.promptFeedback?.blockReason ?? candidate?.finishReason;
        return errorResponse(reason ? `Google не вернул текст ответа (${reason}).` : 'Google не вернул текст ответа.', 422);
    }
    if (payload.stream) {
        const frames = parts.map(part => ({ candidates: [{ ...candidate, content: { ...responseContent, parts: [part] } }] }));
        const events = frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join('');
        return new Response(events, { headers: { 'Content-Type': 'text/event-stream' } });
    }
    return Response.json({ choices: [{ message: { content: text } }], responseContent });
}
