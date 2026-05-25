import { Injectable } from '@nestjs/common';

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export type ConditionOperator =
  | '==' | '!=' | '>' | '>=' | '<' | '<='
  | 'in' | 'not_in' | 'notIn' | 'contains';

/** 单条件叶子节点（向下兼容旧 graph_json edge.condition 格式） */
export interface LeafCondition {
  field:    string;
  operator: ConditionOperator;
  value:    any;
}

/** 嵌套规则组（Workflow 2.0 新格式） */
export interface RuleGroup {
  logic: 'AND' | 'OR';
  rules: Array<LeafCondition | RuleGroup>;
}

/** 兼容两种格式 */
export type ConditionNode = LeafCondition | RuleGroup;

// ── 类型守卫 ──────────────────────────────────────────────────────────────────

function isRuleGroup(node: ConditionNode): node is RuleGroup {
  return 'logic' in node && ('rules' in node);
}

function isLeafCondition(node: ConditionNode): node is LeafCondition {
  return 'field' in node && 'operator' in node;
}

// ── 服务 ──────────────────────────────────────────────────────────────────────

@Injectable()
export class ConditionEngineService {
  /**
   * 评估条件节点（LeafCondition 或 RuleGroup）。
   * @param condition - 条件定义（旧单条件或新嵌套规则组）
   * @param variables - 实例变量 + 表单数据的合并 map
   * @returns boolean
   */
  evaluate(condition: ConditionNode | null | undefined, variables: Record<string, any>): boolean {
    if (!condition) return true;
    if (isRuleGroup(condition)) return this.evaluateGroup(condition, variables);
    if (isLeafCondition(condition)) return this.evaluateLeaf(condition, variables);
    return true;
  }

  private evaluateGroup(group: RuleGroup, variables: Record<string, any>): boolean {
    if (!group.rules || group.rules.length === 0) return true;
    if (group.logic === 'AND') {
      return group.rules.every(r => this.evaluate(r, variables));
    }
    return group.rules.some(r => this.evaluate(r, variables));
  }

  private evaluateLeaf(leaf: LeafCondition, variables: Record<string, any>): boolean {
    if (!leaf.field || !leaf.operator) return true;
    const actual   = variables[leaf.field];
    const expected = leaf.value;

    switch (leaf.operator) {
      case '==':
        return String(actual) === String(expected);
      case '!=':
        return String(actual) !== String(expected);
      case '>':
        return Number(actual) > Number(expected);
      case '>=':
        return Number(actual) >= Number(expected);
      case '<':
        return Number(actual) < Number(expected);
      case '<=':
        return Number(actual) <= Number(expected);
      case 'in':
        return Array.isArray(expected) && expected.map(String).includes(String(actual));
      case 'not_in':
      case 'notIn':
        return Array.isArray(expected) && !expected.map(String).includes(String(actual));
      case 'contains':
        return String(actual ?? '').includes(String(expected ?? ''));
      default:
        return false;
    }
  }
}
