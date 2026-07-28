function getLicenseExpiry(now, license) {
  if (!license) return null;

  if (license.duration && Number(license.duration) > 0) {
    return now + (Number(license.duration) * 86400);
  }

  if (license.expiry && Number(license.expiry) > 0) {
    return Number(license.expiry);
  }

  return null;
}

function shouldConsumeLicenseUse(license, action) {
  if (!license) return false;
  if (action === 'license') return false;
  return (Number(license.used) || 0) < (Number(license.max_uses) || 1);
}

module.exports = {
  getLicenseExpiry,
  shouldConsumeLicenseUse
};
