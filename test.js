const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
        console.log(`[${msg.type()}] ${msg.text()}`);
    });

    try {
        await page.goto('http://localhost:8080');
        await page.waitForTimeout(5000);

        console.log('--- TEST RESULTS ---');
        console.log('Page title:', await page.title());

        const loadingHidden = await page.evaluate(() => {
            const el = document.getElementById('loadingScreen');
            return el ? el.classList.contains('hidden') : false;
        });
        console.log('Is loading screen hidden after 5s?', loadingHidden);

        console.log(`Captured ${errors.length} errors.`);
        if (errors.length > 0) {
            console.log('ERRORS:', errors);
        }
    } catch (e) {
        console.error('Failed to load page:', e);
    } finally {
        await browser.close();
    }
})();
