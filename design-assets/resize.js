const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const inputPath = path.join(__dirname, 'out', 'icon_128.png');
const outputDir = path.join(__dirname, '..', 'src', 'assets');

const sizes = [16, 32, 48, 128];

async function generateIcons() {
    console.log('Starting icon resizing...');
    for (const size of sizes) {
        const outputPath = path.join(outputDir, `icon${size}.png`);
        await sharp(inputPath)
            .resize(size, size, {
                kernel: sharp.kernel.lanczos3,
            })
            .toFile(outputPath);
        console.log(`✓ Saved icon${size}.png`);
    }
    console.log('All icons resized successfully!');
}

generateIcons().catch(console.error);
