const unsafeKeys = new Set(['__proto__', 'constructor', 'prototype']);
const hydrogen = /^gemini-4-hydrogen(?:-|$)/i;
const gemini4 = /^gemini-4(?:[.-]|$)/i;

// These values are copied by the native Google handler before it builds the JSON.
const inputFields = new Map([
    ['generationConfig.temperature', 'temperature'],
    ['generationConfig.topP', 'top_p'],
    ['generationConfig.topK', 'top_k'],
    ['generationConfig.maxOutputTokens', 'max_tokens'],
    ['generationConfig.stopSequences', 'stop'],
    ['generationConfig.seed', 'seed'],
    ['generationConfig.responseMimeType', 'responseMimeType'],
    ['generationConfig.responseSchema', 'responseSchema'],
]);
const optionalFields = new Set([
    'cachedContent', 'labels', 'serviceTier', 'modelArmorConfig',
    'generationConfig.frequencyPenalty', 'generationConfig.presencePenalty',
    'generationConfig.responseLogprobs', 'generationConfig.logprobs', 'generationConfig.responseJsonSchema',
]);

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateObject(value, depth = 0) {
    if (depth > 64) throw new Error('Слишком глубокая вложенность параметров.');
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Числа должны быть конечными.');
    if (value === null || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
        if (unsafeKeys.has(key)) throw new Error(`Недопустимое имя поля: ${key}.`);
        validateObject(child, depth + 1);
    }
}

function parseField(text, parse, label, fallback) {
    if (text === undefined || text === null) return fallback;
    if (typeof text !== 'string') throw new Error(`${label} — ожидается текст YAML или JSON.`);
    if (!text.trim()) return fallback;
    try {
        return parse(text) ?? fallback;
    } catch {
        throw new Error(`${label} — проверьте синтаксис YAML или JSON.`);
    }
}

export function parseParameters(values, parse) {
    const include = parseField(values.include, parse, 'Добавить в тело', {});
    if (!isObject(include)) throw new Error('Добавить в тело — ожидается объект YAML или JSON.');
    validateObject(include);

    const exclude = parseField(values.exclude, parse, 'Исключить из тела', []);
    const paths = Array.isArray(exclude) ? exclude : isObject(exclude) ? Object.keys(exclude) : [exclude];
    const excludePaths = paths.map(path => {
        if (typeof path !== 'string') throw new Error('Исключить из тела — ожидаются пути к полям.');
        const keys = path.trim().split('.');
        if (keys.length > 64 || keys.some(key => !key || unsafeKeys.has(key))) throw new Error(`Недопустимый путь: ${path}.`);
        return keys.join('.');
    });
    return { include, excludePaths };
}

function merge(base, addition) {
    const result = { ...base };
    for (const [key, value] of Object.entries(addition)) {
        const previous = Object.hasOwn(result, key) ? result[key] : undefined;
        result[key] = isObject(value) ? merge(isObject(previous) ? previous : {}, value) : value;
    }
    return result;
}

function removeField(object, path) {
    const keys = path.split('.');
    let parent = object;
    for (const key of keys.slice(0, -1)) {
        if (!isObject(parent) || !Object.hasOwn(parent, key)) return;
        parent = parent[key];
    }
    if (isObject(parent)) delete parent[keys.at(-1)];
}

function canOmit(path, model) {
    return optionalFields.has(path) || (path === 'generationConfig.thinkingConfig.thinkingBudget' && hydrogen.test(model));
}

function firstUnknownField(body, prefix = '') {
    for (const [key, value] of Object.entries(body)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (inputFields.has(path)) continue;
        if (path === 'generationConfig' && isObject(value)) {
            const unknown = firstUnknownField(value, path);
            if (unknown) return unknown;
        } else {
            return path;
        }
    }
    return '';
}

export function prepareGeminiRequest(payload, parameters, nativeBody) {
    const output = { ...payload };
    const model = String(payload.model ?? '').replace(/^models\//, '');
    const existing = payload.custom_request_body;
    if (existing !== undefined) {
        if (!isObject(existing)) throw new Error('Другое расширение передало некорректное дополнительное тело запроса.');
        validateObject(existing);
    }

    const defaultThinking = nativeBody && gemini4.test(model) && payload.include_reasoning
        ? { generationConfig: { thinkingConfig: { includeThoughts: true } } } : {};
    const overrides = merge(merge(defaultThinking, existing ?? {}), parameters.include);

    for (const path of parameters.excludePaths) {
        const field = inputFields.get(path);
        if (field) {
            delete output[field];
            if (path.startsWith('generationConfig.response') && output.json_schema?.value) {
                throw new Error(`Поле ${path} добавляется настройкой JSON-схемы SillyTavern.`);
            }
        } else if (!canOmit(path, model)) {
            throw new Error(`SillyTavern не предоставляет исключение поля ${path} для Studio и Vertex.`);
        }
        removeField(overrides, path);
    }

    if (nativeBody) {
        output.custom_request_body = overrides;
        return output;
    }

    const unknown = firstUnknownField(overrides);
    if (unknown) throw new Error(`В этой сборке SillyTavern сервер не передаёт поле ${unknown} в запрос Studio или Vertex.`);
    if (isObject(overrides.generationConfig) && Object.hasOwn(overrides.generationConfig, 'topK') && !overrides.generationConfig.topK) {
        throw new Error('Штатный сервер SillyTavern пропускает пустой или нулевой topK. Используйте исключение generationConfig.topK.');
    }
    for (const [name, value] of Object.entries(overrides.generationConfig ?? {})) {
        output[inputFields.get(`generationConfig.${name}`)] = value;
    }
    delete output.custom_request_body;
    return output;
}
