/**
 * @file deploymentConfig.test.ts
 * @description Senior QA automated test suite verifying deployment configuration,
 * package manager standardization on npm, and prevention of ERR_PNPM_META_FETCH_FAIL
 * or conflicting runner package manager invocations.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Deployment Configuration & Package Manager Verification', () => {
  const rootDir = process.cwd();

  it('verifies vercel.json enforces npm installCommand and buildCommand', () => {
    const vercelConfigPath = path.join(rootDir, 'vercel.json');
    expect(fs.existsSync(vercelConfigPath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));
    expect(content.framework).toBe('vite');
    expect(content.installCommand).toBe('npm install --legacy-peer-deps');
    expect(content.buildCommand).toBe('npm run build');
    expect(content.outputDirectory).toBe('dist');
    expect(Array.isArray(content.rewrites)).toBe(true);
  });

  it('guarantees no pnpm or yarn lockfiles exist that trigger unwanted pnpm runners', () => {
    const pnpmLockPath = path.join(rootDir, 'pnpm-lock.yaml');
    const yarnLockPath = path.join(rootDir, 'yarn.lock');

    expect(fs.existsSync(pnpmLockPath)).toBe(false);
    expect(fs.existsSync(yarnLockPath)).toBe(false);
  });

  it('verifies package.json does not declare conflicting packageManager constraints', () => {
    const pkgPath = path.join(rootDir, 'package.json');
    expect(fs.existsSync(pkgPath)).toBe(true);

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    expect(pkg.packageManager).toBeUndefined();
    expect(pkg.scripts).toBeDefined();
    expect(pkg.scripts.build).toBe('vite build');
    expect(pkg.scripts.lint).toBe('eslint src/');
    expect(pkg.scripts.test).toBe('vitest run');
  });

  it('verifies .npmrc is configured with legacy-peer-deps for universal build reliability', () => {
    const npmrcPath = path.join(rootDir, '.npmrc');
    expect(fs.existsSync(npmrcPath)).toBe(true);

    const npmrcContent = fs.readFileSync(npmrcPath, 'utf8');
    expect(npmrcContent).toContain('legacy-peer-deps=true');
  });

  it('verifies GitHub Actions workflow exclusively uses npm with cache', () => {
    const workflowPath = path.join(rootDir, '.github', 'workflows', 'test.yml');
    if (fs.existsSync(workflowPath)) {
      const workflowContent = fs.readFileSync(workflowPath, 'utf8');
      expect(workflowContent).toContain("cache: 'npm'");
      expect(workflowContent).toContain('npm install --legacy-peer-deps');
      expect(workflowContent).toContain('npm run lint');
      expect(workflowContent).toContain('npm test');
      expect(workflowContent).toContain('npm run build');
      expect(workflowContent).not.toContain('pnpm/action-setup');
    }
  });
});
