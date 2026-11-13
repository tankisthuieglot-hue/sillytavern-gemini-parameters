# Gemini — Доп. параметры для SillyTavern

Расширение добавляет кнопку **«Доп. параметры»** под списком моделей в настройках подключения **Google AI Studio** и **Google Vertex AI**. В списках также появляются `gemini-4-hydrogen`, `gemini-4-argon` и `gemini-4-carbon`.

## Установка из GitHub

Откройте **«Расширения» → «Установить расширение»**, вставьте ссылку и оставьте поле ветки пустым. Если расширение уже установлено по этой ссылке, нажмите **«Обновить»** в списке расширений и обновите страницу. [Документация SillyTavern](https://docs.sillytavern.app/extensions/)

```text
https://github.com/tankisthuieglot-hue/sillytavern-gemini-parameters.git
```

Версия 1.2 использует выбранное подключение Google AI Studio или Vertex AI и его сохранённые данные доступа. Для установки достаточно меню SillyTavern.

## Gemini 4 Hydrogen с XHIGH

1. В **«Подключения API»** выберите **Chat Completion**, затем **Google AI Studio** или **Google Vertex AI**. Выберите `gemini-4-hydrogen`.
2. Нажмите **«Доп. параметры» → «Подставить пример Hydrogen XHIGH» → «Сохранить»**. Кнопка примера доступна, когда установленная сборка SillyTavern умеет передавать дополнительные поля в нативный запрос Google.
3. Для вывода рассуждений включите **«Запрашивать рассуждения»** в настройках ответа ИИ. [Рассуждения в SillyTavern](https://docs.sillytavern.app/usage/prompts/reasoning/)

Кнопка заполнит поле **«Добавить в тело запроса»**:

```yaml
generationConfig:
  thinkingConfig:
    thinkingLevel: XHIGH
    includeThoughts: true
```

`thinkingBudget` вызывает ошибку у Hydrogen, а `temperature`, `topP` и `topK` модель игнорирует. Google учитывает размышления и текст ответа в одном лимите выходных токенов. [Схема Google AI Studio GenerateContent](https://aistudio.google.com/api-reference/generate-content), [руководство Google Cloud по Hydrogen](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-4-hydrogen)

## Свои параметры

- **Добавить в тело запроса** принимает объект YAML или JSON. Вложенные объекты объединяются, массивы и отдельные значения заменяются целиком. Сборки с `custom_request_body` передают дополнительные поля Gemini, в том числе `thinkingConfig`.
- **Исключить из тела запроса** принимает список путей YAML или JSON. Например, `- generationConfig.stopSequences` убирает стоп-строки. Исключения применяются после добавлений. Доступно исключение настроек, которые SillyTavern принимает от клиента, например `temperature`, `topP`, `topK`, `stopSequences`, `maxOutputTokens` и `seed` внутри `generationConfig`. Поля, которые сервер формирует сам, требуют поддержки исключений на сервере.
- Поле **«Дополнительные заголовки»** показывает ранее сохранённые значения. В нативных подключениях Studio и Vertex SillyTavern не передаёт пользовательские заголовки из расширения.

Настройки сохраняются отдельно для каждого пользователя SillyTavern, источника и модели. Очистите поля добавления и исключения и нажмите **«Сохранить»**, чтобы сбросить параметры выбранной модели.

## Совместимость

Расширение добавляет параметры к штатному запросу SillyTavern. Сервер SillyTavern сам применяет ключ, проект Vertex, регион и способ авторизации из выбранного подключения.

Поддержка произвольных полей определяется по `/api/backends/chat-completions/custom-body-support`. Если такой поддержки нет, доступны поля, которые сервер уже принимает, например `generationConfig.maxOutputTokens`. При попытке отправить `XHIGH` на такой сборке расширение показывает ошибку с именем поля.

Доступность модели определяется Google. Для Hydrogen в стандартном Vertex AI доступны `global`, `us` и `eu`. [Доступность Gemini 4 Hydrogen](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/4-hydrogen)
