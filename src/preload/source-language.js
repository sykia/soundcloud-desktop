'use strict';

const SUPPORTED = new Set(['en', 'it', 'es']);

function chooseSourceLanguage(documentLanguage, cookieLanguage) {
  const documentSource = String(documentLanguage || '').toLowerCase().split('-')[0];
  const cookieSource = SUPPORTED.has(cookieLanguage) ? cookieLanguage : 'en';
  // SoundCloud has rendered Italian labels while <html lang> still said en.
  // The explicit site preference is more trustworthy in that case.
  if (documentSource === 'en' && cookieSource !== 'en') return cookieSource;
  return SUPPORTED.has(documentSource) ? documentSource : cookieSource;
}

module.exports = { chooseSourceLanguage };
