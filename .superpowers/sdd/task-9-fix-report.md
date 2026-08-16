# Task 9 Fix Report

## A — Dual playback mode (proxyGerekli)

Added `proxyGerekli(streamUrl)` helper in `app/page.tsx`. When it returns `false`, `handleSelect` sets `src` directly to `channel.url` and skips the `/api/sign` round trip entirely. The stale-response guard (`selectedIdRef.current`) is checked in both branches before applying state. The function respects `NEXT_PUBLIC_FORCE_PROXY=1` to force proxy mode.

Added `NEXT_PUBLIC_FORCE_PROXY=` to `.env.example` with a Turkish comment explaining its purpose.

## B1 — Three unhandled rejections

- `handleSelect` `/api/sign` fetch: wrapped in `try/catch`. Transport errors and non-OK responses both surface a Turkish error string with a retry instruction. The stale-response guard applies to both error paths — a failed request for channel A does not paint an error over a newly selected channel B.
- `loadChannels().then(...)`: added `.catch()`. On failure, sets `dbError` state and renders a Turkish error explaining private/blocked storage.
- `saveChannels` in `PlaylistForm`: moved inside the existing `try` block (it was outside). On `QuotaExceededError` or any write failure, calls `clearChannels()` to prevent a truncated playlist from appearing on next load, then surfaces a Turkish error.

## B2 — "N kayıt atlandı" never appears

`onLoaded` signature extended to `(channels: Channel[], skipped?: number)`. `PlaylistForm.handleSubmit` passes `skippedCount` as second argument and no longer tries to display the notice itself (form unmounts immediately). `page.tsx` stores the count in `skippedNotice` state and renders a dismissible banner in the main layout (above the tab panel area) with an ✕ button.

## B3 — Shared ChannelList instance across tabs

Added `key={activeTab}` to `<ChannelList>` in `page.tsx`. Each tab switch mounts a fresh instance with empty search/group/scroll state.

## B4 — Arrow-key tab navigation does not move DOM focus

Added `tabRefs` (`useRef<(HTMLButtonElement | null)[]>`) in `page.tsx`. Replaced `setActiveTab` calls with `activateTab(kind)` which calls `setActiveTab` and then `tabRefs.current[idx]?.focus()`. Added `ref={(el) => { tabRefs.current[i] = el; }}` to each tab button. Added `Home`/`End` key handlers to the `onKeyDown` on the nav. Added `aria-controls={tabpanel-${kind}}` to each tab button. Added `role="tabpanel"` and `aria-labelledby={activeTab}` to the `<aside>` wrapping the list.

## B5 — Channel list not arrow-key navigable

Implemented roving tabIndex in `ChannelList`. Added `focusedIdx` state (tracks focused row index) and `rowRefs` (Map from index to button element). `moveFocus(nextIdx)` clamps, sets state, calls `virtualizer.scrollToIndex`, then uses `requestAnimationFrame` to call `.focus()` on the target row after the DOM update. `onKeyDown` on the scroll container handles ArrowUp/ArrowDown/Home/End. The scroll container bubbles keyboard events from child buttons. Each `ChannelRow` receives `isFocused` and renders `tabIndex={isFocused ? 0 : -1}`. The `onFocus` prop updates `focusedIdx` when a row receives focus by any means (mouse click, tab). `registerRef` prop wires the button into `rowRefs`.

## B6 — Touch/zoom violations and missing visible labels

Search input: `h-9` → `h-11`, kept `text-base` (already correct). Removed `aria-label` (replaced by explicit `<label htmlFor={searchId}>`). Group select: `h-9` → `h-11`, `text-sm` → `text-base`. Added `<label htmlFor={groupId}>` visible label. Used React's built-in `useId()` for stable ids.

## B7 — False security notice

Replaced the existing text ("hiçbir sunucuya veya üçüncü tarafa iletilmez") with an accurate Turkish statement: the address is sent only to this app's own server for parsing, is never stored there, and is kept only in the browser.

## C — Minor fixes

- **Padding consistency**: Both selected and unselected rows now use `pl-[9px] pr-3` with `border-l-[3px]` always present. Content left offset is uniform (3+9=12px) regardless of selection state.
- **key by channel.id**: Added `getItemKey: (index) => filtered[index]!.id` to `useVirtualizer`. The wrapping div still uses `key={vRow.key}` which is now the channel id, so `ChannelRow`'s `logoError` state does not persist across filter changes.
- **Tab count always shown**: Removed `{count > 0 && …}` guard; count is always rendered unconditionally.
- **autoComplete="off"** added to playlist URL input.
- **Empty submit feedback**: Added `urlEmpty` state. When submitted with no URL, shows a Turkish error message and returns focus to the input, rather than silently doing nothing.
- **No-op ternary**: `channels.length > 0 ? channels : []` → `channels` (both branches returned the same reference anyway).
- **focus-visible styling**: Added `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring` to tab buttons and the reset button in `page.tsx`. Added `focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring` to channel rows in `ChannelList`. Added same to the submit button in `PlaylistForm`.
- **aria-current instead of aria-pressed**: `aria-pressed={isSelected}` → `aria-current={isSelected ? "true" : undefined}` on channel rows.

## Preserved behaviours

- **Virtualization**: The only map over channel data is still `items.map((vRow) => ...)` where `items = virtualizer.getVirtualItems()`. Unchanged.
- **Referential stability**: `activeChannels()` still returns `liveChannels`, `movieChannels`, or `seriesChannels` by reference (no spread). `handleSelect` is still `useCallback` with empty deps.
- **selectedIdRef synchronous write**: `selectedIdRef.current = channel.id` is still the very first statement in `handleSelect`, before any `await` or branch.
- **Chunked bulkPut with setTimeout(0)**: `lib/db.ts` was not modified.
- **Both eslint-disable-next-line comments**: Both are preserved exactly.

## Verification output

- `npx tsc --noEmit`: clean (no output)
- `npm run lint`: clean (no output beyond the script header)
- `npm test`: 60/60 tests passed
- `npm run build`: succeeded, all 7 pages/routes generated without errors
- `TOFI_SECRET` in `.next/static/`: not found

## Items not completed

None. All A, B1–B7, and C items were implemented.

## Deliberate non-changes

- `estimateSize: 56` — left unchanged (plan-mandated)
- `flex-col-reverse` mobile order — left unchanged (layout redesign, out of scope)
- `lib/db.ts` — not modified (chunked bulkPut + setTimeout(0) preserved as instructed)
