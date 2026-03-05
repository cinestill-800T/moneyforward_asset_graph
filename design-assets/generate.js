const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, 'out');
const HTML_FILE = `file://${path.join(__dirname, 'generator.html')}`;

const ASSETS = [
    { id: '#icon-128', filename: 'ストアアイコン_128x128.png', width: 128, height: 128, isIcon: true },
    { id: '#promo-440', filename: 'プロモーションタイル小_440x280.png', width: 440, height: 280 },
    { id: '#marquee-1400', filename: 'プロモーションタイル大_1400x560.png', width: 1400, height: 560 },
    { id: '#screenshot-1280', filename: 'スクリーンショット_1280x800.png', width: 1280, height: 800 }
];

const sharp = require('sharp');

async function generateAssets() {
    console.log('Starting asset generation...');

    // Ensure output directory exists
    if (!fs.existsSync(OUT_DIR)) {
        fs.mkdirSync(OUT_DIR, { recursive: true });
    }

    const browser = await puppeteer.launch({
        headless: "new",
        defaultViewport: {
            width: 1920,
            height: 1080,
            deviceScaleFactor: 2 // Retain high quality
        }
    });

    try {
        const page = await browser.newPage();
        console.log(`Loading template: ${HTML_FILE}`);
        await page.goto(HTML_FILE, { waitUntil: 'networkidle0' });

        for (const asset of ASSETS) {
            console.log(`Capturing ${asset.filename}...`);
            const element = await page.$(asset.id);

            if (!element) {
                console.error(`Element ${asset.id} not found!`);
                continue;
            }

            const buffer = await element.screenshot({
                omitBackground: true // Allow transparent background if needed
            });

            const outputPath = path.join(OUT_DIR, asset.filename);
            await sharp(buffer)
                .flatten({ background: '#ffffff' })
                .resize(asset.width, asset.height, { kernel: sharp.kernel.lanczos3 })
                .toFile(outputPath);

            console.log(`✓ Saved ${asset.filename} (${asset.width}x${asset.height})`);

            if (asset.isIcon) {
                const iconDir = path.join(__dirname, '..', 'src', 'assets');
                // The extension icons keep transparent backgrounds, so we skip flatten for them
                const buffer128 = await sharp(buffer).resize(128, 128, { kernel: sharp.kernel.lanczos3 }).toBuffer();
                for (const size of [16, 32, 48, 128]) {
                    await sharp(buffer128)
                        .resize(size, size, { kernel: sharp.kernel.lanczos3 })
                        .toFile(path.join(iconDir, `icon${size}.png`));
                    console.log(`  ↳ Saved src/assets/icon${size}.png`);
                }
            }
        }

        console.log('\nAll assets generated successfully in the "out" directory!');

    } catch (error) {
        console.error('Error generating assets:', error);
    } finally {
        await browser.close();
    }
}

generateAssets();
