const { withNativeFederation, shareAll } = require('@angular-architects/native-federation/config');

// The container mounts dist/portal.js through mount() (ADR-007); this exposes the same entry for a federated host.
module.exports = withNativeFederation({
  name: 'cash-reporting',
  exposes: {
    './mount': './src/mount-entry.ts',
  },
  shared: {
    ...shareAll({ singleton: true, strictVersion: true, requiredVersion: 'auto' }),
  },
  // Entry points the application never loads: sharing them would bundle their dependencies.
  skip: [
    'rxjs/ajax', 'rxjs/fetch', 'rxjs/testing', 'rxjs/webSocket',
    '@angular/platform-browser/animations', '@angular/platform-browser/animations/async',
  ],
});
