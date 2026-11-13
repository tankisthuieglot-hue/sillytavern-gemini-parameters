# Gemini — Доп. параметры для SillyTavern

Расширение добавляет кнопку **«Доп. параметры»** под списком моделей в настройках подключения **Google AI Studio** и **Google Vertex AI**. В списках также появляются `gemini-4-hydrogen`, `gemini-4-argon` и `gemini-4-carbon`.

## Установка

1. Остановите SillyTavern. Скопируйте папки `plugins` и `public` из архива в корень той установки SillyTavern, где хотите использовать расширение. Объедините папки при копировании. В них лежат две новые папки `gemini-additional-parameters`.
2. В корневом `config.yaml` установите `enableServerPlugins: true`. Серверной части нужна Node.js 22.15+ в ветке 22 или Node.js 24+. Дополнительные пакеты устанавливать не нужно.
3. Запустите SillyTavern и обновите страницу. В **«Подключения API»** выберите **Chat Completion**, затем **Google AI Studio** или **Google Vertex AI**. Подключитесь обычным способом.

Готовые пути для ручного копирования:

| Папка | Расположение внутри SillyTavern |
| --- | --- |
| Серверный плагин | `plugins/gemini-additional-parameters/` |
| Расширение интерфейса | `public/scripts/extensions/third-party/gemini-additional-parameters/` |

## Gemini 4 Hydrogen с XHIGH

1. Выберите `gemini-4-hydrogen`. Для прямого подключения к Vertex AI укажите `global` в поле региона. Для стандартного режима Vertex также нужен проект с доступом к модели. [Регионы и доступность Hydrogen](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/4-hydrogen)
2. Нажмите **«Доп. параметры» → «Подставить пример Hydrogen XHIGH» → «Сохранить»**.

Кнопка заполнит поле **«Добавить в тело запроса»**:

```yaml
generationConfig:
  thinkingConfig:
    thinkingLevel: XHIGH
```

В поле **«Исключить из тела запроса»** появятся пути:

```yaml
- generationConfig.thinkingConfig.thinkingBudget
- generationConfig.temperature
- generationConfig.topP
- generationConfig.topK
```

`thinkingBudget` вызывает ошибку у Hydrogen, а `temperature`, `topP` и `topK` модель игнорирует. Если ответ обрывается на размышлении, проверьте лимит выходных токенов в настройках генерации. Google учитывает в нём и размышления, и текст ответа. [Схема Google AI Studio GenerateContent](https://aistudio.google.com/api-reference/generate-content), [руководство Google Cloud по Hydrogen](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-4-hydrogen)

## Свои параметры

- **Добавить в тело запроса** принимает объект YAML или JSON. Вложенные объекты объединяются, массивы и отдельные значения заменяются целиком.
- **Исключить из тела запроса** принимает список YAML или JSON. Например, `- generationConfig.stopSequences` удаляет поле `stopSequences` из `generationConfig`. Исключения применяются после добавлений.
- **Добавить заголовки запроса** принимает объект YAML или JSON, например `X-Goog-User-Project: "my-project-id"`. Названия заголовков учитываются без регистра. `Host`, `Content-Length` и другие транспортные заголовки остаются под управлением HTTP-клиента. Значения сохраняются в настройках расширения. Для API-ключей и учётных данных используйте штатные поля подключения.

Настройки сохраняются отдельно для каждого пользователя SillyTavern, подключения и модели. Под подключением здесь имеется в виду источник **Google AI Studio** или **Google Vertex AI**. Очистите все три поля и нажмите **«Сохранить»**, чтобы сбросить настройки выбранной модели.

## Совместимость

Пакет подготовлен для исследованной сборки SillyTavern 1.18.0. Серверный плагин использует встроенную обработку чата и авторизацию SillyTavern и применяет параметры к готовому запросу `generateContent` или `streamGenerateContent`. Исходные файлы SillyTavern остаются без правок. После обновления SillyTavern совместимость зависит от структуры встроенного обработчика Gemini. Пакет использует текущий чатовый API SillyTavern `GenerateContent`; `Interactions API` и автоматическое продолжение ответов за пределами одного сегмента в пакет не входят. [Документация по серверным плагинам SillyTavern](https://docs.sillytavern.app/for-contributors/server-plugins/)
