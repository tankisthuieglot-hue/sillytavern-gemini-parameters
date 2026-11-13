# Gemini — Доп. параметры для SillyTavern

Расширение добавляет кнопку **«Доп. параметры»** под списком моделей в настройках подключения **Google AI Studio** и **Google Vertex AI**. В списках также появляются `gemini-4-hydrogen`, `gemini-4-argon` и `gemini-4-carbon`.

## Установка из GitHub

Откройте **«Расширения» → «Установить расширение»**, вставьте ссылку и оставьте поле ветки пустым. Если расширение уже установлено по этой ссылке, нажмите **«Обновить»** в списке расширений и обновите страницу. [Документация SillyTavern](https://docs.sillytavern.app/extensions/)

```text
https://github.com/tankisthuieglot-hue/sillytavern-gemini-parameters.git
```

Расширение использует выбранное подключение Google AI Studio или Vertex AI и его сохранённые данные доступа. Для установки достаточно меню SillyTavern.

## Gemini 4 Hydrogen с XHIGH

1. В **«Подключения API»** выберите **Chat Completion**, затем **Google AI Studio** или **Google Vertex AI**. Выберите `gemini-4-hydrogen`.
2. Нажмите **«Доп. параметры» → «Подставить пример Hydrogen XHIGH» → «Сохранить»**.
3. При сохранении `includeThoughts: true` расширение включает **«Запрашивать рассуждения»** в настройках ответа ИИ. Если Google вернёт сводку рассуждений, откройте её под сообщением. [Рассуждения в SillyTavern](https://docs.sillytavern.app/usage/prompts/reasoning/)

Кнопка заполнит поле **«Добавить в тело запроса»**:

```yaml
generationConfig:
  thinkingConfig:
    thinkingLevel: XHIGH
    includeThoughts: true
```

`thinkingBudget` вызывает ошибку у Hydrogen, а `temperature`, `topP` и `topK` модель игнорирует. Google учитывает размышления и текст ответа в одном лимите выходных токенов. [Схема Google AI Studio GenerateContent](https://aistudio.google.com/api-reference/generate-content), [руководство Google Cloud по Hydrogen](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-4-hydrogen)

После генерации снова откройте **«Доп. параметры»**. Окно показывает `thinkingLevel` и `includeThoughts` в последнем запросе к SillyTavern для выбранной модели, состояние показа рассуждений на момент отправки и наличие сводки в ответе. Поддержка сервером дополнительных полей проверяется отдельно. Наличие сводки само по себе не подтверждает, какой уровень рассуждений применил Google.

## Свои параметры

- **Добавить в тело запроса** принимает объект YAML или JSON. Вложенные объекты объединяются, массивы и отдельные значения заменяются целиком. Сборки с `custom_request_body` передают дополнительные поля Gemini, в том числе `thinkingConfig`.
- **Исключить из тела запроса** принимает список путей YAML или JSON. Например, `- generationConfig.stopSequences` убирает стоп-строки. Исключения применяются после добавлений. Доступно исключение настроек, которые SillyTavern принимает от клиента, например `temperature`, `topP`, `topK`, `stopSequences`, `maxOutputTokens` и `seed` внутри `generationConfig`. Поля, которые сервер формирует сам, требуют поддержки исключений на сервере.
- Поле **«Дополнительные заголовки»** показывает ранее сохранённые значения. В нативных подключениях Studio и Vertex SillyTavern не передаёт пользовательские заголовки из расширения.

Настройки сохраняются отдельно для каждого пользователя SillyTavern, источника и модели. Очистите поля добавления и исключения и нажмите **«Сохранить»**, чтобы сбросить параметры выбранной модели.

## Совместимость

Расширение добавляет параметры к штатному запросу SillyTavern. Сервер SillyTavern сам применяет ключ, проект Vertex, регион и способ авторизации из выбранного подключения.

Расширение прикладывает `custom_request_body` к запросу Studio или Vertex при каждой генерации с сохранёнными параметрами. Сборки SillyTavern, которые читают `custom_request_body`, передают эти поля в Google. Остальные сборки используют штатные параметры, например `maxOutputTokens`, и игнорируют дополнительные поля вроде `thinkingConfig`.

Доступность модели определяется Google. Для Hydrogen в стандартном Vertex AI доступны `global`, `us` и `eu`. [Доступность Gemini 4 Hydrogen](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/4-hydrogen)
