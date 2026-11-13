import { validateHeaderName, validateHeaderValue } from 'node:http';

export const requestParameters = Symbol('Gemini additional parameters');

const unsafeKeys = new Set(['__proto__', 'constructor', 'prototype']);
const transportHeaders = new Set([
    'connection', 'content-encoding', 'content-length', 'expect', 'host', 'keep-alive',
    'proxy-authorization', 'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade',
]);

function isMapping(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseField(label, value, fallback, parse) {
    if (value === undefined) return fallback;
    if (typeof value !== 'string') throw new TypeError(`${label} — ожидается текст YAML или JSON.`);
    if (!value.trim()) return fallback;
    try {
        return parse(value) ?? fallback;
    } catch {
        throw new TypeError(`${label} — проверьте синтаксис YAML или JSON.`);
    }
}

function checkBody(value, depth = 0) {
    if (depth > 64) throw new TypeError('Параметры тела запроса вложены слишком глубоко.');
    if (typeof value === 'number' && !Number.isFinite(value)) {
        throw new TypeError('Числа в теле запроса должны быть конечными.');
    }
    if (value === null || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
        if (unsafeKeys.has(key)) throw new TypeError(`Недопустимое имя поля в теле запроса: ${key}.`);
        checkBody(child, depth + 1);
    }
}

export function parseParameters(settings, parse) {
    if (!isMapping(settings)) throw new TypeError('Отсутствуют дополнительные параметры Gemini.');

    const include = parseField('Добавить в тело', settings.include, {}, parse);
    if (!isMapping(include)) throw new TypeError('Добавить в тело — ожидается объект YAML или JSON.');
    checkBody(include);

    const exclude = parseField('Исключить из тела', settings.exclude, [], parse);
    const paths = Array.isArray(exclude) ? exclude : isMapping(exclude) ? Object.keys(exclude) : [exclude];
    const excludePaths = paths.map(path => {
        if (typeof path !== 'string' || !path.trim()) {
            throw new TypeError('Исключить из тела — укажите список имён или путей через точку.');
        }
        const segments = path.trim().split('.');
        if (segments.length > 64 || segments.some(key => !key || unsafeKeys.has(key))) {
            throw new TypeError(`Недопустимый путь для исключения: ${path}.`);
        }
        return segments;
    });

    const entries = parseField('Заголовки запроса', settings.headers, {}, parse);
    if (!isMapping(entries)) throw new TypeError('Заголовки запроса — ожидается объект YAML или JSON.');
    const headers = {};
    for (const [name, value] of Object.entries(entries)) {
        const key = name.toLowerCase();
        if (unsafeKeys.has(key) || transportHeaders.has(key)) {
            throw new TypeError(`Заголовок ${name} управляется HTTP-клиентом или имеет недопустимое имя.`);
        }
        if (!['string', 'number', 'boolean'].includes(typeof value)) {
            throw new TypeError(`Укажите одно значение для заголовка ${name}.`);
        }
        try {
            validateHeaderName(name);
            validateHeaderValue(name, String(value));
        } catch {
            throw new TypeError(`Проверьте имя и значение заголовка ${name}.`);
        }
        headers[key] = String(value);
    }
    return { include, excludePaths, headers };
}

function mergeBody(target, patch) {
    for (const [key, value] of Object.entries(patch)) {
        if (isMapping(value)) {
            const original = Object.hasOwn(target, key) ? target[key] : undefined;
            target[key] = mergeBody(isMapping(original) ? original : {}, value);
        } else {
            target[key] = value;
        }
    }
    return target;
}

function removeBodyField(body, path) {
    let current = body;
    for (const key of path.slice(0, -1)) {
        if (!isMapping(current) || !Object.hasOwn(current, key)) return;
        current = current[key];
    }
    if (isMapping(current)) delete current[path.at(-1)];
}

export function fetchGemini(request, fetch, url, options) {
    const { include, excludePaths, headers } = request[requestParameters];
    if (Object.keys(include).length || excludePaths.length) {
        const body = mergeBody(JSON.parse(options.body), include);
        for (const path of excludePaths) removeBodyField(body, path);
        options.body = JSON.stringify(body);
    }
    if (Object.keys(headers).length) {
        options.headers = {
            ...Object.fromEntries(Object.entries(options.headers).map(([name, value]) => [name.toLowerCase(), value])),
            ...headers,
        };
        options.redirect = 'error';
    }
    return fetch(url, options);
}
