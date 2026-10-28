import { describe, expect, test } from 'bun:test';
import { parseDocument } from 'yaml';
import { findConfigFieldById, searchConfigFields } from '@/features/config/searchIndex';
import { runVisualConfig } from './helpers/visualConfig';

const source = `# config
clickhouse:
  dsn: clickhouse://user:secret@db:9000
  database: cpa_custom
  telemetry-retention-days: 60
  agent-query:
    enabled: false
    max-execution-time: 45s
    max-result-rows: 5000
    max-memory-bytes: 4096
future: preserved
`;

describe('ClickHouse configuration', () => {
  test('loads numeric and nested settings from YAML', () => {
    const values = runVisualConfig(source).visualValues;
    expect(values.clickhouseDsn).toBe('clickhouse://user:secret@db:9000');
    expect(values.clickhouseDatabase).toBe('cpa_custom');
    expect(values.clickhouseTelemetryRetentionDays).toBe('60');
    expect(values.clickhouseAgentQueryEnabled).toBe(false);
    expect(values.clickhouseAgentQueryMaxExecutionTime).toBe('45s');
    expect(values.clickhouseAgentQueryMaxResultRows).toBe('5000');
    expect(values.clickhouseAgentQueryMaxMemoryBytes).toBe('4096');
  });

  test('writes dirty values without materializing untouched fields', () => {
    const config = runVisualConfig(source, [
      {
        clickhouseDsn: ' clickhouse://new:secret@db:9000 ',
        clickhouseDatabase: 'cpa_new',
        clickhouseTelemetryRetentionDays: '90',
        clickhouseAgentQueryEnabled: true,
        clickhouseAgentQueryMaxExecutionTime: '15s',
        clickhouseAgentQueryMaxResultRows: '2500',
        clickhouseAgentQueryMaxMemoryBytes: '8192',
      },
    ]);
    expect([...config.visualDirtyFields]).toEqual([
      'clickhouseDsn',
      'clickhouseDatabase',
      'clickhouseTelemetryRetentionDays',
      'clickhouseAgentQueryEnabled',
      'clickhouseAgentQueryMaxExecutionTime',
      'clickhouseAgentQueryMaxResultRows',
      'clickhouseAgentQueryMaxMemoryBytes',
    ]);
    const output = config.applyVisualChangesToYaml(source);
    const expected = parseDocument(source).toJS() as Record<string, unknown>;
    expected.clickhouse = {
      dsn: 'clickhouse://new:secret@db:9000',
      database: 'cpa_new',
      'telemetry-retention-days': 90,
      'agent-query': {
        enabled: true,
        'max-execution-time': '15s',
        'max-result-rows': 2500,
        'max-memory-bytes': 8192,
      },
    };
    expect(parseDocument(output).toJS()).toEqual(expected);
    expect(output).toContain('future: preserved');
  });

  test('does not materialize defaults and validates limits', () => {
    const loaded = runVisualConfig('{}');
    expect(loaded.visualValues.clickhouseDsn).toBe('');
    expect(loaded.visualValues.clickhouseDatabase).toBe('cpa');
    expect(parseDocument(loaded.applyVisualChangesToYaml('{}')).toJS()).toEqual({});

    const invalid = runVisualConfig('{}', [
      {
        clickhouseDsn: 'clickhouse://db:9000',
        clickhouseDatabase: '0invalid',
        clickhouseTelemetryRetentionDays: '0',
        clickhouseAgentQueryMaxExecutionTime: '0s',
        clickhouseAgentQueryMaxResultRows: '0',
        clickhouseAgentQueryMaxMemoryBytes: '0',
      },
    ]);
    expect(invalid.visualValidationErrors.clickhouseDatabase).toBe('invalid_clickhouse_database');
    expect(invalid.visualValidationErrors.clickhouseTelemetryRetentionDays).toBe('positive_integer');
    expect(invalid.visualValidationErrors.clickhouseAgentQueryMaxExecutionTime).toBe('positive_duration');
    expect(invalid.visualValidationErrors.clickhouseAgentQueryMaxResultRows).toBe('positive_integer');
    expect(invalid.visualValidationErrors.clickhouseAgentQueryMaxMemoryBytes).toBe('positive_integer');
  });

  test('registers searchable YAML paths', () => {
    expect(findConfigFieldById('clickhouseDsn')).toMatchObject({
      sectionId: 'logging',
      yamlKeys: ['clickhouse', 'dsn'],
    });
    expect(
      searchConfigFields('clickhouse.telemetry-retention-days', () => '').map(
        (entry) => entry.fieldId
      )
    ).toContain('clickhouseTelemetryRetentionDays');
  });
});
