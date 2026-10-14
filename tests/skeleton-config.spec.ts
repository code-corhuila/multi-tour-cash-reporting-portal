import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Task T-01, done when: CI only on pull requests to develop and qa, cancelled when superseded and under
// 10 minutes; deploy/compose.yml exposes the port to the platform network and publishes none;
// every image tag is fixed. CODEOWNERS is not this story's (plan D-01).
const read = (file: string) => readFileSync(file, 'utf8');

describe('skeletonFollowsTheCourseLimits', () => {
  it('runs CI only on pull requests to develop and qa, with concurrency and a 10-minute limit', () => {
    const ci = read('.github/workflows/ci.yml');
    expect(ci).toMatch(/pull_request:\s*\n\s*branches:\s*\[develop, qa\]/);
    expect(ci).not.toMatch(/^\s*(push|schedule):/m);
    expect(ci).toMatch(/cancel-in-progress: true/);
    expect(ci).toMatch(/timeout-minutes: 10/);
    for (const step of ['npm ci', 'npm test', 'npm run build:module:demo', 'npm run build:module']) {
      expect(ci).toContain(`run: ${step}`);
    }
  });

  it('exposes the portal to the platform network and publishes no port', () => {
    const compose = read('deploy/compose.yml');
    expect(compose).toMatch(/expose:/);
    expect(compose).not.toMatch(/^\s*ports:/m);
  });

  it('pins every base image to a version, never latest', () => {
    const images = [...read('deploy/Dockerfile').matchAll(/^FROM\s+(\S+)/gm)].map(([, image]) => image);
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      expect(image).toMatch(/:\d[\w.-]*$/);
    }
  });

  it('serves the module and its stylesheet under the name the container manifest loads', () => {
    const dockerfile = read('deploy/Dockerfile');
    expect(dockerfile).toContain('/usr/share/nginx/html/cash-reporting-portal.js');
    expect(dockerfile).toContain('/usr/share/nginx/html/cash-reporting-portal.css');
  });
});
