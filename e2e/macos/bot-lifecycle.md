# macOS packaged-app cases: Bot lifecycle

These cases belong on the `macos-14` packaged-app suite (the suite from PR #26). They drive the installed BlinkyBot.app through Compose. Selectors are stable `data-testid` values.

1. **Create two Bots.** Open the menu bar item `blinky.menu.new-bot` (English “New Bot”, Chinese “新建 Bot”) or the sidebar button `bot-create`. In `bot-editor`, set `bot-name` to `Lighthouse`, pick `bot-avatar-emoji`, write a persona in `bot-persona` (“You answer as a lighthouse keeper.”), choose `bot-model`, and press `bot-save`. Repeat for `Harbor`. Both appear as `bot-list-item` rows under `bot-list`, and each opens its own chat.
2. **Rename.** Open `bot-edit` on Lighthouse. Change `bot-name` to `Lantern` and press `bot-save`. The list row reads Lantern. The same rename is available from `bot-rename-dialog` / `bot-rename`.
3. **Persona applied in chat.** Open Lantern’s chat and ask who it is. The reply follows the persona saved in `bot-persona` (the engine still loads that text as `SOUL.md` into the identity section of the system prompt). A second chat on Harbor does not use Lantern’s persona.
4. **Delete.** From `bot-editor`, press `bot-delete`. `bot-delete-dialog` asks for the name in `bot-delete-name`; `bot-delete-confirm` stays disabled until it matches. After confirm, the row leaves `bot-list` and a new chat cannot be opened for that Bot. Harbor is still listed.

The engine entity stays `agent`. `call_agent`, Foreman orchestration, memory, skills, schedules, and approval cards are unchanged except for the words the product shows.
