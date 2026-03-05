const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const outDir = path.join(__dirname, 'out');

async function checkSizes() {
    const files = fs.readdirSync(outDir).filter(f => f.endsWith('.png'));
    for (const file of files) {
        const metadata = await sharp(path.join(outDir, file)).metadata();
        console.log(`${file}: ${metadata.width}x${metadata.height}`);
    }
}

checkSizes().catch(console.error);
