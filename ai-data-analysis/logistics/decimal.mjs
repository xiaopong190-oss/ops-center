// Fixed-point decimal arithmetic backed by BigInt (scale = 6 for weights/prices/intermediates)
// Zero floating-point drift for freight calculation, currency rounding, and cent-exact allocation.

export const SCALE = 6;
const SCALE_FACTOR = 10n ** BigInt(SCALE);
export const MAX_ABS_VALUE = 1_000_000_000n * SCALE_FACTOR; // 1e9 upper bound

export const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND']);
export const SUPPORTED_UNITS = new Set(['kg', 'lb', 'g', 'cbm']);

export function currencyDecimals(currency) {
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) {
    throw new Error(`无效币种: ${String(currency)}`);
  }
  return ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2;
}

export function normalizeCurrency(currency) {
  if (typeof currency !== 'string') return null;
  const code = currency.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

export function normalizeUnit(unit) {
  if (typeof unit !== 'string') return null;
  const u = unit.trim().toLowerCase();
  return SUPPORTED_UNITS.has(u) ? u : null;
}

/**
 * Parse a decimal string or finite number into scaled BigInt (scale = 6).
 * Rejects NaN, Infinity, scientific notation with invalid format, or values exceeding MAX_ABS_VALUE.
 */
export function parseDecimal(value, { allowNegative = false, allowZero = true, maxScale = SCALE } = {}) {
  if (value === null || value === undefined || value === '') {
    throw new Error('数值缺失');
  }
  let str;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('数值非法');
    str = value.toString();
    if (/[eE]/.test(str)) {
      // Avoid precision loss for extreme numbers; convert small scientific numbers safely
      str = value.toFixed(SCALE);
    }
  } else if (typeof value === 'bigint') {
    str = value.toString();
  } else if (typeof value === 'string') {
    str = value.trim();
  } else {
    throw new Error('数值类型无效');
  }

  const match = /^([+-])?(\d+)(?:\.(\d+))?$/.exec(str);
  if (!match) {
    throw new Error(`数值格式无效: ${str}`);
  }
  const sign = match[1] === '-' ? -1n : 1n;
  const intPart = match[2];
  const fracPart = match[3] || '';
  if (fracPart.length > maxScale) {
    throw new Error(`小数位超过允许精度(${maxScale}): ${str}`);
  }
  const paddedFrac = fracPart.padEnd(SCALE, '0');
  const scaled = sign * (BigInt(intPart) * SCALE_FACTOR + BigInt(paddedFrac));
  if (scaled < -MAX_ABS_VALUE || scaled > MAX_ABS_VALUE) {
    throw new Error(`数值超出允许范围: ${str}`);
  }
  if (!allowNegative && scaled < 0n) {
    throw new Error(`不允许负值: ${str}`);
  }
  if (!allowZero && scaled === 0n) {
    throw new Error(`不允许零值: ${str}`);
  }
  return scaled;
}

/**
 * Format a scaled BigInt (scale = 6) to a canonical string with `decimals` places (Half-Up rounding).
 */
export function roundScaledToMinor(scaled, decimals) {
  const shift = SCALE - decimals;
  if (shift < 0) throw new Error('目标小数位大于内部精度');
  if (shift === 0) return scaled;
  const divisor = 10n ** BigInt(shift);
  const half = divisor / 2n;
  const neg = scaled < 0n;
  const abs = neg ? -scaled : scaled;
  const q = abs / divisor;
  const r = abs % divisor;
  const rounded = r >= half ? q + 1n : q;
  return neg ? -rounded : rounded;
}

export function formatMinor(minor, decimals) {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  if (decimals === 0) {
    return (neg && abs !== 0n ? '-' : '') + abs.toString();
  }
  const factor = 10n ** BigInt(decimals);
  const intPart = abs / factor;
  const fracPart = (abs % factor).toString().padStart(decimals, '0');
  const sign = neg && abs !== 0n ? '-' : '';
  return `${sign}${intPart.toString()}.${fracPart}`;
}

export function formatScaled(scaled, decimals = SCALE, trimTrailingZeros = false) {
  const minor = roundScaledToMinor(scaled, decimals);
  let out = formatMinor(minor, decimals);
  if (trimTrailingZeros && decimals > 0) {
    out = out.replace(/\.?0+$/, '');
    if (out === '-0') out = '0';
  }
  return out;
}

/**
 * Multiply two scale-6 BigInts -> returns scale-12 BigInt, then rounds Half-Up to currency minor units.
 */
export function multiplyToCurrency(weightScaled, unitPriceScaled, currency) {
  const decimals = currencyDecimals(currency);
  const product12 = weightScaled * unitPriceScaled; // scale = 12
  const shift = 12 - decimals;
  const divisor = 10n ** BigInt(shift);
  const half = divisor / 2n;
  const neg = product12 < 0n;
  const abs = neg ? -product12 : product12;
  const q = abs / divisor;
  const r = abs % divisor;
  const minor = (neg ? -1n : 1n) * (r >= half ? q + 1n : q);
  return {
    minor,
    decimals,
    formatted: formatMinor(minor, decimals),
    exactScaled12: product12.toString()
  };
}

export function parseCurrencyToMinor(value, currency, { allowNegative = false, allowZero = true } = {}) {
  const decimals = currencyDecimals(currency);
  const scaled = parseDecimal(value, { allowNegative, allowZero, maxScale: decimals });
  return roundScaledToMinor(scaled, decimals);
}

/**
 * Allocate `totalMinor` across `weights` (array of positive BigInt/number) using Largest Remainder Method.
 * Guarantees sum(allocations) === totalMinor with zero cent drift.
 */
export function allocateMinor(totalMinor, weights) {
  if (!Array.isArray(weights) || weights.length === 0) {
    throw new Error('分摊目标不能为空');
  }
  const bigWeights = weights.map(w => {
    const bw = typeof w === 'bigint' ? w : parseDecimal(w, { allowNegative: false, allowZero: false });
    if (bw <= 0n) throw new Error('分摊权重必须大于 0');
    return bw;
  });
  const totalWeight = bigWeights.reduce((a, b) => a + b, 0n);
  const neg = totalMinor < 0n;
  const absTotal = neg ? -totalMinor : totalMinor;

  const base = [];
  const remainders = [];
  let sumBase = 0n;
  for (let i = 0; i < bigWeights.length; i++) {
    const num = absTotal * bigWeights[i];
    const q = num / totalWeight;
    const rem = num % totalWeight;
    base.push(q);
    remainders.push({ index: i, rem });
    sumBase += q;
  }

  let leftover = absTotal - sumBase;
  remainders.sort((a, b) => (b.rem > a.rem ? 1 : b.rem < a.rem ? -1 : a.index - b.index));
  for (let i = 0; leftover > 0n; i++, leftover -= 1n) {
    base[remainders[i].index] += 1n;
  }

  return base.map(v => (neg ? -v : v));
}

export function minorToDecimalString(minor, currency) {
  return formatMinor(minor, currencyDecimals(currency));
}

