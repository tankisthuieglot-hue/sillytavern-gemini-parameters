import { parseParameters, prepareGeminiRequest } from './gemini-request.js';

const extensionId = 'gemini-additional-parameters';
const chatPath = '/api/backends/chat-completions';
const hydrogenModel = 'gemini-4-hydrogen';
const geminiModels = [hydrogenModel, 'gemini-4-argon', 'gemini-4-carbon'];
const providers = {
    makersuite: { label: 'Google AI Studio', select: '#model_google_select', setting: 'google_model' },
    vertexai: { label: 'Google Vertex AI', select: '#model_vertexai_select', setting: 'vertexai_model' },
};
const hydrogenPreset = 'generationConfig:\n  thinkingConfig:\n    thinkingLevel: XHIGH\n    includeThoughts: true';
const fields = [
    ['include', 'Добавить в тело запроса', hydrogenPreset, 5],
    ['exclude', 'Исключить из тела запроса', '- generationConfig.temperature\n- generationConfig.topK', 4],
];
const context = SillyTavern.getContext();
const { yaml } = SillyTavern.libs;
const fetchOriginal = globalThis.fetch.bind(globalThis);
const profileKey = (source, model) => JSON.stringify([source, model]);

function modelSettings(source, model) {
    const settings = context.extensionSettings[extensionId];
    return settings?.[profileKey(source, model)] ?? settings?.[profileKey(source, `models/${model}`)];
}

async function openParameters(source, model) {
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

    const headersLabel = document.createElement('label');
    const headers = document.createElement('textarea');
    headers.className = 'text_pole textarea_compact';
    headers.name = 'headers';
    headers.rows = 2;
    headers.disabled = true;
    headers.value = saved.headers ?? '';
    headers.placeholder = 'Штатный сервер Studio / Vertex не принимает дополнительные заголовки';
    headersLabel.append('Дополнительные заголовки', headers);
    content.append(headersLabel);
    if (headers.value.trim()) {
        const oldHeaders = document.createElement('small');
        oldHeaders.textContent = 'Заголовки из предыдущей версии сохранены и не отправляются.';
        content.append(oldHeaders);
    }

    if (model === hydrogenModel) {
        const example = document.createElement('button');
        example.type = 'button';
        example.className = 'menu_button';
        example.textContent = 'Подставить пример Hydrogen XHIGH';
        example.title = 'Заполняет поле добавления';
        example.addEventListener('click', () => {
            inputs.include.value = hydrogenPreset;
        });
        content.append(example);
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
            const hasSavedHeaders = typeof saved.headers === 'string' && Boolean(saved.headers.trim());
            let hasValues;
            try {
                const parameters = parseParameters(values, yaml.parse);
                hasValues = Object.keys(parameters.include).length > 0 || parameters.excludePaths.length > 0;
                if (hasValues) prepareGeminiRequest({ model }, parameters);
            } catch (error) {
                status.textContent = error.message;
                status.hidden = false;
                return false;
            }

            const settings = context.extensionSettings[extensionId] ??= {};
            const key = profileKey(source, model);
            if (hasValues || hasSavedHeaders) settings[key] = { ...values, ...(hasSavedHeaders ? { headers: saved.headers } : {}) };
            else delete settings[key];
            delete settings[profileKey(source, `models/${model}`)];
            context.saveSettingsDebounced();
            return true;
        },
    });
    await popup.show();
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
        if (select.value) void openParameters(source, select.value.replace(/^models\//, ''));
    });
    select.after(button);
}

// The main chat, Test Message and ChatCompletionService all use this endpoint.
globalThis.fetch = function fetchWithGeminiParameters(resource, options) {
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
    const settings = modelSettings(source, payload.model.replace(/^models\//, ''));
    if (!settings) return fetchOriginal(resource, options);

    let body;
    try {
        const parameters = parseParameters(settings, yaml.parse);
        if (!Object.keys(parameters.include).length && !parameters.excludePaths.length) return fetchOriginal(resource, options);
        body = JSON.stringify(prepareGeminiRequest(payload, parameters));
    } catch (error) {
        return Promise.resolve(Response.json({ error: { message: error.message } }, { status: 400 }));
    }
    return fetchOriginal(resource, { ...options, body });
};
