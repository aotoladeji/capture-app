<?php

namespace App\Services;

/**
 * Faithful port of server/utils/idCardGenerator.js.
 * Produces the exact same SVG markup (dimensions, text positions, barcode)
 * as the original, then rasterizes it to PNG with Imagick (replacing the
 * original's `sharp`).
 */
class IdCardGeneratorService
{
    private const CARD_WIDTH = 336;

    private const CARD_HEIGHT = 212;

    private function escapeXml(?string $value): string
    {
        if (! $value) {
            return '';
        }

        return str_replace(
            ['&', '<', '>', "'", '"'],
            ['&amp;', '&lt;', '&gt;', '&apos;', '&quot;'],
            (string) $value
        );
    }

    private function generateBarcodeSvg(): string
    {
        return '
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
        ';
    }

    private function detectMimeFromBinary(string $binary): string
    {
        if (strlen($binary) < 4) {
            return 'image/png';
        }

        $bytes = array_map('ord', str_split(substr($binary, 0, 4)));

        if ($bytes[0] === 0x89 && $bytes[1] === 0x50 && $bytes[2] === 0x4E && $bytes[3] === 0x47) {
            return 'image/png';
        }
        if ($bytes[0] === 0xFF && $bytes[1] === 0xD8) {
            return 'image/jpeg';
        }
        if ($bytes[0] === 0x47 && $bytes[1] === 0x49 && $bytes[2] === 0x46) {
            return 'image/gif';
        }

        return 'image/png';
    }

    /**
     * @param  string|null  $imageLike  Either raw binary (from a DB blob) or
     *                                  an existing "data:image/...;base64,..." string.
     */
    private function toImageDataUrl(?string $imageLike): string
    {
        if (! $imageLike) {
            return '';
        }

        if (str_starts_with($imageLike, 'data:image')) {
            return $imageLike;
        }

        $mime = $this->detectMimeFromBinary($imageLike);

        return "data:{$mime};base64,".base64_encode($imageLike);
    }

    /**
     * @param  object  $user  Row with surname/other_names/matric_no/etc.
     *                        passport_photo/signature should be raw binary
     *                        (already decoded from base64 if needed) or null.
     */
    public function generateSvg(object $user, bool $includeBackground = true): string
    {
        $matric = $this->escapeXml($user->matric_no ?? $user->staff_id ?? '');
        $surname = $this->escapeXml($user->surname ?? '');
        $otherNames = $this->escapeXml($user->other_names ?? '');
        $faculty = $this->escapeXml($user->faculty ?? '');
        $department = $this->escapeXml($user->department ?? '');
        $level = $this->escapeXml($user->level ?? '');
        $hall = $this->escapeXml($user->hall ?? '');
        $cardNumber = $this->escapeXml($user->card_number ?? '');
        $session = $this->escapeXml($user->session ?? '');

        $photoDataUrl = $this->toImageDataUrl($user->passport_photo ?? null);
        $signatureDataUrl = $this->toImageDataUrl($user->signature ?? null);

        $backgroundDataUrl = '';

        if ($includeBackground) {
            $templatePath = storage_path('app/templates/blank_card.jpg');
            if (file_exists($templatePath)) {
                try {
                    if (extension_loaded('imagick')) {
                        $imagick = new \Imagick($templatePath);
                        $imagick->resizeImage(self::CARD_WIDTH, self::CARD_HEIGHT, \Imagick::FILTER_LANCZOS, 1, false);
                        $imagick->setImageFormat('jpeg');
                        $backgroundDataUrl = 'data:image/jpeg;base64,'.base64_encode($imagick->getImageBlob());
                        $imagick->clear();
                    } else {
                        // Without Imagick, fall back to the raw template (won't be
                        // resized, but keeps the card visually usable).
                        $backgroundDataUrl = 'data:image/jpeg;base64,'.base64_encode(file_get_contents($templatePath));
                    }
                } catch (\Throwable $e) {
                    report($e);
                }
            }
        }

        $backgroundTag = $backgroundDataUrl
            ? '<image href="'.$backgroundDataUrl.'" width="'.self::CARD_WIDTH.'" height="'.self::CARD_HEIGHT.'" />'
            : '<rect width="100%" height="100%" fill="none"/>';

        $photoTag = $photoDataUrl
            ? '<image href="'.$photoDataUrl.'" x="'.(self::CARD_WIDTH - 12 - 78).'" y="88" width="78" height="96" preserveAspectRatio="xMidYMid slice" />'
            : '';

        $signatureTag = $signatureDataUrl
            ? '<image href="'.$signatureDataUrl.'" x="'.(self::CARD_WIDTH - 12 - 78).'" y="186" width="78" height="22" preserveAspectRatio="xMidYMid meet" />'
            : '';

        $barcodeWidth = 92.78;
        $barcodeX = (self::CARD_WIDTH / 2) - ($barcodeWidth / 2);
        $barcodeY = 186.21;
        $cardNumberY = self::CARD_HEIGHT - 12;
        $cardWidth = self::CARD_WIDTH;
        $cardHeight = self::CARD_HEIGHT;
        $sessionX = self::CARD_WIDTH - 6;

        return <<<SVG
    <svg width="{$cardWidth}" height="{$cardHeight}" viewBox="0 0 {$cardWidth} {$cardHeight}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
        <!-- Background Image (only if includeBackground is true) -->
        {$backgroundTag}

        <style>
          .label { font-family: Arial, Helvetica, sans-serif; fill: #000; }
        </style>

        <!-- Text with proper spacing to align with template -->
        <text class="label" x="74.7" y="73.5" font-size="11px"font-weight="bold">{$matric}</text>
        <text class="label" x="74.7" y="92" font-size="11px" font-weight="bold">{$surname}</text>
        <text class="label" x="74.7" y="111" font-size="11px"font-weight="bold">{$otherNames}</text>
        <text class="label" x="74.7" y="129" font-size="11px"font-weight="bold">{$faculty}</text>
        <text class="label" x="74.7" y="146" font-size="11px"font-weight="bold">{$department}</text>
        <text class="label" x="74.7" y="164" font-size="11px"font-weight="bold">{$level}</text>
        <text class="label" x="74.7" y="182.5" font-size="11px"font-weight="bold">{$hall}</text>

        <!-- Card Number at bottom left -->
        <text class="label" x="10" y="{$cardNumberY}" font-size="9px">{$cardNumber}</text>

        <!-- Barcode 67pt wide, top 134.4pt (px-converted) -->
        <g transform="translate({$barcodeX}, {$barcodeY})">
            <svg width="{$barcodeWidth}" height="20" viewBox="0 0 48 20" preserveAspectRatio="none">
                {$this->generateBarcodeSvg()}
            </svg>
        </g>

        <!-- Photo moved down to match reference (top: 88) -->
        {$photoTag}

        <!-- Signature under photo (top: 186) -->
        {$signatureTag}

        <!-- Session on right edge, vertical and upright -->
        <text class="label" x="{$sessionX}" y="95" font-size="9px" font-weight="bold" text-anchor="start" writing-mode="vertical-rl">{$session}</text>
    </svg>
    SVG;
    }

    /**
     * Rasterize the generated SVG to a PNG binary string (matches
     * generateIDCardOverlay in the original file).
     */
    public function generatePng(object $user, bool $includeBackground = true): string
    {
        $svg = $this->generateSvg($user, $includeBackground);

        if (! extension_loaded('imagick')) {
            throw new \RuntimeException('The imagick PHP extension is required to rasterize ID cards to PNG.');
        }

        $imagick = new \Imagick;
        $imagick->setBackgroundColor(new \ImagickPixel('transparent'));
        $imagick->readImageBlob($svg);
        $imagick->setImageFormat('png32');
        $png = $imagick->getImageBlob();
        $imagick->clear();

        return $png;
    }
}
