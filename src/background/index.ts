/**
 * Background service worker. It has a single job: opening (or focusing) the
 * full Unique PDF tab. It never touches documents and makes no network calls.
 */
const APP_PATH = 'app.html';

async function openApp(hash = ''): Promise<void> {
  const url = chrome.runtime.getURL(`${APP_PATH}${hash}`);
  try {
    // documentUrls only takes exact URLs (no wildcards, and the hash differs), so filter here.
    const appUrl = chrome.runtime.getURL(APP_PATH);
    const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.TAB] });
    const existing = contexts.find((c) => c.tabId !== undefined && c.tabId >= 0 && !!c.documentUrl?.startsWith(appUrl));
    if (existing?.tabId !== undefined) {
      await chrome.tabs.update(existing.tabId, { active: true, ...(hash ? { url } : {}) });
      if (existing.windowId !== undefined && existing.windowId >= 0) await chrome.windows.update(existing.windowId, { focused: true });
      return;
    }
  } catch {
    // getContexts unavailable: fall through to opening a new tab.
  }
  await chrome.tabs.create({ url });
}

chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-app') void openApp();
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) void openApp('#/');
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  // Only accept messages from this extension's own pages.
  if (sender.id !== chrome.runtime.id) return false;
  const msg = message as { type?: string; hash?: string };
  if (msg?.type === 'open-app') {
    const hash = typeof msg.hash === 'string' && /^#\/[a-z0-9/-]*$/.test(msg.hash) ? msg.hash : '';
    void openApp(hash).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});
