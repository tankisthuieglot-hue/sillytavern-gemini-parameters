# Gemini — Доп. параметры для SillyTavern

Расширение добавляет кнопку **«Доп. параметры»** под списком моделей в настройках подключения **Google AI Studio** и **Google Vertex AI**. В списках также появляются `gemini-4-hydrogen`, `gemini-4-argon` и `gemini-4-carbon`.

## Установка из GitHub

Откройте **«Расширения» → «Установить расширение»**, вставьте ссылку и оставьте поле ветки пустым. Если расширение уже установлено по этой ссылке, нажмите **«Обновить»** в списке расширений и обновите страницу. [Документация SillyTavern](https://docs.sillytavern.app/extensions/)

```text
https://github.com/tankisthuieglot-hue/sillytavern-gemini-parameters.git
```

Версия 1.1 работает как расширение интерфейса. Для установки достаточно меню SillyTavern.

## Gemini 4 Hydrogen с XHIGH

1. В **«Подключения API»** выберите **Chat Completion**, затем **Google AI Studio** или **Google Vertex AI**. Выберите `gemini-4-hydrogen`.
2. Нажмите **«Доп. параметры» → «Подставить пример Hydrogen XHIGH»**. Если расширение запрашивает ключ или токен, введите данные выбранного подключения в этом же окне и нажмите **«Сохранить»**.
3. Для вывода рассуждений включите **«Запрашивать рассуждения»** в настройках ответа ИИ. [Рассуждения в SillyTavern](https://docs.sillytavern.app/usage/prompts/reasoning/)

Кнопка заполнит поле **«Добавить в тело запроса»**:

```yaml
generationConfig:
  thinkingConfig:
    thinkingLevel: XHIGH
    includeThoughts: true
```

При прямом запросе из браузера пример также добавляет исключения:

```yaml
- generationConfig.thinkingConfig.thinkingBudget
- generationConfig.temperature
- generationConfig.topP
- generationConfig.topK
```

`thinkingBudget` вызывает ошибку у Hydrogen, а `temperature`, `topP` и `topK` модель игнорирует. Google учитывает размышления и текст ответа в одном лимите выходных токенов. [Схема Google AI Studio GenerateContent](https://aistudio.google.com/api-reference/generate-content), [руководство Google Cloud по Hydrogen](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-4-hydrogen)

## Свои параметры

- **Добавить в тело запроса** принимает объект YAML или JSON. Вложенные объекты объединяются, массивы и отдельные значения заменяются целиком.
- **Исключить из тела запроса** принимает список YAML или JSON. Например, `- generationConfig.stopSequences` удаляет поле `stopSequences` из `generationConfig`. Исключения применяются после добавлений.
- **Добавить заголовки запроса** принимает объект YAML или JSON, например `X-Goog-User-Project: "my-project-id"`. Можно использовать заголовки, разрешённые Google для запросов из браузера. Ключи и токены вводятся в отдельное поле окна расширения.

Настройки сохраняются отдельно для каждого пользователя SillyTavern, подключения и модели. Под подключением здесь имеется в виду источник **Google AI Studio** или **Google Vertex AI**. Очистите все три поля и нажмите **«Сохранить»**, чтобы сбросить настройки выбранной модели.

## Подключение к Google

- **Google AI Studio** использует API-ключ из поля **«Доп. параметры»**. Запрос идёт из текущей вкладки прямо на `generativelanguage.googleapis.com`. Ключ хранится в памяти до перезагрузки страницы. [Ключи Gemini API](https://aistudio.google.com/docs/api-key)
- **Vertex AI Express** использует ключ Express и глобальный адрес Google. Доступность модели зависит от режима и проекта. В опубликованном Google списке Express Hydrogen отсутствует. Для него в Vertex нужен стандартный проект. [Модели Vertex AI Express](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/start/express-mode/overview#available-models-and-rate-limits-in-express-mode)
- **Vertex AI Full** использует временный OAuth-токен и ID проекта, введённые в окне расширения, и регион из настроек подключения SillyTavern. Для Hydrogen доступны `global`, `us` и `eu`. [Регионы и доступность Hydrogen](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/4-hydrogen)
- Сборки SillyTavern с поддержкой `custom_request_body` могут использовать сохранённое подключение для **добавления полей**. Для этого оставьте поле ключа пустым, а поля исключений и заголовков очистите. В остальных случаях параметры передаются прямым запросом.

Расширение использует `GenerateContent`, включая потоковый `streamGenerateContent`. При прямом запросе применяются стандартные настройки безопасности Google и параметры из окна расширения. Обычные запросы моделей, у которых нет сохранённых дополнительных параметров, идут через штатное подключение SillyTavern.
