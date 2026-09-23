// Pure TypeScript Code 128 (Subset B) Barcode Generator for High-Contrast Thermal Printing
// Generates SVG rect elements or binary bar sequences (1 = bar, 0 = space)

const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112"
];

const START_CODE_B = 104;
const STOP_CODE = 106;

export interface BarcodeBar {
  x: number;
  width: number;
}

export function generateCode128Bars(text: string, totalWidth: number): BarcodeBar[] {
  if (!text) return [];

  const charCodes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i) - 32;
    if (code >= 0 && code <= 95) {
      charCodes.push(code);
    } else {
      // Fallback for non-ASCII
      charCodes.push(31); // '?'
    }
  }

  // Calculate checksum: Start code + sum(index * code) % 103
  let checksum = START_CODE_B;
  for (let i = 0; i < charCodes.length; i++) {
    checksum += (i + 1) * charCodes[i];
  }
  const checkCode = checksum % 103;

  // Build widths string
  const sequence: number[] = [START_CODE_B, ...charCodes, checkCode, STOP_CODE];
  let patternString = "";
  for (const code of sequence) {
    patternString += CODE128_PATTERNS[code] || "111111";
  }

  // Total modules in pattern
  let totalModules = 0;
  for (let i = 0; i < patternString.length; i++) {
    totalModules += parseInt(patternString[i], 10);
  }

  // Quiet zones (10 modules on each side)
  const quietZoneModules = 10;
  const fullModules = totalModules + (quietZoneModules * 2);
  const moduleWidth = totalWidth / fullModules;

  const bars: BarcodeBar[] = [];
  let currentX = quietZoneModules * moduleWidth;

  for (let i = 0; i < patternString.length; i++) {
    const width = parseInt(patternString[i], 10) * moduleWidth;
    const isBar = i % 2 === 0; // Even index = bar (black), Odd = space (white)
    if (isBar) {
      bars.push({
        x: Math.round(currentX * 100) / 100,
        width: Math.max(1, Math.round(width * 100) / 100)
      });
    }
    currentX += width;
  }

  return bars;
}
