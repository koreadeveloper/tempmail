/**
 * OTP / verification-code extractor. Pure function.
 *
 * Searches subject + body_text + body_html (tags stripped), concatenated in
 * that order so matches in body_text are preferred over HTML-derived matches.
 *
 * Search order:
 *  1. Keyword-adjacent code ("인증번호 1234", "verification code: 123456", ...)
 *  2. Standalone 6-digit number
 *  3. Standalone 4–8 digit number, skipping years (1900–2099) and fragments
 *     of longer numbers (e.g. "1234-5678", "1,2345", "123.4567").
 * Returns the first match or null.
 */

const KEYWORD_RE =
    /(?:인증\s*(?:번호|코드)|verification\s*code|confirm(?:ation)?\s*code|passcode|otp|code|코드)[^\d]{0,20}(\d{4,8})/i;
const SIX_DIGIT_RE = /\b(\d{6})\b/;
const ISOLATED_DIGIT_RE = /\b(\d{4,8})\b/g;
const YEAR_RE = /^(?:19|20)\d{2}$/;

function stripTags(html: string): string {
    return html.replace(/<[^>]*>/g, ' ');
}

/**
 * True if the match at [index, index+len) is glued to more digits through a
 * separator — meaning it is a fragment of a longer number (card, phone,
 * decimal, date) rather than a standalone code.
 */
function partOfLongerNumber(src: string, index: number, len: number): boolean {
    const before = src[index - 1];
    if (before && /[.,:\- ]/.test(before) && /\d/.test(src[index - 2] ?? '')) {
        return true;
    }
    const after = src[index + len];
    if (after && /[.,:\- ]/.test(after) && /\d/.test(src[index + len + 1] ?? '')) {
        return true;
    }
    return false;
}

export function extractOtp(email: {
    subject?: string;
    body_text?: string;
    body_html?: string;
}): string | null {
    const combined = [
        email.subject ?? '',
        email.body_text ?? '',
        stripTags(email.body_html ?? ''),
    ].join('\n');

    // 1. keyword-adjacent code
    const keywordMatch = combined.match(KEYWORD_RE);
    if (keywordMatch) return keywordMatch[1];

    // 2. standalone 6-digit number
    const sixMatch = combined.match(SIX_DIGIT_RE);
    if (sixMatch) return sixMatch[1];

    // 3. isolated 4–8 digit number (skip years / longer-number fragments)
    ISOLATED_DIGIT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ISOLATED_DIGIT_RE.exec(combined)) !== null) {
        const code = m[1];
        if (YEAR_RE.test(code)) continue;
        if (partOfLongerNumber(combined, m.index, code.length)) continue;
        return code;
    }

    return null;
}
