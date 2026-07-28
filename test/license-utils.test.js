const test = require('node:test');
const assert = require('node:assert/strict');
const { getLicenseExpiry, shouldConsumeLicenseUse } = require('../src/routes/licenseUtils');

test('calcula la expiración usando duration cuando la key tiene días', () => {
  const now = 1_700_000_000;
  const license = { duration: 30, expiry: null };

  assert.equal(getLicenseExpiry(now, license), now + (30 * 86400));
});

test('la activación por key no consume uso al volver a entrar', () => {
  const license = { used: 1, max_uses: 1 };

  assert.equal(shouldConsumeLicenseUse(license, 'license'), false);
});

test('el registro sigue consumiendo un uso cuando la licencia aún no alcanza el límite', () => {
  const license = { used: 0, max_uses: 1 };

  assert.equal(shouldConsumeLicenseUse(license, 'register'), true);
});
