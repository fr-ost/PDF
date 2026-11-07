// The options page simply opens the full app on its Settings screen.
const target = typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL('app.html#/settings') : '/app.html#/settings';
location.replace(target);
