/* global require, module */
/* eslint @typescript-eslint/no-require-imports: "off" -- Expo synchronously loads local config plugins as CommonJS. */
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = function withLocalNetwork(config) {
  if (config.extra?.environment !== 'local-test') throw new Error('zm-os local network plugin is restricted to the local-test app.');
  config = withAndroidManifest(config, mod => {
    const application = mod.modResults.manifest.application?.[0];
    if (!application) throw new Error('Android application manifest is missing.');
    application.$['android:networkSecurityConfig'] = '@xml/zm_os_local_network';
    return mod;
  });
  return withDangerousMod(config, ['android', async mod => {
    const directory = path.join(mod.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
    await fs.mkdir(directory, {recursive:true});
    await fs.writeFile(path.join(directory, 'zm_os_local_network.xml'), `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">localhost</domain>
    <domain includeSubdomains="false">127.0.0.1</domain>
  </domain-config>
</network-security-config>
`, 'utf8');
    return mod;
  }]);
};
