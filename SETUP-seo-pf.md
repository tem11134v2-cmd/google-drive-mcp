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

## Таймауты и прокси (добавлено 2026-09-05)

**Симптом:** `uploadFile` (и любой другой вызов) «висит вечно», Claude Code снимает его только по своему idle-таймауту
через 30 минут (`Tool 'uploadFile' aborting: no response ... for 1800s`).

**Причина:** весь трафик идёт через Proxifier → HTTPS-прокси. Когда у прокси исчерпан лимит одновременных
соединений (~100 на аккаунт; 10 открытых сессий Claude Code + Chrome его добивают), новые соединения либо получают
`ECONNREFUSED 127.179.x.x:443` (фиктивные адреса Proxifier-DNS), либо принимаются и молчат. У googleapis/gaxios
таймаута по умолчанию нет → промис никогда не завершается.

**Что сделано (форк = установленный dist, патч от 2026-09-05):**
- `src/utils/gaxiosOptions.ts` — на КАЖДЫЙ запрос к Google (Drive/Calendar/Docs/Sheets/Slides + refresh токена)
  вешается `timeout` (= `--api-timeout`, по умолчанию 120000 мс) и ретраи транспортных ошибок
  (ECONNREFUSED/ECONNRESET/ENOTFOUND/EAI_AGAIN, HTTP 429/503/504) с экспоненциальной паузой (`--retry-max`,
  `--retry-base-delay`). Запрос, отвалившийся по таймауту, НЕ повторяется (мог дойти до Google — иначе дубли файлов).
- **Авторизация без браузера внутри тулзы.** Раньше при неудачном refresh токена (сеть/прокси) сервер молча
  запускал интерактивный OAuth (слушал :3000 и ждал callback в браузере) — именно так висли `uploadFile` и даже
  локальный `authGetStatus`. Теперь `TokenManager.lastRefreshError` + проверка в `authenticate()`: вызов сразу
  возвращает ошибку «Google OAuth token refresh failed (…) — network/proxy error, tokens kept», следующий вызов
  повторяет refresh. Интерактивный флоу остаётся только для случая «токена нет вообще / invalid_grant».
- **MIME по расширению локального файла**, а не по `name`: `name: "A6_ibgproperty-com"` (без расширения) +
  `convertToGoogleFormat` раньше падал с «Cannot convert MIME type application/octet-stream».
- `--no-resources` — не отдавать файлы Drive как MCP-ресурсы: иначе Claude Code при каждом старте сессии листает
  Drive 20 страницами (70 с старта и 20 лишних соединений через прокси).

**Регистрация в Claude Code (`~/.claude.json` → `mcpServers.gdrive-piotr`):**
```json
{
  "command": "C:/Users/Administrator/scoop/apps/nodejs-lts/current/node.exe",
  "args": ["<npm-global>/node_modules/@piotr-agier/google-drive-mcp/dist/index.js", "--api-timeout=150000", "--no-resources"],
  "timeout": 180000
}
```
`timeout` (мс) — лимит Claude Code на один вызов тулзы именно этого сервера (по умолчанию idle 30 мин).
Серверный `--api-timeout` чуть меньше клиентского, чтобы ошибка приходила от сервера с понятным текстом.

**Установленный пакет в scoop собран из upstream 2.2.0 (май 2026) и патчился прямо в `dist/index.js`;**
оригинал — `dist/index.js.orig-2026-09-05` и `~/.claude/backups/google-drive-mcp-dist-2026-09-05/`.
При переустановке из этого форка (`npm run build`) те же правки соберутся из `src/`.

**Проверка без сети:** поднять «чёрную дыру» на 127.0.0.2:443, подменить DNS для googleapis.com через
`NODE_OPTIONS=--import dnsmock.mjs` и вызвать `uploadFile` — с патчем вызов падает через `--api-timeout`,
без патча висит бесконечно.
