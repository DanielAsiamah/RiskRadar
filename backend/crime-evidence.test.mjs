import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildEvidenceView,
  buildStructuredRiskSignals,
  isValidPersistentId,
  sanitizeOutcomeName,
} from './crime-evidence.mjs';

const persistentId = '6cb86a296314097b408145e16e2d1e0a0062f7872d9d721456d84cdd7fd4e224';

test('accepts only Police.uk persistent crime identifiers', () => {
  assert.equal(isValidPersistentId(persistentId), true);
  assert.equal(isValidPersistentId('../health'), false);
  assert.equal(isValidPersistentId('135608122'), false);
});

test('removes suspect-identification wording from public outcome labels', () => {
  assert.equal(
    sanitizeOutcomeName('Investigation complete; no suspect identified'),
    'Investigation complete',
  );
  assert.equal(sanitizeOutcomeName('Unable to prosecute suspect'), 'Unable to prosecute');
  assert.equal(sanitizeOutcomeName('Under investigation'), 'Under investigation');
});

test('builds a readable evidence record from the official outcome payload', () => {
  const result = buildEvidenceView({
    outcomes: [
      { category: { code: 'under-investigation', name: 'Under investigation' }, date: '2026-05' },
      { category: { code: 'no-further-action', name: 'Investigation complete; no suspect identified' }, date: '2026-05' },
    ],
    crime: {
      category: 'burglary',
      location: {
        latitude: '51.471191',
        longitude: '-0.013901',
        street: { name: 'On or near Parkside Avenue' },
      },
      month: '2026-05',
    },
  }, persistentId);

  assert.equal(result.categoryLabel, 'Burglary');
  assert.equal(result.locationStreet, 'On or near Parkside Avenue');
  assert.equal(result.monthDisplay, 'May 2026');
  assert.equal(result.outcomes[1].status, 'Investigation complete');
  assert.equal(result.officialSourceUrl, `https://data.police.uk/api/outcomes-for-crime/${persistentId}`);
  assert.match(result.disclosure, /anonymised/i);
});

test('builds category-specific signals with roads and representative records', () => {
  const result = buildStructuredRiskSignals({
    district: 'Lewisham',
    postcode: 'SE10 8EP',
    month: '2026-05',
    radiusMeters: 400,
    totalCrimes: 66,
    categories: [
      { category: 'violent-crime', count: 25 },
      { category: 'anti-social-behaviour', count: 16 },
    ],
    crimes: [
      {
        category: 'violent-crime',
        categoryLabel: 'Violent Crime',
        month: '2026-05',
        locationStreet: 'On or near Blackheath Hill',
        persistentId,
        officialCaseUrl: `https://data.police.uk/api/outcomes-for-crime/${persistentId}`,
      },
      {
        category: 'violent-crime',
        categoryLabel: 'Violent Crime',
        month: '2026-05',
        locationStreet: 'On or near Blackheath Hill',
        persistentId: '',
        officialCaseUrl: '',
      },
      {
        category: 'anti-social-behaviour',
        categoryLabel: 'Anti Social Behaviour',
        month: '2026-05',
        locationStreet: 'On or near Lewisham Road',
        persistentId: '',
        officialCaseUrl: '',
      },
    ],
  });

  assert.equal(result[0].count, 25);
  assert.equal(result[0].monthDisplay, 'May 2026');
  assert.match(result[0].headline, /within roughly 400 metres of SE10 8EP/i);
  assert.match(result[0].detail, /broad category/i);
  assert.deepEqual(result[0].roads, [{ name: 'On or near Blackheath Hill', count: 2 }]);
  assert.equal(result[0].evidence[0].persistentId, persistentId);
  assert.match(result.at(-1).detail, /postcode search radius/i);
  assert.match(result.at(-1).detail, /not a live population/i);
});
