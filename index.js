const extensionId = 'gemini-additional-parameters';
const pluginPath = `/api/plugins/${extensionId}`;
const standardPath = '/api/backends/chat-completions/generate';
const hydrogenModel = 'gemini-4-hydrogen';
const geminiModels = [hydrogenModel, 'gemini-4-argon', 'gemini-4-carbon'];
const providers = {
    makersuite: { label: 'Google AI Studio', select: '#model_google_select', setting: 'google_model' },
    vertexai: { label: 'Google Vertex AI', select: '#model_vertexai_select', setting: 'vertexai_model' },
};
const fields = [
    ['include', 'Добавить в тело запроса', 'generationConfig:\n  thinkingConfig:\n    thinkingLevel: XHIGH', 5],
    ['exclude', 'Исключить из тела запроса', '- generationConfig.thinkingConfig.thinkingBudget\n- generationConfig.temperature', 4],
    ['headers', 'Добавить заголовки запроса', 'X-Goog-User-Project: "my-project-id"', 3],
];
const context = SillyTavern.getContext();
const fetchOriginal = globalThis.fetch.bind(globalThis);

function modelSettings(source, model) {
    const key = JSON.stringify([source, model]);
    return context.extensionSettings[extensionId]?.[key];
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

    if (model === hydrogenModel) {
        const example = document.createElement('button');
        example.type = 'button';
        example.className = 'menu_button';
        example.textContent = 'Подставить пример Hydrogen XHIGH';
        example.title = 'Заполняет заново поля добавления и исключения';
        example.addEventListener('click', () => {
            inputs.include.value = fields[0][2];
            inputs.exclude.value = [
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
        regionHint.textContent = 'Для Gemini 4 в поле Vertex AI Region можно указать global.';
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
            const hasValues = Object.values(values).some(value => value.trim());
            try {
                if (hasValues) {
                    const response = await fetchOriginal(`${pluginPath}/validate`, {
                        method: 'POST',
                        headers: context.getRequestHeaders(),
                        body: JSON.stringify(values),
                    });
                    if (response.status === 404) {
                        throw new Error('Серверный плагин Gemini не загружен. Проверьте установку и перезапустите SillyTavern.');
                    }
                    const data = await response.json();
                    if (!response.ok || data.ok !== true) {
                        throw new Error(data.error?.message || 'Сервер не подтвердил параметры.');
                    }
                }
            } catch (error) {
                status.textContent = error.message;
                status.hidden = false;
                return false;
            }

            const settings = context.extensionSettings[extensionId] ??= {};
            const key = JSON.stringify([source, model]);
            if (hasValues) settings[key] = values;
            else delete settings[key];
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
        if (select.value) void openParameters(source, select.value);
    });
    select.after(button);
}

// Route the chat and ChatCompletionService through the same plugin endpoint.
globalThis.fetch = function fetchWithGeminiParameters(resource, options) {
    if ((typeof resource !== 'string' && !(resource instanceof URL)) ||
        typeof options?.body !== 'string' || String(options.method).toUpperCase() !== 'POST') {
        return fetchOriginal(resource, options);
    }
    const url = new URL(resource, location.href);
    if (url.origin !== location.origin || url.pathname !== standardPath) return fetchOriginal(resource, options);

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

    const body = JSON.stringify({ ...payload, gemini_parameters: settings });
    url.pathname = `${pluginPath}/generate`;
    return fetchOriginal(url, { ...options, body }).then(response => {
        if (response.status !== 404) return response;
        return Response.json({ error: { message: 'Серверный плагин Gemini не загружен. Проверьте установку и перезапустите SillyTavern.' } }, { status: 503 });
    });
};
