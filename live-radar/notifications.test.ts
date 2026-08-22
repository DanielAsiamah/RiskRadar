import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLocalNotificationMessage } from './notifications.ts';

test('formats a high-score live radar alert message', () => {
  const message = buildLocalNotificationMessage({
    postcode: 'SE10 8EP',
    score: 66,
    trigger: 'score-threshold',
    explanation: 'The local score reached 65 or above.',
  });

  assert.match(message.title, /Live Radar/i);
  assert.match(message.body, /SE10 8EP/);
  assert.match(message.body, /66/);
});

test('formats a higher-risk-area transition message', () => {
  const message = buildLocalNotificationMessage({
    postcode: 'BR1 5NN',
    score: 54,
    trigger: 'entered-higher-risk-area',
    explanation: 'You entered a higher-risk area than the previous accepted reading.',
  });

  assert.match(message.body, /BR1 5NN/);
  assert.match(message.body, /higher-risk area/i);
});
