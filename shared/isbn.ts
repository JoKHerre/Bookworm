// Keep only the characters an ISBN can contain, with an uppercase check digit X.
export function cleanIsbn(value: string): string {
  return value.replace(/[^0-9Xx]/g, "").toUpperCase();
}

// 13 digits, or 9 digits and a check digit that may be X. Doesn't verify the checksum.
export function hasIsbnShape(isbn: string): boolean {
  return /^(?:\d{13}|\d{9}[\dX])$/.test(isbn);
}

// An ISBN-13 or ISBN-10 whose check digit matches.
export function hasValidIsbnChecksum(isbn: string): boolean {
  if (/^\d{13}$/.test(isbn)) {
    const sum = [...isbn].reduce(
      (total, digit, i) => total + Number(digit) * (i % 2 === 0 ? 1 : 3),
      0,
    );
    return sum % 10 === 0;
  }
  if (/^\d{9}[\dX]$/.test(isbn)) {
    const sum = [...isbn].reduce(
      (total, char, i) => total + (char === "X" ? 10 : Number(char)) * (10 - i),
      0,
    );
    return sum % 11 === 0;
  }
  return false;
}
