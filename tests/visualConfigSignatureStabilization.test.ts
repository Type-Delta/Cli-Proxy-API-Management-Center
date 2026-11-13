import { describe, expect, test } from 'bun:test';
import { parse as parseYaml } from 'yaml';
import { CONFIG_FIELD_SEARCH_INDEX } from '../src/features/config/searchIndex';
import { runVisualConfig } from './helpers/visualConfig';

const LEGACY_LAYOUTS = {
  upstream: (body: string) => `upstream:\n  claude:\n    header-defaults:\n${body}`,
  oauth: (body: string) => `oauth:\n  providers:\n    claude:\n      header-defaults:\n${body}`,
  root: (body: string) => `claude-header-defaults:\n${body}`,
};
const indent = { upstream: '      ', oauth: '        ', root: '  ' };

const read = (yaml: string) =>
  runVisualConfig(yaml).visualValues.claudeHeaderStabilizeDeviceProfile;
const flatten = (value: unknown, prefix = ''): string[] =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.entries(value).flatMap(([key, child]) => flatten(child, `${prefix}${key}.`))
    : [prefix.slice(0, -1)];

describe('Signature Stabilization config contract', () => {
  for (const [name, wrap] of Object.entries(LEGACY_LAYOUTS)) {
    const pad = indent[name as keyof typeof indent];
    test(`reads legacy stabilize-device-profile from the ${name} layout`, () => {
      expect(read(wrap(`${pad}stabilize-device-profile: true\n`))).toBe(true);
    });

    test(`canonical false in the ${name} layout beats legacy true in every layout`, () => {
      const canonical = wrap(`${pad}signature-stabilization: false\n`);
      for (const legacy of Object.entries(LEGACY_LAYOUTS)) {
        const [legacyName, legacyWrap] = legacy;
        const legacyYaml = legacyWrap(
          `${indent[legacyName as keyof typeof indent]}stabilize-device-profile: true\n`
        );
        // Merge both documents; same-layout pairs share one header-defaults map.
        const yaml =
          legacyName === name
            ? wrap(`${pad}signature-stabilization: false\n${pad}stabilize-device-profile: true\n`)
            : `${canonical}${legacyYaml}`;
        expect(read(yaml)).toBe(false);
      }
    });
  }

  test('saving writes only the canonical key and keeps unknown fields', () => {
    const source = [
      'claude-header-defaults:',
      '  stabilize-device-profile: false',
      '  future-root: keep-root',
      'oauth:',
      '  providers:',
      '    claude:',
      '      header-defaults: {stabilize-device-profile: false, future-oauth: keep-oauth}',
      'upstream:',
      '  claude:',
      '    header-defaults:',
      '      stabilize-device-profile: false',
      '      user-agent: fixture-agent',
      '      future-setting: retain-me',
      '  future-upstream: keep',
      '',
    ].join('\n');
    expect(read(source)).toBe(false);
    const config = runVisualConfig(source, [{ claudeHeaderStabilizeDeviceProfile: true }]);
    const output = config.applyVisualChangesToYaml(source);
    const parsed = parseYaml(output);
    expect(output).not.toContain('stabilize-device-profile');
    expect(parsed.upstream.claude['header-defaults']).toEqual({
      'signature-stabilization': true,
      'user-agent': 'fixture-agent',
      'future-setting': 'retain-me',
    });
    expect(parsed.upstream['future-upstream']).toBe('keep');
    expect(parsed.oauth.providers.claude['header-defaults']).toEqual({
      'future-oauth': 'keep-oauth',
    });
    expect(parsed['claude-header-defaults']).toEqual({ 'future-root': 'keep-root' });
    expect(read(output)).toBe(true);
  });

  test('saving false removes a conflicting historical canonical alias', () => {
    const source =
      'oauth:\n  providers:\n    claude:\n      header-defaults:\n        signature-stabilization: true\n';
    const config = runVisualConfig(source, [{ claudeHeaderStabilizeDeviceProfile: false }]);
    const parsed = parseYaml(config.applyVisualChangesToYaml(source));
    expect(flatten(parsed)).toEqual(['upstream.claude.header-defaults.signature-stabilization']);
    expect(parsed.upstream.claude['header-defaults']['signature-stabilization']).toBe(false);
  });

  test('unedited legacy input is left untouched', () => {
    const source =
      'upstream:\n  claude:\n    header-defaults:\n      stabilize-device-profile: true\n';
    const config = runVisualConfig(source, [{ claudeHeaderUserAgent: 'new-agent' }]);
    expect(config.applyVisualChangesToYaml(source)).toContain('stabilize-device-profile: true');
  });

  test('search points at the canonical key and still matches the legacy name', () => {
    const entry = CONFIG_FIELD_SEARCH_INDEX.find(
      (item) => item.fieldId === 'claudeHeaderStabilizeDeviceProfile'
    );
    expect(entry?.yamlKeys).toEqual([
      'upstream',
      'claude',
      'header-defaults',
      'signature-stabilization',
    ]);
    expect(entry?.keywords).toContain('stabilize-device-profile');
  });
});
