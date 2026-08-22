import assert from 'node:assert/strict';
import test from 'node:test';

import {
  loadSponsorView,
  selectSponsorView,
} from './sponsors.mjs';

const NOW = new Date('2026-08-22T12:00:00.000Z');

function sponsor(overrides = {}) {
  return {
    id: 'greenwich-cycles',
    businessName: 'Greenwich Cycles',
    message: 'Local repairs and secure-lock advice.',
    destinationUrl: 'https://example.com/greenwich',
    placement: 'result',
    active: true,
    startsAt: '2026-08-01T00:00:00.000Z',
    endsAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

test('returns only a sanitised district-matched sponsor view', () => {
  const view = selectSponsorView({
    sponsors: [
      sponsor({ id: 'global', businessName: 'Global sponsor', district: undefined }),
      sponsor({
        id: 'local',
        businessName: '<b>Greenwich Cycles</b><script>not-safe()</script>',
        message: 'Local <em>bike repairs</em> and lock advice.',
        district: 'Lewisham',
      }),
    ],
  }, {
    placement: 'result',
    district: ' lewisham ',
    now: NOW,
  });

  assert.deepEqual(view, {
    id: 'local',
    label: 'Sponsored local business',
    businessName: 'Greenwich Cycles',
    message: 'Local bike repairs and lock advice.',
    destinationUrl: 'https://example.com/greenwich',
    placement: 'result',
  });
  assert.deepEqual(Object.keys(view), [
    'id',
    'label',
    'businessName',
    'message',
    'destinationUrl',
    'placement',
  ]);
});

test('fails closed for unsafe links and ineligible inventory', () => {
  const invalidSponsors = [
    sponsor({ destinationUrl: 'http://example.com' }),
    sponsor({ destinationUrl: 'https://user:password@example.com' }),
    sponsor({ active: false }),
    sponsor({ placement: 'map' }),
    sponsor({ startsAt: '2026-09-01T00:00:00.000Z' }),
    sponsor({ endsAt: '2026-08-01T00:00:00.000Z' }),
    sponsor({ startsAt: 'not-a-date' }),
    sponsor({ district: 'Nottingham' }),
    sponsor({ businessName: '<script>only-script()</script>' }),
  ];

  for (const candidate of invalidSponsors) {
    assert.equal(selectSponsorView({ sponsors: [candidate] }, {
      placement: 'result',
      district: 'Lewisham',
      now: NOW,
    }), null);
  }

  assert.equal(selectSponsorView({ sponsors: [sponsor()] }, {
    placement: 'unknown',
    district: 'Lewisham',
    now: NOW,
  }), null);
});

test('allows a global sponsor but prefers an exact district match', () => {
  const global = sponsor({ id: 'global', district: undefined });
  const local = sponsor({ id: 'local', district: 'Lewisham' });

  assert.equal(selectSponsorView({ sponsors: [global, local] }, {
    placement: 'result',
    district: 'Lewisham',
    now: NOW,
  })?.id, 'local');
  assert.equal(selectSponsorView({ sponsors: [global, local] }, {
    placement: 'result',
    district: 'Greenwich',
    now: NOW,
  })?.id, 'global');
  assert.equal(selectSponsorView({ sponsors: [local] }, {
    placement: 'result',
    now: NOW,
  }), null);
});

test('loads optional JSON configuration without surfacing file failures', async () => {
  const loaded = await loadSponsorView({
    configFile: 'virtual-sponsors.json',
    placement: 'result',
    district: 'Lewisham',
    now: NOW,
    readText: async () => JSON.stringify({ sponsors: [sponsor({ district: 'Lewisham' })] }),
  });
  assert.equal(loaded?.id, 'greenwich-cycles');

  assert.equal(await loadSponsorView({
    configFile: '',
    placement: 'result',
    now: NOW,
  }), null);
  assert.equal(await loadSponsorView({
    configFile: 'missing.json',
    placement: 'result',
    now: NOW,
    readText: async () => { throw new Error('ENOENT'); },
  }), null);
  assert.equal(await loadSponsorView({
    configFile: 'broken.json',
    placement: 'result',
    now: NOW,
    readText: async () => '{not json',
  }), null);
});
