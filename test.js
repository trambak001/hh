const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch({
        args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream'
        ]
    });
    const context = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
        console.log(`[${msg.type()}] ${msg.text()}`);
    });

    try {
        await page.goto('https://trambak001.github.io/hh/');
        await page.waitForTimeout(5000);

        // Simulate hand landmarks to force gesture loop execution
        await page.evaluate(() => {
            if (window.app) {
                const fakeLandmarks = Array(21).fill({ x: 0.5, y: 0.5, z: 0 });
                setInterval(() => {
                    window.app._onHandResults({
                        multiHandLandmarks: [fakeLandmarks]
                    });
                }, 100);
            }
        });
        await page.waitForTimeout(2000);

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
