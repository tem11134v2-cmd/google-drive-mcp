# Deployment notes — google-drive-mcp (SEO-PF)

Форк `@piotr-agier/google-drive-mcp`, используется как MCP Google Workspace для автопилота SEO-PF.
Главное, ради чего он нам нужен: тула **`uploadFile(localPath, convertToGoogleFormat:true, parentFolderId)`** —
загрузка файла ПО ПУТИ потоком (xlsx→Google Таблица, docx→Документ, pptx→Презентация), без потолка размера
и без искажений (в отличие от inline-base64). Плюс полный набор Docs/Sheets/Slides для полировки/правок.

> Этот форк на момент публикации = upstream v2.2.0 без изменений. Держим как наш бэкап и источник для
> переустановки. Апстрим: https://github.com/piotr-agier/google-drive-mcp

## Установка на чистой машине

1. Node LTS (у нас — через scoop: `scoop install nodejs-lts`).
2. Поставить пакет глобально — из апстрима `npm i -g @piotr-agier/google-drive-mcp`
   или из этого форка `npm i -g github:tem11134v2-cmd/google-drive-mcp`.
3. **Креды Google** (НЕ коммитим — секреты) положить в `~/.config/google-drive-mcp/`:
   - `gcp-oauth.keys.json` — OAuth client типа Desktop (client_id/secret).
   - `tokens.json` — токен с refresh_token. Если его нет: `google-drive-mcp auth` (одноразовый OAuth-флоу в браузере).
   Нужный доступ: scope включает `https://www.googleapis.com/auth/drive` (создание/конвертация файлов).
4. **Зарегистрировать в Claude Code** (user-scope, все проекты):
   ```
   claude mcp add gdrive-piotr --scope user -- node <npm-global>/node_modules/@piotr-agier/google-drive-mcp/dist/index.js
   ```
   (`<npm-global>` = вывод `npm root -g`.) Тулзы подхватываются на СТАРТЕ сессии — новый чат увидит их сразу,
   уже открытый — после перезапуска.

## Проверка
- `claude mcp get gdrive-piotr` → Status: Connected.
- Быстрый smoke: сервер стартует ~4 c (OAuth-refresh), отдаёт `uploadFile`, `createGoogleSheet` и др.

## Заметки
- Старый Google-Drive-коннектор (inline `create_file`) — отключать в UI приложения (Настройки → Коннекторы),
  из CLI/файлов он не управляется. gdrive-piotr — его надмножество, дубли не нужны.
- В SEO-PF паттерн публикации закреплён в `knowledge/google-table-howto.md` и `CLAUDE.md`.
