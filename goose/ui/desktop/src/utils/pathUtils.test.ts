import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isAbsoluteMayhemPath, resolveMayhemPathRoot, sanitizeMayhemPathRoot } from './pathUtils';

describe('resolveMayhemPathRoot', () => {
  it('rejects empty and relative values', () => {
    expect(resolveMayhemPathRoot(undefined)).toBeUndefined();
    expect(resolveMayhemPathRoot('   ')).toBeUndefined();
    expect(resolveMayhemPathRoot('relative/root')).toBeUndefined();
  });

  it('retains absolute paths without requiring them to exist', () => {
    const absolute = path.resolve('nonexistent-mayhem-root');
    expect(resolveMayhemPathRoot(`  ${absolute}  `)).toBe(absolute);
  });

  it('expands a home-relative root before validation', () => {
    expect(resolveMayhemPathRoot('~')).toBe(os.homedir());
  });

  it('removes a rejected value from the child-process environment', () => {
    const env = { MAYHEM_PATH_ROOT: 'relative/root' };
    expect(sanitizeMayhemPathRoot(env)).toBeUndefined();
    expect(env).not.toHaveProperty('MAYHEM_PATH_ROOT');
  });

  it('matches Rust absolute-path handling on Windows', () => {
    expect(isAbsoluteMayhemPath('C:\\mayhem\\root', 'win32')).toBe(true);
    expect(isAbsoluteMayhemPath('\\\\server\\share\\mayhem', 'win32')).toBe(true);
    expect(isAbsoluteMayhemPath('C:mayhem\\root', 'win32')).toBe(false);
    expect(isAbsoluteMayhemPath('\\mayhem\\root', 'win32')).toBe(false);
    expect(isAbsoluteMayhemPath('/mayhem/root', 'win32')).toBe(false);
  });
});
