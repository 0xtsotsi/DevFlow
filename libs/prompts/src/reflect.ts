/**
 * Reflect Skill Prompt Templates
 *
 * Prompts for the Reflect skill which implements the Reflexion pattern:
 * - Analyzes conversation history for patterns and insights
 * - Generates reflections on task execution
 * - Identifies areas for improvement
 * - Provides feedback for retry attempts
 *
 * Based on research from:
 * - Reflexion: Language Agents with Verbal Reinforcement Learning
 * - LATS (Language Agent Tree Search)
 * - Self-Evolving Agent patterns
 */

/**
 * Reflection analysis prompt
 * Analyzes a conversation to extract insights, strengths, and improvements
 */
export const REFLECT_ANALYSIS_PROMPT = `You are analyzing an AI agent's conversation to generate a reflection.
Review the conversation history and provide insights about the task execution.

## Conversation Analysis

Analyze the following:

### Task Completion
- Was the primary task accomplished?
- What were the key deliverables?
- Were there any incomplete aspects?

### Code Quality
- Is the code well-structured?
- Is it readable and maintainable?
- Are there any obvious bugs or issues?

### Error Handling
- How were errors handled?
- Were error messages informative?
- Was there proper error recovery?

### Decision Making
- What key decisions were made?
- What was the rationale for choices?
- Were alternatives considered?

## Output Format

Provide your analysis in the following format:

### Strengths
- [strength 1]
- [strength 2]
- [strength 3]

### Areas for Improvement
- [improvement 1]
- [improvement 2]
- [improvement 3]

### Key Insights
- [insight 1]
- [insight 2]
- [insight 3]

### Suggested Actions
- [action 1]
- [action 2]
- [action 3]

### Success Score
Provide a score from 0.0 to 1.0 for overall success.`;

/**
 * Reflexion feedback prompt
 * Generates feedback for the next retry attempt
 */
export const REFLEXION_FEEDBACK_PROMPT = `You are providing feedback to improve the next attempt at a task.
Review the previous reflection and generate actionable feedback.

## Previous Reflection Summary

{{STRENGTHS}}

{{IMPROVEMENTS}}

{{SUGGESTED_ACTIONS}}

Previous Success Score: {{SCORE}}%

## Feedback Generation

Generate specific, actionable feedback for the next attempt:

### What to Continue
What approaches worked well and should be maintained?

### What to Change
What specifically should be done differently?

### Specific Suggestions
Provide concrete suggestions for improvement:

1. [specific suggestion 1]
2. [specific suggestion 2]
3. [specific suggestion 3]

### Expected Outcome
What should the next attempt achieve?`;

/**
 * Self-evaluation prompt
 * Evaluates task execution against specific criteria
 */
export const SELF_EVALUATION_PROMPT = `You are evaluating task execution against specific criteria.

## Evaluation Criteria

### Task Completion (40%)
- Was the primary task completed successfully?
- Were all requirements addressed?

### Code Quality (30%)
- Is the code well-structured?
- Is it readable and maintainable?
- Does it follow best practices?

### Error Handling (15%)
- Were errors handled gracefully?
- Were error messages informative?
- Was there proper error recovery?

### Test Coverage (15%)
- Were appropriate tests added?
- Do tests cover key functionality?
- Are tests well-written?

## Scoring

For each criterion:
1. Provide a score from 0.0 to 1.0
2. Explain your reasoning
3. Reference specific evidence from the conversation

## Output Format

### Criterion Scores
- **Task Completion**: [score]/1.0 - [reasoning]
- **Code Quality**: [score]/1.0 - [reasoning]
- **Error Handling**: [score]/1.0 - [reasoning]
- **Test Coverage**: [score]/1.0 - [reasoning]

### Overall Score
[weighted average]/1.0`;

/**
 * Conversation analysis prompt
 * Deep analysis of conversation patterns
 */
export const CONVERSATION_ANALYSIS_PROMPT = `You are analyzing a conversation for patterns and insights.

## Analysis Dimensions

### Tool Usage
- Which tools were used most frequently?
- Were tools used effectively?
- Were there any unnecessary tool calls?

### Error Patterns
- What types of errors occurred?
- How were they resolved?
- Were there recurring error themes?

### Decision Points
- What key decisions were made?
- What was the decision rationale?
- Could better decisions have been made?

### Code Changes
- What files were modified?
- Was the scope of changes appropriate?
- Were changes focused or scattered?

### Communication
- Was the task clearly understood?
- Were clarifications requested when needed?
- Was progress communicated effectively?

## Output Format

### Pattern Summary
[summary of observed patterns]

### Key Observations
- [observation 1]
- [observation 2]
- [observation 3]

### Recommendations
- [recommendation 1]
- [recommendation 2]
- [recommendation 3]`;

/**
 * Reflection summary prompt
 * Creates a concise summary of a reflection
 */
export const REFLECTION_SUMMARY_PROMPT = `Summarize the following reflection into a concise format suitable for storage in memory.

## Reflection Data

### Success Score
{{SCORE}}%

### Strengths
{{STRENGTHS}}

### Improvements
{{IMPROVEMENTS}}

### Key Insights
{{INSIGHTS}}

### Suggested Actions
{{ACTIONS}}

## Summary Format

Generate a 2-3 sentence summary that captures:
1. What was accomplished
2. What could be improved
3. What to do differently next time

Keep it concise and actionable.`;

/**
 * Prompt template for reflection on specific task type
 */
export interface TaskReflectionPrompt {
  taskType: string;
  criteria: string[];
  specificConsiderations: string[];
}

/**
 * Task-specific reflection prompts
 */
export const TASK_REFLECTION_PROMPTS: Record<string, TaskReflectionPrompt> = {
  bugfix: {
    taskType: 'Bug Fix',
    criteria: [
      'Root cause identified',
      'Fix addresses the root cause',
      'No regressions introduced',
      'Tests cover the fix',
    ],
    specificConsiderations: [
      'Was the root cause properly diagnosed?',
      'Does the fix handle edge cases?',
      'Were existing tests updated?',
    ],
  },
  feature: {
    taskType: 'Feature Implementation',
    criteria: [
      'Requirements fully implemented',
      'Code is well-structured',
      'Appropriate error handling',
      'Tests added for new functionality',
    ],
    specificConsiderations: [
      'Is the feature complete per requirements?',
      'Is the code maintainable?',
      'Are error cases handled?',
    ],
  },
  refactor: {
    taskType: 'Refactoring',
    criteria: [
      'Code quality improved',
      'Behavior preserved',
      'Tests still pass',
      'Documentation updated',
    ],
    specificConsiderations: [
      'Is the code more readable?',
      'Was functionality preserved?',
      'Were all tests updated?',
    ],
  },
  test: {
    taskType: 'Test Writing',
    criteria: [
      'Tests are comprehensive',
      'Tests are well-structured',
      'Edge cases covered',
      'Tests are maintainable',
    ],
    specificConsiderations: [
      'Do tests cover happy path?',
      'Are edge cases tested?',
      'Are tests clear and readable?',
    ],
  },
};

/**
 * Get reflection prompt for a specific task type
 */
export function getTaskReflectionPrompt(taskType: string): string {
  const prompt = TASK_REFLECTION_PROMPTS[taskType];
  if (!prompt) {
    return REFLECT_ANALYSIS_PROMPT;
  }

  return `You are analyzing a ${prompt.taskType} task.

## Evaluation Criteria

${prompt.criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## Specific Considerations

${prompt.specificConsiderations.map((c, i) => `- ${c}`).join('\n')}

${REFLECT_ANALYSIS_PROMPT}`;
}

/**
 * Format reflection for display
 */
export interface ReflectionDisplayData {
  successScore: number;
  strengths: string[];
  improvements: string[];
  insights: string[];
  suggestedActions: string[];
  timestamp: string;
}

export function formatReflectionForDisplay(data: ReflectionDisplayData): string {
  const parts: string[] = [];

  parts.push(`# Reflection - ${data.timestamp}`);
  parts.push(`\n**Success Score**: ${(data.successScore * 100).toFixed(1)}%\n`);

  if (data.strengths.length > 0) {
    parts.push('## Strengths');
    data.strengths.forEach((s) => parts.push(`- ${s}`));
    parts.push('');
  }

  if (data.improvements.length > 0) {
    parts.push('## Areas for Improvement');
    data.improvements.forEach((i) => parts.push(`- ${i}`));
    parts.push('');
  }

  if (data.insights.length > 0) {
    parts.push('## Key Insights');
    data.insights.forEach((i) => parts.push(`- ${i}`));
    parts.push('');
  }

  if (data.suggestedActions.length > 0) {
    parts.push('## Suggested Actions');
    data.suggestedActions.forEach((a) => parts.push(`- ${a}`));
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Format feedback for next attempt
 */
export function formatFeedbackForNextAttempt(data: ReflectionDisplayData): string {
  const parts: string[] = [];

  parts.push('## Feedback for Next Attempt\n');
  parts.push(`**Previous Success Score**: ${(data.successScore * 100).toFixed(1)}%\n`);

  if (data.improvements.length > 0) {
    parts.push('### What to Improve');
    data.improvements.forEach((i) => parts.push(`- ${i}`));
    parts.push('');
  }

  if (data.suggestedActions.length > 0) {
    parts.push('### Suggested Actions');
    data.suggestedActions.forEach((a) => parts.push(`- ${a}`));
    parts.push('');
  }

  if (data.strengths.length > 0) {
    parts.push('### What to Continue');
    data.strengths.forEach((s) => parts.push(`- ${s}`));
    parts.push('');
  }

  parts.push('Incorporate this feedback into your next attempt to improve the result.');

  return parts.join('\n');
}
