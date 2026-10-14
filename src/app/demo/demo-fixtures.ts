/**
 * DEMO build only: the e2e suite asks for seeded situations with ?demoFixtures=a,b on the area address (multi-agents e2e README 2.3,
 * PROPUESTO). Only src/app/demo reads the address; the portal does not. Fixtures of HU-CSH-002: empty-day, failing-dashboard; of HU-CSH-003: empty-period, failing-monthly.
 */
const query = () => new URLSearchParams(globalThis.location?.search ?? '');

export const demoFixture = (name: string): boolean => (query().get('demoFixtures') ?? '').split(',').includes(name);
