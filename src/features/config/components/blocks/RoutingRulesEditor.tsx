import { memo, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  IconArrowDown,
  IconArrowUp,
  IconArrowUpDown,
  IconChevronDown,
  IconCopy,
  IconPlus,
  IconTrash2,
  IconX,
} from '@/components/ui/icons';
import type { RoutingCredential } from '@/types/routing';
import { makeClientId } from '@/types/visualConfig';
import {
  ROUTING_FIELD_OPS,
  ROUTING_FIELD_ORDER,
  ROUTING_LIMITS,
  appendRoutingNode,
  defaultRoutingOp,
  displayRoutingValue,
  issuesForRule,
  makeRoutingCondition,
  makeRoutingGroup,
  makeRoutingRule,
  moveRoutingRule,
  removeRoutingNode,
  renderRoutingRuleCondition,
  updateRoutingNode,
  validateRoutingRules,
  type RoutingConditionField,
  type RoutingConditionGroupDraft,
  type RoutingConditionLeafDraft,
  type RoutingConditionNode,
  type RoutingConditionOp,
  type RoutingRuleDraft,
  type RoutingRuleValidationIssue,
} from '@/features/config/routingRules';
import styles from './RoutingRulesEditor.module.scss';

const cx = (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(' ');

type UpdateNode = (
  nodeId: string,
  update: (node: RoutingConditionNode) => RoutingConditionNode
) => void;

function createCondition(field: RoutingConditionField = 'model'): RoutingConditionLeafDraft {
  return {
    ...makeRoutingCondition(field),
    id: makeClientId(),
    value: '',
    headerName: field === 'header' ? 'x-team' : '',
  };
}

function createGroup(op: 'all' | 'any' = 'all', items: RoutingConditionNode[] = []) {
  return { ...makeRoutingGroup(op, items), id: makeClientId() };
}

type SuggestionLists = { apiKey: string[]; client: string[] };

function ValueSuggestions({ id, options }: { id: string; options: string[] }) {
  if (options.length === 0) return null;
  return (
    <datalist id={id}>
      {options.map((option) => (
        <option key={option} value={option} />
      ))}
    </datalist>
  );
}

/** Single value for is / match / regex. */
function SingleValueInput({
  leaf,
  disabled,
  suggestions,
  placeholder,
  onPatch,
}: {
  leaf: RoutingConditionLeafDraft;
  disabled?: boolean;
  suggestions: string[];
  placeholder: string;
  onPatch: (patch: Partial<RoutingConditionLeafDraft>) => void;
}) {
  const { t } = useTranslation();
  const listId = useId();
  return (
    <span className={styles.valueCell}>
      <input
        className={cx('input', styles.valueInput)}
        value={leaf.value}
        placeholder={placeholder}
        spellCheck={false}
        disabled={disabled}
        aria-label={t('config_management.visual.routing_rules.value')}
        list={suggestions.length > 0 ? listId : undefined}
        onChange={(event) => onPatch({ value: event.target.value })}
      />
      <ValueSuggestions id={listId} options={suggestions} />
    </span>
  );
}

/**
 * Token list for `in`. Values are committed one at a time, so a value that contains a
 * comma (`application/json, text/event-stream`) stays a single YAML list entry.
 */
function TokenValueInput({
  values,
  disabled,
  suggestions,
  placeholder,
  onChange,
}: {
  values: string[];
  disabled?: boolean;
  suggestions: string[];
  placeholder: string;
  onChange: (values: string[]) => void;
}) {
  const { t } = useTranslation();
  const listId = useId();
  const [draft, setDraft] = useState('');

  // Typed values are trimmed (stray edge spaces are almost always accidental); values loaded
  // from config are kept verbatim, including "" and padding, and rendered quoted when needed.
  const commit = () => {
    const value = draft.trim();
    setDraft('');
    if (!value || values.includes(value)) return;
    onChange([...values, value]);
  };

  return (
    <span className={cx(styles.valueCell, styles.tokenCell)}>
      <span className={styles.tokens}>
        {values.map((value, index) => (
          <span key={`${index}:${value}`} className={styles.token}>
            <span className={styles.tokenLabel} title={value}>
              {displayRoutingValue(value)}
            </span>
            <button
              type="button"
              className={styles.tokenRemove}
              aria-label={t('config_management.visual.routing_rules.remove_value', { value })}
              disabled={disabled}
              onClick={() => onChange(values.filter((_, position) => position !== index))}
            >
              <IconX size={10} />
            </button>
          </span>
        ))}
        <input
          className={cx('input', styles.tokenInput)}
          value={draft}
          placeholder={placeholder}
          spellCheck={false}
          disabled={disabled}
          aria-label={t('config_management.visual.routing_rules.value')}
          list={suggestions.length > 0 ? listId : undefined}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            } else if (event.key === 'Backspace' && !draft && values.length > 0) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={commit}
        />
      </span>
      <ValueSuggestions id={listId} options={suggestions} />
    </span>
  );
}

function ConditionRow({
  leaf,
  disabled,
  suggestions,
  update,
  remove,
}: {
  leaf: RoutingConditionLeafDraft;
  disabled?: boolean;
  suggestions: SuggestionLists;
  update: UpdateNode;
  remove: () => void;
}) {
  const { t } = useTranslation();
  const set = (patch: Partial<RoutingConditionLeafDraft>) =>
    update(
      leaf.id,
      (node) => ({ ...(node as RoutingConditionLeafDraft), ...patch }) as RoutingConditionNode
    );
  const fieldOptions = ROUTING_FIELD_ORDER.map((field) => ({
    value: field,
    label: t(`config_management.visual.routing_rules.field_${field.replace('-', '_')}`),
  }));
  const opOptions = ROUTING_FIELD_OPS[leaf.field].map((op) => ({
    value: op,
    label: t(`config_management.visual.routing_rules.op_${op}`),
  }));
  const options =
    leaf.field === 'api-key'
      ? suggestions.apiKey
      : leaf.field === 'client'
        ? suggestions.client
        : [];
  const valuePlaceholder = t(
    `config_management.visual.routing_rules.value_placeholder_${leaf.field.replace('-', '_')}`
  );

  return (
    <div className={styles.condition}>
      <button
        type="button"
        className={cx(styles.notButton, leaf.not && styles.notButtonOn)}
        aria-pressed={leaf.not}
        aria-label={t('config_management.visual.routing_rules.negate')}
        disabled={disabled}
        onClick={() => set({ not: !leaf.not })}
      >
        NOT
      </button>
      <Select
        size="sm"
        className={styles.conditionSelect}
        value={leaf.field}
        options={fieldOptions}
        disabled={disabled}
        ariaLabel={t('config_management.visual.routing_rules.field')}
        onChange={(value) => {
          const field = value as RoutingConditionField;
          set({
            field,
            op: defaultRoutingOp(field),
            value: '',
            values: [],
            headerName: field === 'header' ? leaf.headerName || 'x-team' : '',
          });
        }}
      />
      {leaf.field === 'header' ? (
        <input
          className={cx('input', styles.headerNameInput)}
          value={leaf.headerName}
          placeholder="x-team"
          spellCheck={false}
          disabled={disabled}
          aria-label={t('config_management.visual.routing_rules.header_name')}
          onChange={(event) => set({ headerName: event.target.value })}
        />
      ) : null}
      <Select
        size="sm"
        className={styles.conditionSelect}
        value={leaf.op}
        options={opOptions}
        disabled={disabled}
        ariaLabel={t('config_management.visual.routing_rules.operator')}
        onChange={(value) => set({ op: value as RoutingConditionOp, value: '', values: [] })}
      />
      {leaf.op === 'in' ? (
        <TokenValueInput
          values={leaf.values}
          disabled={disabled}
          suggestions={options}
          placeholder={valuePlaceholder}
          onChange={(values) => set({ values })}
        />
      ) : (
        <SingleValueInput
          leaf={leaf}
          disabled={disabled}
          suggestions={options}
          placeholder={valuePlaceholder}
          onPatch={set}
        />
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={styles.iconButton}
        aria-label={t('config_management.visual.routing_rules.remove_condition')}
        disabled={disabled}
        onClick={remove}
      >
        <IconX size={14} />
      </Button>
    </div>
  );
}

function ConditionGroupBox({
  group,
  depth,
  disabled,
  suggestions,
  update,
  removeNode,
  append,
  removable,
}: {
  group: RoutingConditionGroupDraft;
  depth: number;
  disabled?: boolean;
  suggestions: SuggestionLists;
  update: UpdateNode;
  removeNode: (nodeId: string) => void;
  append: (groupId: string, child: RoutingConditionNode) => void;
  removable: boolean;
}) {
  const { t } = useTranslation();
  const set = (patch: Partial<RoutingConditionGroupDraft>) =>
    update(
      group.id,
      (node) => ({ ...(node as RoutingConditionGroupDraft), ...patch }) as RoutingConditionNode
    );

  return (
    <div className={cx(styles.group, group.not && styles.groupNegated)}>
      <div className={styles.groupHead}>
        <button
          type="button"
          className={cx(styles.notButton, group.not && styles.notButtonOn)}
          aria-pressed={group.not}
          aria-label={t('config_management.visual.routing_rules.negate_group')}
          disabled={disabled}
          onClick={() => set({ not: !group.not })}
        >
          NOT
        </button>
        <SegmentedControl
          value={group.op}
          options={[
            { value: 'all', label: t('config_management.visual.routing_rules.group_all') },
            { value: 'any', label: t('config_management.visual.routing_rules.group_any') },
          ]}
          ariaLabel={t('config_management.visual.routing_rules.group_match_mode')}
          onChange={(value) => set({ op: value as 'all' | 'any' })}
        />
        <span className={styles.groupLabel}>
          {t('config_management.visual.routing_rules.group_join')}
        </span>
        {removable ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={styles.groupRemove}
            aria-label={t('config_management.visual.routing_rules.remove_group')}
            disabled={disabled}
            onClick={() => removeNode(group.id)}
          >
            <IconTrash2 size={14} />
          </Button>
        ) : null}
      </div>

      {group.items.map((item) =>
        item.kind === 'condition' ? (
          <ConditionRow
            key={item.id}
            leaf={item}
            disabled={disabled}
            suggestions={suggestions}
            update={update}
            remove={() => removeNode(item.id)}
          />
        ) : (
          <ConditionGroupBox
            key={item.id}
            group={item}
            depth={depth + 1}
            disabled={disabled}
            suggestions={suggestions}
            update={update}
            removeNode={removeNode}
            append={append}
            removable
          />
        )
      )}

      <div className={styles.groupActions}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<IconPlus size={13} />}
          disabled={disabled || group.items.length >= ROUTING_LIMITS.nodes}
          onClick={() => append(group.id, createCondition())}
        >
          {t('config_management.visual.routing_rules.add_condition')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<IconPlus size={13} />}
          disabled={disabled || depth + 1 >= ROUTING_LIMITS.depth}
          onClick={() => append(group.id, createGroup('any', [createCondition('client')]))}
        >
          {t('config_management.visual.routing_rules.add_group')}
        </Button>
      </div>
    </div>
  );
}

function CredentialChip({
  target,
  credential,
  disabled,
  onRemove,
}: {
  target: string;
  credential: RoutingCredential | undefined;
  disabled?: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <span className={cx(styles.chip, !credential && styles.chipMissing)}>
      <span
        className={cx(styles.chipDot, credential?.disabled && styles.chipDotOff)}
        aria-hidden="true"
      />
      <span className={styles.chipLabel}>{credential ? credential.label : target}</span>
      {credential ? <span className={styles.chipMeta}>{credential.provider}</span> : null}
      {credential?.disabled ? (
        <span className={styles.chipBadge}>
          {t('config_management.visual.routing_rules.credential_disabled')}
        </span>
      ) : null}
      {!credential ? (
        <span className={styles.chipBadge}>
          {t('config_management.visual.routing_rules.credential_missing')}
        </span>
      ) : null}
      <button
        type="button"
        className={styles.chipRemove}
        aria-label={t('config_management.visual.routing_rules.remove_route', {
          credential: credential ? credential.label : target,
        })}
        disabled={disabled}
        onClick={onRemove}
      >
        <IconX size={11} />
      </button>
    </span>
  );
}

function RuleCard({
  rule,
  index,
  total,
  credentials,
  suggestions,
  disabled,
  expanded,
  issues,
  onChange,
  onRemove,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onToggleExpanded,
  onDragStart,
  onDragEnd,
  dragging,
  dropTarget,
  onDragOver,
  onDrop,
}: {
  rule: RoutingRuleDraft;
  index: number;
  total: number;
  credentials: RoutingCredential[];
  suggestions: SuggestionLists;
  disabled?: boolean;
  expanded: boolean;
  issues: RoutingRuleValidationIssue[];
  onChange: (patch: Partial<RoutingRuleDraft>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleExpanded: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  dragging: boolean;
  dropTarget: boolean;
  onDragOver: () => void;
  onDrop: () => void;
}) {
  const { t } = useTranslation();
  const credentialById = new Map(credentials.map((credential) => [credential.id, credential]));
  const update: UpdateNode = (nodeId, updater) =>
    onChange({ when: updateRoutingNode(rule.when, nodeId, updater) as RoutingConditionGroupDraft });
  const removeNode = (nodeId: string) => onChange({ when: removeRoutingNode(rule.when, nodeId) });
  const append = (groupId: string, child: RoutingConditionNode) =>
    onChange({ when: appendRoutingNode(rule.when, groupId, child) });
  const available = credentials.filter((credential) => !rule.routeTo.includes(credential.id));
  const ruleNumber = index + 1;

  return (
    <article
      className={cx(
        styles.rule,
        !rule.enabled && styles.ruleDisabled,
        dragging && styles.ruleDragging,
        dropTarget && styles.ruleDropTarget
      )}
      aria-label={t('config_management.visual.routing_rules.rule_aria', {
        index: ruleNumber,
        name: rule.name || t('config_management.visual.routing_rules.unnamed_rule'),
      })}
      onDragOver={(event) => {
        if (dragging) event.preventDefault();
        onDragOver();
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
    >
      <div className={styles.ruleTop}>
        <span
          className={styles.handle}
          title={t('config_management.visual.routing_rules.drag_handle')}
          aria-hidden="true"
          draggable={!disabled}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', rule.id);
            onDragStart();
          }}
          onDragEnd={onDragEnd}
        >
          <IconArrowUpDown size={15} />
        </span>
        <span className={styles.ruleIndex}>{`R${ruleNumber}`}</span>
        <input
          className={styles.ruleName}
          value={rule.name}
          placeholder={t('config_management.visual.routing_rules.rule_name_placeholder')}
          disabled={disabled}
          aria-label={t('config_management.visual.routing_rules.rule_name')}
          onChange={(event) => onChange({ name: event.target.value })}
        />
        <span className={styles.ruleTools}>
          <ToggleSwitch
            checked={rule.enabled}
            disabled={disabled}
            ariaLabel={
              rule.enabled
                ? t('config_management.visual.routing_rules.disable_rule')
                : t('config_management.visual.routing_rules.enable_rule')
            }
            onChange={(enabled) => onChange({ enabled })}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cx(styles.iconButton, styles.duplicateButton)}
            aria-label={t('config_management.visual.routing_rules.duplicate_rule')}
            disabled={disabled || total >= ROUTING_LIMITS.rules}
            onClick={onDuplicate}
          >
            <IconCopy size={14} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={styles.iconButton}
            aria-label={t('config_management.visual.routing_rules.move_rule_up')}
            disabled={disabled || index === 0}
            onClick={onMoveUp}
          >
            <IconArrowUp size={14} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={styles.iconButton}
            aria-label={t('config_management.visual.routing_rules.move_rule_down')}
            disabled={disabled || index === total - 1}
            onClick={onMoveDown}
          >
            <IconArrowDown size={14} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={styles.iconButton}
            aria-label={t('config_management.visual.routing_rules.delete_rule')}
            disabled={disabled}
            onClick={onRemove}
          >
            <IconTrash2 size={14} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cx(styles.iconButton, styles.expandButton)}
            aria-label={
              expanded
                ? t('config_management.visual.routing_rules.collapse_rule')
                : t('config_management.visual.routing_rules.expand_rule')
            }
            aria-expanded={expanded}
            disabled={disabled || issues.length > 0}
            onClick={onToggleExpanded}
          >
            <IconChevronDown size={14} />
          </Button>
        </span>
      </div>

      <p className={styles.summary}>
        <span className={styles.keyword}>
          {t('config_management.visual.routing_rules.summary_when')}
        </span>{' '}
        <span className={styles.summaryCondition}>{renderRoutingRuleCondition(rule)}</span>{' '}
        <span className={styles.arrow} aria-hidden="true">
          →
        </span>{' '}
        <span className={styles.keyword}>
          {t('config_management.visual.routing_rules.summary_route_to')}
        </span>{' '}
        {rule.routeTo.length === 0 ? (
          <span className={styles.summaryEmpty}>
            {t('config_management.visual.routing_rules.summary_nothing')}
          </span>
        ) : (
          rule.routeTo.map((target) => (
            <span key={target} className={styles.summaryTarget}>
              {credentialById.get(target)?.label ?? target}
            </span>
          ))
        )}
      </p>

      {expanded ? (
        <div className={styles.builder}>
          <section>
            <div className={styles.blockTitle}>
              {t('config_management.visual.routing_rules.when_title')}
            </div>
            <ConditionGroupBox
              group={rule.when}
              depth={0}
              disabled={disabled}
              suggestions={suggestions}
              update={update}
              removeNode={removeNode}
              append={append}
              removable={false}
            />
          </section>

          <section>
            <div className={styles.blockTitle}>
              {t('config_management.visual.routing_rules.then_title')}
            </div>
            <div className={styles.chips}>
              {rule.routeTo.map((target) => (
                <CredentialChip
                  key={target}
                  target={target}
                  credential={credentialById.get(target)}
                  disabled={disabled}
                  onRemove={() =>
                    onChange({ routeTo: rule.routeTo.filter((entry) => entry !== target) })
                  }
                />
              ))}
              {available.length > 0 ? (
                <div className={styles.routePicker}>
                  <Select
                    size="sm"
                    value=""
                    placeholder={t('config_management.visual.routing_rules.route_add')}
                    options={available.map((credential) => ({
                      value: credential.id,
                      label: credential.label,
                      description: credential.provider,
                      badge: credential.disabled
                        ? t('config_management.visual.routing_rules.credential_disabled')
                        : undefined,
                    }))}
                    disabled={disabled || rule.routeTo.length >= ROUTING_LIMITS.targets}
                    ariaLabel={t('config_management.visual.routing_rules.route_add')}
                    onChange={(value) => {
                      if (value) onChange({ routeTo: [...rule.routeTo, value] });
                    }}
                  />
                </div>
              ) : null}
            </div>
            <p className={styles.hint}>{t('config_management.visual.routing_rules.route_hint')}</p>
          </section>

          {issues.length > 0 ? (
            <ul className={styles.issues}>
              {issues.map((issue) => (
                <li key={`${issue.code}-${issue.nodeId ?? 'rule'}`} className={styles.issue}>
                  {t(`config_management.visual.routing_rules.validation.${issue.code}`)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export const RoutingRulesEditor = memo(function RoutingRulesEditor({
  value,
  disabled,
  credentials,
  apiKeyLabels,
  clientTypes,
  onChange,
}: {
  value: RoutingRuleDraft[];
  disabled?: boolean;
  credentials: RoutingCredential[];
  apiKeyLabels: string[];
  clientTypes: string[];
  onChange: (next: RoutingRuleDraft[]) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const issues = validateRoutingRules(value);
  const suggestions: SuggestionLists = { apiKey: apiKeyLabels, client: clientTypes };

  const patchRule = (ruleId: string, patch: Partial<RoutingRuleDraft>) =>
    onChange(value.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule)));

  const addRule = () => {
    const rule: RoutingRuleDraft = {
      ...makeRoutingRule(createGroup('all', [createCondition('model')])),
      id: makeClientId(),
    };
    setExpanded((current) => new Set(current).add(rule.id));
    onChange([...value, rule]);
  };

  const duplicateRule = (rule: RoutingRuleDraft, index: number) => {
    const copy: RoutingRuleDraft = {
      ...rule,
      id: makeClientId(),
      name: `${rule.name || t('config_management.visual.routing_rules.unnamed_rule')} (${t(
        'config_management.visual.routing_rules.copy_suffix'
      )})`,
      when: { ...rule.when, id: makeClientId() },
    };
    const next = [...value];
    next.splice(index + 1, 0, copy);
    setExpanded((current) => new Set(current).add(copy.id));
    onChange(next);
  };

  return (
    <div className={styles.root}>
      {value.length === 0 ? (
        <div className={styles.empty}>{t('config_management.visual.routing_rules.no_rules')}</div>
      ) : null}

      <div className={styles.rules} role="list">
        {value.map((rule, index) => {
          const ruleIssues = issuesForRule(issues, rule.id);
          return (
            <div role="listitem" key={rule.id}>
              <RuleCard
                rule={rule}
                index={index}
                total={value.length}
                credentials={credentials}
                suggestions={suggestions}
                disabled={disabled}
                expanded={expanded.has(rule.id) || ruleIssues.length > 0}
                issues={ruleIssues}
                dragging={dragging === rule.id}
                dropTarget={dropTarget === rule.id && dragging !== rule.id}
                onChange={(patch) => patchRule(rule.id, patch)}
                onRemove={() => onChange(value.filter((entry) => entry.id !== rule.id))}
                onDuplicate={() => duplicateRule(rule, index)}
                onMoveUp={() => onChange(moveRoutingRule(value, index, index - 1))}
                onMoveDown={() => onChange(moveRoutingRule(value, index, index + 1))}
                onToggleExpanded={() =>
                  setExpanded((current) => {
                    const next = new Set(current);
                    if (next.has(rule.id)) next.delete(rule.id);
                    else next.add(rule.id);
                    return next;
                  })
                }
                onDragStart={() => setDragging(rule.id)}
                onDragEnd={() => {
                  setDragging(null);
                  setDropTarget(null);
                }}
                onDragOver={() => {
                  if (dragging && dragging !== rule.id) setDropTarget(rule.id);
                }}
                onDrop={() => {
                  const from = value.findIndex((entry) => entry.id === dragging);
                  const to = value.findIndex((entry) => entry.id === rule.id);
                  if (from >= 0 && to >= 0) onChange(moveRoutingRule(value, from, to));
                  setDragging(null);
                  setDropTarget(null);
                }}
              />
            </div>
          );
        })}
      </div>

      <Button
        type="button"
        variant="secondary"
        size="sm"
        className={styles.addRule}
        icon={<IconPlus size={14} />}
        disabled={disabled || value.length >= ROUTING_LIMITS.rules}
        onClick={addRule}
      >
        {t('config_management.visual.routing_rules.add_rule')}
      </Button>
    </div>
  );
});
