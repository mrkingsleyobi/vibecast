/**
 * Decision Framework
 * Implements decision-making algorithms for the DXP agency
 */

import {
  DecisionFramework,
  DecisionCriteria,
  Alternative,
  Priority
} from '../models/business-requirements';
import { v4 as uuidv4 } from 'uuid';

export class DecisionEngine {
  /**
   * Multi-criteria decision analysis using weighted scoring
   */
  public evaluateAlternatives(
    name: string,
    type: DecisionFramework['type'],
    criteria: DecisionCriteria[],
    alternatives: Partial<Alternative>[]
  ): DecisionFramework {
    // Normalize weights to sum to 1
    const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
    const normalizedCriteria = criteria.map(c => ({
      ...c,
      weight: c.weight / totalWeight
    }));

    // Calculate weighted scores for each alternative
    const scoredAlternatives = alternatives.map(alt => {
      let totalScore = 0;
      const scores: Record<string, number> = {};

      normalizedCriteria.forEach(criterion => {
        const score = alt.scores?.[criterion.id] || 50; // Default to neutral score
        scores[criterion.id] = score;
        totalScore += score * criterion.weight;
      });

      return {
        id: alt.id || uuidv4(),
        name: alt.name || 'Unknown',
        scores,
        totalScore,
        pros: alt.pros || [],
        cons: alt.cons || [],
        estimatedCost: alt.estimatedCost || 0,
        estimatedTime: alt.estimatedTime || 0,
        risk: alt.risk || 50
      };
    });

    // Sort by total score (descending)
    scoredAlternatives.sort((a, b) => b.totalScore - a.totalScore);

    return {
      id: uuidv4(),
      name,
      type,
      criteria: normalizedCriteria,
      weightedScore: scoredAlternatives[0]?.totalScore || 0,
      recommendation: scoredAlternatives[0]?.name || 'No recommendation',
      alternatives: scoredAlternatives
    };
  }

  /**
   * Risk-adjusted decision making
   */
  public calculateRiskAdjustedValue(
    value: number,
    probability: number,
    risk: number
  ): number {
    // Risk adjustment factor: higher risk reduces the expected value
    const riskFactor = 1 - (risk / 100) * 0.5; // Max 50% reduction
    const expectedValue = value * (probability / 100) * riskFactor;
    return expectedValue;
  }

  /**
   * Priority scoring using RICE framework (Reach, Impact, Confidence, Effort)
   */
  public calculateRICEScore(
    reach: number,
    impact: number,
    confidence: number,
    effort: number
  ): number {
    if (effort === 0) return 0;
    return (reach * impact * (confidence / 100)) / effort;
  }

  /**
   * Cost-benefit analysis
   */
  public analyzeCostBenefit(
    benefits: number,
    costs: number,
    timeframe: number = 1
  ): CostBenefitAnalysis {
    const netBenefit = benefits - costs;
    const roi = costs > 0 ? ((benefits - costs) / costs) * 100 : 0;
    const paybackPeriod = benefits > 0 ? costs / (benefits / timeframe) : Infinity;
    const bcRatio = costs > 0 ? benefits / costs : 0;

    return {
      benefits,
      costs,
      netBenefit,
      roi,
      paybackPeriod,
      benefitCostRatio: bcRatio,
      recommendation: bcRatio >= 1.5 ? 'PROCEED' : bcRatio >= 1.0 ? 'CONSIDER' : 'REJECT'
    };
  }

  /**
   * Decision tree for complex scenarios
   */
  public evaluateDecisionTree(root: DecisionNode): DecisionPath {
    const paths = this.getAllPaths(root);

    // Calculate expected value for each path
    const pathValues = paths.map(path => {
      let probability = 1;
      let value = 0;

      path.forEach(node => {
        probability *= node.probability;
        value += node.value;
      });

      return {
        path,
        expectedValue: probability * value,
        probability
      };
    });

    // Sort by expected value
    pathValues.sort((a, b) => b.expectedValue - a.expectedValue);

    return {
      bestPath: pathValues[0].path,
      expectedValue: pathValues[0].expectedValue,
      allPaths: pathValues
    };
  }

  private getAllPaths(node: DecisionNode, currentPath: DecisionNode[] = []): DecisionNode[][] {
    const newPath = [...currentPath, node];

    if (!node.children || node.children.length === 0) {
      return [newPath];
    }

    const paths: DecisionNode[][] = [];
    node.children.forEach(child => {
      const childPaths = this.getAllPaths(child, newPath);
      paths.push(...childPaths);
    });

    return paths;
  }

  /**
   * Consensus building for federated decision making
   */
  public buildConsensus(votes: Vote[], threshold: number = 0.6): ConsensusResult {
    const totalVotes = votes.length;
    if (totalVotes === 0) {
      return {
        consensusReached: false,
        confidence: 0,
        decision: null,
        votingResults: {}
      };
    }

    // Count votes by option
    const voteCounts: Record<string, number> = {};
    const weightedVotes: Record<string, number> = {};

    votes.forEach(vote => {
      voteCounts[vote.option] = (voteCounts[vote.option] || 0) + 1;
      weightedVotes[vote.option] = (weightedVotes[vote.option] || 0) + vote.weight;
    });

    const totalWeight = votes.reduce((sum, v) => sum + v.weight, 0);

    // Find option with highest weighted vote
    let maxOption = '';
    let maxWeightedVote = 0;

    Object.entries(weightedVotes).forEach(([option, weight]) => {
      if (weight > maxWeightedVote) {
        maxWeightedVote = weight;
        maxOption = option;
      }
    });

    const consensusReached = (maxWeightedVote / totalWeight) >= threshold;

    return {
      consensusReached,
      confidence: maxWeightedVote / totalWeight,
      decision: consensusReached ? maxOption : null,
      votingResults: {
        counts: voteCounts,
        weights: weightedVotes,
        threshold,
        participation: totalVotes
      }
    };
  }
}

export interface CostBenefitAnalysis {
  benefits: number;
  costs: number;
  netBenefit: number;
  roi: number;
  paybackPeriod: number;
  benefitCostRatio: number;
  recommendation: 'PROCEED' | 'CONSIDER' | 'REJECT';
}

export interface DecisionNode {
  id: string;
  name: string;
  type: 'DECISION' | 'CHANCE' | 'OUTCOME';
  value: number;
  probability: number;
  children?: DecisionNode[];
}

export interface DecisionPath {
  bestPath: DecisionNode[];
  expectedValue: number;
  allPaths: Array<{
    path: DecisionNode[];
    expectedValue: number;
    probability: number;
  }>;
}

export interface Vote {
  voter: string;
  option: string;
  weight: number;
  confidence: number;
  rationale?: string;
}

export interface ConsensusResult {
  consensusReached: boolean;
  confidence: number;
  decision: string | null;
  votingResults: {
    counts: Record<string, number>;
    weights: Record<string, number>;
    threshold: number;
    participation: number;
  };
}
