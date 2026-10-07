'use strict';

// Keep matching independent of the SoundCloud page so the automatic choice
// can be checked without opening a live account.
function normalized(value) {
  return String(value || '').trim().toLocaleLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function exactMatch(item, candidate) {
  return Boolean(item.artist && normalized(item.title) === normalized(candidate.title) &&
    normalized(item.artist) === normalized(candidate.artist));
}

const VERSION_WORDS = /\b(remix|nightcore|cover|karaoke|instrumental|bootleg|mashup|slowed|sped up|reverb|live|edit|flip)\b/g;

function matchScore(item, candidate) {
  const title = normalized(item.title);
  const candidateTitle = normalized(candidate.title);
  const artist = normalized(item.artist);
  const candidateArtist = normalized(candidate.artist);
  if (!title || !artist || !candidateTitle) return 0;
  const sourceVersions = new Set(title.match(VERSION_WORDS) || []);
  if ((candidateTitle.match(VERSION_WORDS) || []).some(word => !sourceVersions.has(word))) return 0;
  const primaryArtist = normalized(item.artist.split(/,|&| feat\.? | featuring /i)[0]);
  const titleWithArtist = primaryArtist && candidateTitle === `${primaryArtist} ${title}`;
  const titleScore = candidateTitle === title || titleWithArtist ? 0.68 :
    candidateTitle.startsWith(`${title} `) || candidateTitle.endsWith(` ${title}`) ? 0.48 : 0;
  const artistScore = candidateArtist === artist ? 0.32 :
    candidateArtist && item.artist.split(/,|&| feat\.? | featuring /i)
      .some(part => normalized(part) === candidateArtist) ? 0.28 :
      titleWithArtist ? 0.25 : 0;
  return titleScore + artistScore;
}

function autoMatch(item, candidates) {
  const ranked = candidates.map(candidate => ({ candidate, score: matchScore(item, candidate) }))
    .sort((a, b) => b.score - a.score);
  if (!ranked.length || ranked[0].score < 0.88) return null;
  const second = ranked[1];
  if (second && second.score >= ranked[0].score - 0.05 &&
      (normalized(second.candidate.title) !== normalized(ranked[0].candidate.title) ||
       normalized(second.candidate.artist) !== normalized(ranked[0].candidate.artist))) return null;
  return ranked[0].candidate;
}

module.exports = { normalized, exactMatch, autoMatch };
