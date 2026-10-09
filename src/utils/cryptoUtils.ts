/**
 * SHA-256 Password Cryptographic Hashing Utilities
 * 
 * Provides irreversible cryptographic hashing for student and superuser passwords.
 * Plain-text passwords will NEVER be saved to Firebase Firestore or exposed in UI states.
 * Even if an old client accesses the database, it will only see an irreversible 64-char SHA-256 hash.
 */

// Helper to compute raw SHA-256 hex via Web Crypto API
async function computeSubtleSha256(message: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
    const msgUint8 = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return fallbackSha256(message);
}

// Pure JS fallback SHA-256 implementation (standard RFC 6234)
function fallbackSha256(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;
  let i: number, j: number;
  let result = '';

  let hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  let compositeClearHex = '';
  words[asciiBitLength >> 5] |= 0x80 << (24 - (asciiBitLength % 32));
  words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;

  for (i = 0; i < words.length; i += 16) {
    const w = words.slice(i, i + 16);
    const oldHash = hash.slice(0);

    for (i = 0; i < 64; i++) {
      const i2 = i + 0;
      const w15 = w[i - 15], w2 = w[i - 2];

      const a = hash[0], e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);

      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

      hash = [(temp1 + temp2) | 0, a, hash[1], hash[2], (hash[3] + temp1) | 0, hash[4], hash[5], hash[6]];
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

/**
 * Irreversibly hash a plain-text password using SHA-256 with project salt.
 * Output format: "sha256:<64-hex-characters>"
 */
export async function hashPassword(plainText: string): Promise<string> {
  const clean = (plainText || '').trim();
  if (!clean) return '';
  // Salt ensures rainbow table resistance
  const salted = `finmind_nt50m_salt_${clean}`;
  const hex = await computeSubtleSha256(salted);
  return `sha256:${hex}`;
}

/**
 * Verify whether an input password matches the stored password hash (or legacy plain text).
 */
export async function verifyPassword(inputPassword: string, storedValue?: string | null): Promise<boolean> {
  const cleanInput = (inputPassword || '').trim();
  const cleanStored = (storedValue || '').trim();

  // If both empty
  if (!cleanInput && !cleanStored) return true;
  if (!cleanInput || !cleanStored) return false;

  // 1. Stored format: sha256:<hex>
  if (cleanStored.startsWith('sha256:')) {
    const computed = await hashPassword(cleanInput);
    return computed === cleanStored;
  }

  // 2. Stored format: 64-character raw hex
  if (/^[a-f0-9]{64}$/i.test(cleanStored)) {
    const computedWithSalt = (await hashPassword(cleanInput)).replace('sha256:', '');
    if (computedWithSalt.toLowerCase() === cleanStored.toLowerCase()) return true;
    const rawUnsalted = await computeSubtleSha256(cleanInput);
    return rawUnsalted.toLowerCase() === cleanStored.toLowerCase();
  }

  // 3. Backward compatibility migration: If the document still holds legacy plain text
  return cleanInput === cleanStored;
}

/**
 * Check if a stored string is already in SHA-256 format
 */
export function isHashedPassword(value?: string | null): boolean {
  if (!value) return false;
  return value.startsWith('sha256:') || /^[a-f0-9]{64}$/i.test(value);
}
