---
name: implement
description: Orchestrate full implementation lifecycle with parallel agents (planning, research, implementation, testing)
---

# Implementation Skill

This command orchestrates the complete implementation lifecycle with parallel agents, automatic error fixing, and comprehensive testing.

## Step 1: Parse Implementation Task

Extract the implementation task details:

- **Task Description**: What needs to be implemented
- **Constraints**: Any specific requirements or limitations
- **Testing Requirements**: What tests need to be written
- **Related Files**: Any files that should be modified or referenced

Example task:

```
Implement JWT authentication for the REST API with:
- Token generation and validation
- Refresh token mechanism
- Unit tests for auth middleware
- Integration with existing user service
```

## Step 2: Spawn Parallel Planning and Research Agents

**CRITICAL**: Use a SINGLE response with MULTIPLE Task tool calls to run agents in parallel.

### Planning Agent

- **Agent type**: "general-purpose"
- **Task**: Decompose the implementation task into steps
- **Input**: Task description and constraints
- **Instructions**:
  - Break down the task into clear implementation steps
  - Identify dependencies between steps
  - Consider edge cases and error scenarios
  - Plan the file structure and organization
  - Output a detailed implementation plan with:
    - Step-by-step implementation guide
    - File structure overview
    - Potential risks and mitigation strategies
    - Testing strategy

### Research Agent

- **Agent type**: "general-purpose"
- **Task**: Research best practices and patterns
- **Input**: Task description and planning output
- **Instructions**:
  - Use /research to gather context:
    - Search codebase for similar patterns
    - Research best practices via web
    - Query Beads for past decisions
  - Identify relevant libraries and frameworks
  - Find examples from production code
  - Summarize findings with:
    - Code examples
    - Best practices
    - Common pitfalls to avoid
    - Recommended approaches

**Example of spawning agents in parallel:**

```
In a SINGLE message, make TWO Task tool calls:
1. Task tool call for planning agent
2. Task tool call for research agent
```

## Step 3: Implement with Auto-Fix Loop

After planning and research complete, spawn the Implementation Agent:

### Implementation Agent

- **Agent type**: "general-purpose"
- **Task**: Write the implementation code
- **Input**: Planning output, research output, and task description
- **Instructions**:
  - Follow the implementation plan from Planning Agent
  - Apply best practices from Research Agent
  - Write clean, well-documented code
  - Follow project code style and conventions
  - Implement error handling
  - Update relevant files

### Auto-Fix Loop (Max 3 Iterations)

After implementation, run quality checks:

1. **Run linting and typechecking**:

   ```bash
   npm run lint --workspace=apps/server
   npx tsc --noEmit --project apps/server/tsconfig.json
   ```

2. **If errors are found**, spawn Debug Agent:
   - **Agent type**: "general-purpose"
   - **Task**: Fix all linting and typechecking errors
   - **Input**: Complete error output with file paths, line numbers, and error messages
   - **Instructions**:
     - Fix each error by reading the affected file
     - Make minimal changes to fix the issues
     - Preserve existing functionality
     - Re-run checks to verify all issues are resolved
     - Report any errors that couldn't be fixed

3. **Repeat** up to 3 times until all checks pass or max iterations reached

## Step 4: Test with Auto-Fix Loop

After implementation passes quality checks, spawn Testing Agent:

### Testing Agent

- **Agent type**: "general-purpose"
- **Task**: Write and run tests
- **Input**: Implementation output and testing requirements
- **Instructions**:
  - Write comprehensive unit tests
  - Write integration tests if needed
  - Test edge cases and error scenarios
  - Ensure good test coverage
  - Run tests and verify they pass

### Test Auto-Fix Loop (Max 3 Iterations)

1. **Run the test suite**:

   ```bash
   npm run test --workspace=apps/server
   ```

2. **If tests fail**, spawn Debug Agent:
   - **Agent type**: "general-purpose"
   - **Task**: Fix failing tests
   - **Input**: Test failure output
   - **Instructions**:
     - Analyze test failures
     - Fix implementation or tests as appropriate
     - Re-run tests to verify
     - Continue until all tests pass

3. **Repeat** up to 3 times until all tests pass or max iterations reached

## Step 5: Final Verification and Summary

After all phases complete:

1. **Run full quality check**:

   ```bash
   npm run lint --workspace=apps/server
   npx tsc --noEmit --project apps/server/tsconfig.json
   npm run test --workspace=apps/server
   ```

2. **Generate summary**:

   ```markdown
   # Implementation Complete: [Task Description]

   ## Summary

   - Files modified: X
   - Tests written: Y
   - Errors fixed: Z
   - Total duration: T minutes

   ## Changes Made

   - `path/to/file1.ts`: [Description]
   - `path/to/file2.ts`: [Description]

   ## Tests Created

   - `path/to/test1.spec.ts`: [Description]
   - `path/to/test2.spec.ts`: [Description]

   ## Quality Checks

   - Linting: PASSED
   - Type checking: PASSED
   - Tests: PASSED (X/X)

   ## Next Steps

   - [Optional next steps]
   ```

## Error Handling

If any phase fails after max iterations:

- Report the failure clearly
- Include error logs and context
- Suggest manual intervention steps
- Create a Beads issue if needed

## Notes

- All agents in each phase run in parallel
- Auto-fix loops prevent cascading failures
- Pre/post-task hooks can be configured
- All progress is logged to events
- Integration with Beads for issue tracking
