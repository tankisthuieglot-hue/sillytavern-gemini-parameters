import { mergeBody, parseParameters, requestGemini, requiresDirect } from './gemini-request.js';
import { setOnlineStatus } from '/script.js';

const extensionId = 'gemini-additional-parameters';
const chatPath = '/api/backends/chat-completions';
const hydrogenModel = 'gemini-4-hydrogen';
const geminiModels = [hydrogenModel, 'gemini-4-argon', 'gemini-4-carbon'];
const providers = {
    makersuite: { label: 'Google AI Studio', select: '#model_google_select', setting: 'google_model' },
    vertexai: { label: 'Google Vertex AI', select: '#model_vertexai_select', setting: 'vertexai_model' },
};
const fields = [
    ['include', 'Добавить в тело запроса', 'generationConfig:\n  thinkingConfig:\n    thinkingLevel: XHIGH\n    includeThoughts: true', 5],
    ['exclude', 'Исключить из тела запроса', '- generationConfig.thinkingConfig.thinkingBudget\n- generationConfig.temperature', 4],
    ['headers', 'Добавить заголовки запроса', 'X-Goog-User-Project: "my-project-id"', 3],
];
const context = SillyTavern.getContext();
const { yaml } = SillyTavern.libs;
const fetchOriginal = globalThis.fetch.bind(globalThis);
const browserCredentials = new Map();
const activeSource = () => context.chatCompletionSettings.chat_completion_source;
const profileKey = (source, model) => JSON.stringify([source, model]);
const isVertexFull = (source, settings = context.chatCompletionSettings) => source === 'vertexai' && settings.vertexai_auth_mode === 'full';
const credentialKey = (source, settings) => isVertexFull(source, settings) ? 'vertex-full' : source;

let bodySupport;
function supportsNativeBodyOverrides() {
    bodySupport ??= fetchOriginal(`${chatPath}/custom-body-support`, { cache: 'no-store' })
        .then(async response => response.ok && (await response.json()).version === 1)
        .catch(() => false);
    return bodySupport;
}

function modelSettings(source, model) {
    return context.extensionSettings[extensionId]?.[profileKey(source, model)];
}

async function openParameters(source, model) {
    const nativeBody = await supportsNativeBodyOverrides();
    const isFull = isVertexFull(source);
    const connectionKey = credentialKey(source);
    const savedCredentials = browserCredentials.get(connectionKey);
    const content = document.createElement('div');
    content.className = 'flex-container flexFlowColumn';
    const title = document.createElement('h3');
    title.textContent = 'Дополнительные параметры Gemini';
    const description = document.createElement('small');
    description.textContent = `${providers[source].label} · ${model}`;
    content.append(title, description);

    const saved = modelSettings(source, model) ?? {};
    const inputs = {};
    for (const [name, caption, example, rows] of fields) {
        const label = document.createElement('label');
        const input = document.createElement('textarea');
        input.className = 'text_pole textarea_compact';
        input.name = name;
        input.placeholder = example;
        input.rows = rows;
        input.spellcheck = false;
        input.value = saved[name] ?? '';
        inputs[name] = input;
        label.append(caption, input);
        content.append(label);
    }

    const hint = document.createElement('small');
    hint.textContent = 'Формат YAML или JSON. В списке исключений используйте пути через точку.';
    content.append(hint);

    const credentialLabel = document.createElement('label');
    const credentialInput = document.createElement('input');
    credentialInput.type = 'password';
    credentialInput.className = 'text_pole';
    credentialInput.autocomplete = 'off';
    credentialInput.spellcheck = false;
    credentialInput.name = 'gemini-browser-credential';
    credentialInput.placeholder = savedCredentials ? 'Уже введён для этой вкладки' : 'Вставьте сюда';
    credentialLabel.append(isFull ? 'Временный OAuth-токен Google Cloud' : 'API-ключ для прямого запроса', credentialInput);
    content.append(credentialLabel);

    const projectInput = document.createElement('input');
    if (isFull) {
        const projectLabel = document.createElement('label');
        projectInput.className = 'text_pole';
        projectInput.value = savedCredentials?.project ?? '';
        projectInput.placeholder = 'my-project-id';
        projectLabel.append('ID проекта Google Cloud', projectInput);
        content.append(projectLabel);
    }

    const credentialHint = document.createElement('small');
    credentialHint.textContent = nativeBody
        ? 'Для одних добавлений можно использовать сохранённое подключение. Для прямого запроса ключ или токен хранится в памяти вкладки.'
        : 'Запросы идут из браузера прямо в Google. Ключ или токен хранится в памяти вкладки до её перезагрузки.';
    content.append(credentialHint);

    if (model === hydrogenModel) {
        const example = document.createElement('button');
        example.type = 'button';
        example.className = 'menu_button';
        example.textContent = 'Подставить пример Hydrogen XHIGH';
        example.title = 'Заполняет заново поля добавления и исключения';
        example.addEventListener('click', () => {
            inputs.include.value = fields[0][2];
            inputs.exclude.value = nativeBody ? '' : [
                'generationConfig.thinkingConfig.thinkingBudget',
                'generationConfig.temperature',
                'generationConfig.topP',
                'generationConfig.topK',
            ].map(path => `- ${path}`).join('\n');
        });
        content.append(example);
    }

    if (source === 'vertexai' && geminiModels.includes(model)) {
        const regionHint = document.createElement('small');
        regionHint.textContent = isFull
            ? 'Для Hydrogen укажите регион Vertex AI global, us или eu.'
            : 'Доступность моделей в Vertex AI Express зависит от списка Google. Для Hydrogen выберите AI Studio или Vertex AI Full.';
        content.append(regionHint);
    }

    const status = document.createElement('div');
    status.setAttribute('role', 'alert');
    status.hidden = true;
    content.append(status);

    const popup = new context.Popup(content, context.POPUP_TYPE.CONFIRM, '', {
        wide: true,
        allowVerticalScrolling: true,
        leftAlign: true,
        okButton: 'Сохранить',
        cancelButton: 'Отмена',
        onClosing: async dialog => {
            if (dialog.result !== context.POPUP_RESULT.AFFIRMATIVE) return true;

            const values = Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, input.value]));
            const value = credentialInput.value.trim() || savedCredentials?.value;
            const project = projectInput.value.trim();
            let hasValues;
            try {
                const parameters = parseParameters(values, yaml.parse);
                hasValues = Object.keys(parameters.include).length > 0 || requiresDirect(parameters);
                if (hasValues && (!nativeBody || requiresDirect(parameters)) && !value) {
                    throw new Error(isFull ? 'Введите временный OAuth-токен Google Cloud.' : 'Введите API-ключ для прямого запроса.');
                }
                if (value && !/^[\x21-\x7e]+$/.test(value)) throw new Error('В ключе или токене есть пробелы либо недопустимые символы.');
                if (value && isFull && !/^[a-z0-9][a-z0-9.:-]{0,126}$/i.test(project)) throw new Error('Укажите ID проекта Google Cloud.');
            } catch (error) {
                status.textContent = error.message;
                status.hidden = false;
                return false;
            }

            credentialInput.value = '';
            if (value) browserCredentials.set(connectionKey, { value, project });
            const settings = context.extensionSettings[extensionId] ??= {};
            const key = profileKey(source, model);
            if (hasValues) settings[key] = values;
            else delete settings[key];
            context.saveSettingsDebounced();
            updateBrowserStatus();
            return true;
        },
    });
    await popup.show();
}

const browserStatus = 'Gemini: прямое подключение из браузера';
function updateBrowserStatus() {
    const current = SillyTavern.getContext();
    const source = activeSource();
    const provider = Object.hasOwn(providers, source) ? providers[source] : null;
    const model = current.chatCompletionSettings[provider?.setting];
    if (current.mainApi === 'openai' && provider && browserCredentials.has(credentialKey(source)) && modelSettings(source, model)) {
        if (current.onlineStatus === 'no_connection') setOnlineStatus(browserStatus);
    } else if (current.onlineStatus === browserStatus) {
        setOnlineStatus('no_connection');
    }
}

for (const [source, provider] of Object.entries(providers)) {
    const select = document.querySelector(provider.select);
    if (!select) continue;

    const missing = geminiModels.filter(model => !Array.from(select.options).some(option => option.value === model));
    if (missing.length) {
        const group = document.createElement('optgroup');
        group.label = 'Gemini 4';
        for (const model of missing) group.append(new Option(model, model));
        select.prepend(group);
    }
    const savedModel = context.chatCompletionSettings[provider.setting];
    if (Array.from(select.options).some(option => option.value === savedModel)) select.value = savedModel;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu_button menu_button_icon';
    button.textContent = 'Доп. параметры';
    button.addEventListener('click', () => {
        if (select.value) void openParameters(source, select.value);
    });
    select.after(button);
}

for (const type of ['CHATCOMPLETION_SOURCE_CHANGED', 'CHATCOMPLETION_MODEL_CHANGED', 'MAIN_API_CHANGED', 'ONLINE_STATUS_CHANGED', 'OAI_PRESET_CHANGED_AFTER']) {
    if (context.eventTypes[type]) context.eventSource.on(context.eventTypes[type], updateBrowserStatus);
}
document.querySelector('#vertexai_auth_mode')?.addEventListener('change', () => queueMicrotask(updateBrowserStatus));

// The main chat, Test Message and ChatCompletionService all use this endpoint.
globalThis.fetch = async function fetchWithGeminiParameters(resource, options) {
    if ((typeof resource !== 'string' && !(resource instanceof URL)) ||
        typeof options?.body !== 'string' || String(options.method).toUpperCase() !== 'POST') {
        return fetchOriginal(resource, options);
    }
    let url;
    try {
        url = new URL(resource, location.href);
    } catch {
        return fetchOriginal(resource, options);
    }
    if (url.origin !== location.origin || url.pathname !== `${chatPath}/generate`) {
        return fetchOriginal(resource, options);
    }

    let payload;
    try {
        payload = JSON.parse(options.body);
    } catch {
        return fetchOriginal(resource, options);
    }
    const source = payload?.chat_completion_source;
    if (!Object.hasOwn(providers, source) || typeof payload.model !== 'string') return fetchOriginal(resource, options);
    const settings = modelSettings(source, payload.model);
    if (!settings) return fetchOriginal(resource, options);
    const connection = { ...context.chatCompletionSettings, ...payload };
    const credentials = browserCredentials.get(credentialKey(source, connection));

    try {
        const parameters = parseParameters(settings, yaml.parse);
        if (payload.custom_request_body !== undefined && (!payload.custom_request_body || typeof payload.custom_request_body !== 'object' || Array.isArray(payload.custom_request_body))) {
            throw new Error('Другое расширение передало некорректное дополнительное тело запроса.');
        }
        if (!credentials && !requiresDirect(parameters) && await supportsNativeBodyOverrides()) {
            const model = payload.model.replace(/^models\//, '');
            const thinking = payload.include_reasoning && /^gemini-4(?:[.-]|$)/.test(model)
                ? { generationConfig: { thinkingConfig: { includeThoughts: true } } } : {};
            const custom_request_body = mergeBody(mergeBody(thinking, payload.custom_request_body ?? {}), parameters.include);
            const body = JSON.stringify({ ...payload, custom_request_body });
            return fetchOriginal(resource, { ...options, body });
        }
        if (!credentials) {
            const message = isVertexFull(source, connection) ? 'Введите временный OAuth-токен в «Доп. параметры».' : 'Введите API-ключ в «Доп. параметры».';
            return Response.json({ error: { message } }, { status: 400 });
        }
        if (payload.custom_prompt_post_processing && Array.isArray(payload.messages)) {
            const response = await fetchOriginal(`${chatPath}/process`, {
                method: 'POST', headers: context.getRequestHeaders(), signal: options.signal,
                body: JSON.stringify({
                    type: payload.custom_prompt_post_processing, messages: payload.messages,
                    user_name: payload.user_name, char_name: payload.char_name, group_names: payload.group_names,
                }),
            });
            if (response.ok) connection.messages = (await response.json()).messages;
            else if (response.status !== 404) throw new Error('SillyTavern не смог обработать сообщения для Gemini.');
        }
        return await requestGemini(connection, parameters, credentials, options.signal, fetchOriginal);
    } catch (error) {
        if (options.signal?.aborted || error.name === 'AbortError') throw error;
        return Response.json({ error: { message: error.message } }, { status: 400 });
    }
};
