(async () => {
    const src = chrome.runtime.getURL('src/core/main.js');
    await import(src);
})();
