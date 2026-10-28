
const path = require('path');
const fs = require('fs');
const DEBUG_IDCARD = process.env.DEBUG_IDCARD === 'true';

function escapeXml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe).replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case "'": return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });
}

function generateBarcodeSvg() {
    // Simple barcode pattern - 2x height (20px instead of 10px)
    return `
        <rect x="0" y="0" width="2" height="20" fill="black" />
        <rect x="4" y="0" width="3" height="20" fill="black" />
        <rect x="9" y="0" width="1" height="20" fill="black" />
        <rect x="12" y="0" width="2" height="20" fill="black" />
        <rect x="16" y="0" width="4" height="20" fill="black" />
        <rect x="22" y="0" width="2" height="20" fill="black" />
        <rect x="26" y="0" width="3" height="20" fill="black" />
        <rect x="31" y="0" width="1" height="20" fill="black" />
        <rect x="34" y="0" width="2" height="20" fill="black" />
        <rect x="38" y="0" width="4" height="20" fill="black" />
        <rect x="44" y="0" width="2" height="20" fill="black" />
    `;
}

function detectMimeFromBuffer(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 4) return 'image/png';

    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        return 'image/png';
    }
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
        return 'image/jpeg';
    }
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
        return 'image/gif';
    }

    return 'image/png';
}

function toImageDataUrl(imageLike) {
    if (!imageLike) return '';

    if (typeof imageLike === 'string') {
        if (imageLike.startsWith('data:image')) return imageLike;
        return '';
    }

    if (Buffer.isBuffer(imageLike)) {
        const mime = detectMimeFromBuffer(imageLike);
        return `data:${mime};base64,${imageLike.toString('base64')}`;
    }

    return '';
}

async function generateIDCardSvg(user, includeBackground = true) {
    // Match the modal dimensions: 336x212 pixels
    const CARD_WIDTH = 336;
    const CARD_HEIGHT = 212;

    const matric = escapeXml(user.matric_no || user.staff_id || '');
    const surname = escapeXml(user.surname || '');
    const otherNames = escapeXml(user.other_names || '');
    const faculty = escapeXml(user.faculty || '');
    const department = escapeXml(user.department || '');
    const level = escapeXml(user.level || '');
    const hall = escapeXml(user.hall || '');
    const cardNumber = escapeXml(user.card_number || '');
    const session = escapeXml(user.session || '');

    const photoDataUrl = toImageDataUrl(user.passport_photo);
    const signatureDataUrl = toImageDataUrl(user.signature);

    // Load the background card template (only if includeBackground is true)
    let backgroundDataUrl = '';
    
    if (includeBackground) {
        const templatePath = path.join(__dirname, '../templates/blank_card.jpg');
        if (fs.existsSync(templatePath)) {
            try {
                const sharp = require('sharp');
                const templateBuffer = await sharp(templatePath)
                    .resize(CARD_WIDTH, CARD_HEIGHT, { fit: 'fill' })
                    .jpeg()
                    .toBuffer();
                backgroundDataUrl = `data:image/jpeg;base64,${templateBuffer.toString('base64')}`;
            } catch (err) {
                console.error('Template loading failed:', err);
            }
        }
    }

    // Create complete SVG with or without background
    // Positioning matches the modal exactly
    const svg = `
    <svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
        <!-- Background Image (only if includeBackground is true) -->
        ${backgroundDataUrl ? `<image href="${backgroundDataUrl}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" />` : `<rect width="100%" height="100%" fill="none"/>`}
        
        <style>
          .label { font-family: Arial, Helvetica, sans-serif; fill: #000; }
        </style>
        
        <!-- Text with proper spacing to align with template -->
        <text class="label" x="70" y="56" font-size="11px">${matric}</text>
        <text class="label" x="70" y="74" font-size="11px" font-weight="bold">${surname}</text>
        <text class="label" x="70" y="92" font-size="11px">${otherNames}</text>
        <text class="label" x="70" y="110" font-size="11px">${faculty}</text>
        <text class="label" x="70" y="128" font-size="11px">${department}</text>
        <text class="label" x="70" y="146" font-size="11px">${level}</text>
        <text class="label" x="70" y="164" font-size="11px">${hall}</text>
        
        <!-- Card Number at bottom left -->
        <text class="label" x="10" y="${CARD_HEIGHT - 12}" font-size="9px">${cardNumber}</text>
        
        <!-- Barcode 67pt wide, top 134.4pt (px-converted) -->
        <g transform="translate(${CARD_WIDTH / 2 - 46.39}, 186.21)">
            <svg width="92.78" height="20" viewBox="0 0 48 20" preserveAspectRatio="none">
                ${generateBarcodeSvg()}
            </svg>
        </g>
        
        <!-- Photo moved down to match reference (top: 88) -->
        ${photoDataUrl ? `<image href="${photoDataUrl}" x="${CARD_WIDTH - 12 - 78}" y="88" width="78" height="96" preserveAspectRatio="xMidYMid slice" />` : ''}
        
        <!-- Signature under photo (top: 186) -->
        ${signatureDataUrl ? `<image href="${signatureDataUrl}" x="${CARD_WIDTH - 12 - 78}" y="186" width="78" height="22" preserveAspectRatio="xMidYMid meet" />` : ''}
        
        <!-- Session on right edge, vertical and upright -->
        <text class="label" x="${CARD_WIDTH - 6}" y="95" font-size="9px" font-weight="bold" text-anchor="start" writing-mode="vertical-rl">${session}</text>
    </svg>
    `;

    return svg;
}

async function generateIDCardOverlay(user, includeBackground = true) {
    const svg = await generateIDCardSvg(user, includeBackground);

    if (DEBUG_IDCARD) {
        try {
            const debugDir = path.join(__dirname, '..', 'debug');
            if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
            const svgPath = path.join(debugDir, `card_${user.id || 'unknown'}_${includeBackground ? 'with' : 'without'}_background.svg`);
            fs.writeFileSync(svgPath, svg, 'utf8');
        } catch (err) {
            // ignore debug write errors
        }
    }

    // Convert complete SVG (with or without background) to PNG
    const sharp = require('sharp');
    const finalBuffer = await sharp(Buffer.from(svg))
        .png()
        .toBuffer();

    if (DEBUG_IDCARD) {
        try {
            const debugDir = path.join(__dirname, '..', 'debug');
            const outPath = path.join(debugDir, `card_${user.id || 'unknown'}_${includeBackground ? 'with' : 'without'}_background.png`);
            fs.writeFileSync(outPath, finalBuffer);
            console.log(`✅ Debug card saved: ${outPath}`);
        } catch (err) {
            // ignore debug write errors
        }
    }

    return finalBuffer;
}

module.exports = generateIDCardOverlay;
module.exports.generateIDCardSvg = generateIDCardSvg;