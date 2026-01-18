# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is `tsqllint-lite`, a VS Code extension that integrates TSQLLint (a T-SQL linter) into the editor. It provides real-time linting for SQL files with support for both manual and automatic linting.

## Build and Test Commands

### Development
```bash
npm install              # Install dependencies
npm run build            # Bundle extension/server to dist/ with esbuild
npm run compile          # Compile TypeScript to out/ (for tests)
npm run watch            # Watch mode for development (esbuild)
npm run typecheck        # Type-check without emitting
```

### Code Quality
```bash
npm run lint             # Lint with Biome
npm run format           # Format with Biome
```

### Testing
```bash
npm test                 # Run unit tests (builds to dist/ + compiles tests to out/)
npm run test:e2e         # Run E2E tests (builds to dist/ + compiles tests to out/)
```

**Build Process for Tests**: The test scripts run both `npm run build` (to bundle extension code to `dist/`) and `npm run compile` (to compile test files to `out/`). This is necessary because VS Code loads the extension from `dist/extension.js` while the test runner executes tests from `out/test/**/*.test.js`.

The test runner uses `@vscode/test-cli` with a fixture workspace at [test/fixtures/workspace/](test/fixtures/workspace/).

## Architecture

### Language Server Pattern

This extension uses the **Language Server Protocol (LSP)** architecture with separate client and server processes:

- **Client** ([src/client/client.ts](src/client/client.ts)): Runs in the VS Code extension host
  - Creates and manages the LanguageClient connection
  - Registers commands (`tsqllint-lite.run`)
  - Handles file lifecycle events (delete, rename)

- **Server** ([src/server/server.ts](src/server/server.ts)): Runs in a separate Node.js process
  - Manages document synchronization
  - Handles lint requests and diagnostics
  - Coordinates with the LintScheduler

This separation allows the linting logic to run independently without blocking the VS Code UI.

### Core Components

#### 1. LintScheduler ([src/server/lint/scheduler.ts](src/server/lint/scheduler.ts))

Manages concurrent lint execution with sophisticated queuing:
- **Semaphore-based concurrency control**: Limits to 4 concurrent lints (`maxConcurrentRuns`)
- **Smart queuing**: Queues pending lints when max concurrency is reached
- **Debouncing**: For "type" events (default 500ms), prevents excessive linting during typing
- **Version tracking**: Ensures lints run against the correct document version
- **Priority handling**: Manual lints (`reason: "manual"`) bypass debouncing and run immediately

The scheduler handles four lint reasons:
- `"save"`: Triggered on document save
- `"type"`: Triggered during typing (if `runOnType` is enabled)
- `"manual"`: Triggered by explicit commands
- `"open"`: Triggered when document is opened (if `runOnOpen` is enabled)

#### 2. TSQLLint Runner ([src/server/lint/runTsqllint.ts](src/server/lint/runTsqllint.ts))

Executes the tsqllint CLI with proper process management:
- **Executable resolution**: Finds tsqllint via `settings.path` or PATH with caching (30s TTL)
- **Windows handling**: Wraps `.cmd`/`.bat` files with `cmd.exe /c`
- **Timeout protection**: Kills processes exceeding `settings.timeoutMs` (default 10s)
- **Cancellation support**: Respects AbortSignal for clean cancellation

#### 3. Output Parser ([src/server/lint/parseOutput.ts](src/server/lint/parseOutput.ts))

Parses tsqllint output into VS Code diagnostics:
- **Pattern**: `<file>(<line>,<col>): <severity> <rule> : <message>`
- **Range modes**:
  - `"character"`: Highlights single character at error position
  - `"line"`: Highlights entire line
- **Path normalization**: Handles Windows case-insensitivity and path resolution
- **Temporary file support**: Maps temp file paths back to original URIs

#### 4. Document Lifecycle Management

The server tracks document state throughout its lifecycle:
- **Unsaved documents**: Creates temporary files in `os.tmpdir()` for linting
- **Version tracking**: Uses `savedVersionByUri` to distinguish saved vs modified states
- **Cleanup**: Removes temporary files and clears diagnostics on document close

### Data Flow

1. User edits SQL file or triggers command
2. Client sends request to server via LSP
3. Server's `LintScheduler` queues the lint request
4. When a slot is available, `runTsqllint()` spawns the CLI process
5. `parseOutput()` converts stdout to VS Code diagnostics
6. Server sends diagnostics back to client
7. Client displays squiggles and problems panel

## Configuration

The extension contributes these settings (namespace: `tsqllint`):

- `path`: Custom tsqllint executable path (default: searches PATH)
- `configPath`: TSQLLint config file path (passed as `-c` argument)
- `runOnSave`: Auto-lint on save (default: true)
- `runOnType`: Lint while typing (default: false)
- `runOnOpen`: Auto-lint on open (default: true)
- `debounceMs`: Debounce delay for typing (default: 500)
- `timeoutMs`: Process timeout (default: 10000)
- `rangeMode`: Diagnostic range mode - "character" or "line" (default: "character")

## Testing Strategy

Tests are organized into three categories:

1. **Unit tests** ([src/test/](src/test/)): Test individual functions like `parseOutput()` and `runTsqllint()`
2. **Extension tests** ([src/test/extension.test.ts](src/test/extension.test.ts)): Test extension activation and commands
3. **E2E tests** ([src/e2e/](src/e2e/)): Test full integration with tsqllint CLI

Use the fake CLI helper ([src/test/helpers/fakeCli.ts](src/test/helpers/fakeCli.ts)) for mocking tsqllint in tests.

## Testing Architecture

### Test Organization

Tests are organized into unit tests and E2E tests:

1. **Unit Tests**: Test individual functions in isolation
   - [parseOutput.test.ts](src/test/parseOutput.test.ts) - Output parser tests
   - [runTsqllint.test.ts](src/test/runTsqllint.test.ts) - CLI runner tests
   - [handlers.test.ts](src/test/handlers.test.ts) - File event handler tests

2. **E2E Tests**: Test full integration with VS Code
   - [extension.test.ts](src/test/extension.test.ts) - Extension activation and commands

3. **Test Helpers** ([src/test/helpers/](src/test/helpers/)):
   - `testConstants.ts` - Centralized test timeouts, delays, and constants
   - `cleanup.ts` - File system cleanup utilities with retry logic
   - `testFixtures.ts` - Reusable test data factories (fakeCli, workspaces, configs)
   - `e2eTestHarness.ts` - E2E test setup/teardown automation
   - `fakeCli.ts` - Mock tsqllint CLI helper

### Writing E2E Tests

Use the test harness for all E2E tests:

```typescript
import { runE2ETest } from './helpers/e2eTestHarness';
import { TEST_TIMEOUTS, FAKE_CLI_RULES } from './helpers/testConstants';

test("my test", async function () {
  this.timeout(TEST_TIMEOUTS.MOCHA_TEST);

  await runE2ETest(
    {
      fakeCliRule: FAKE_CLI_RULES.MY_RULE,
      config: { runOnSave: true },
      documentContent: 'select 1;',
    },
    async (context, harness) => {
      // Test implementation
      const diagnostics = await harness.waitForDiagnostics(
        context.document.uri,
        (entries) => entries.length >= 1
      );
      // Assertions...
    }
  );
});
```

### Test Constants

All timeouts, delays, and retry values are centralized in `testConstants.ts`:
- Use `TEST_TIMEOUTS.*` for timeout values
- Use `TEST_DELAYS.*` for sleep/delay values
- Use `RETRY_CONFIG.*` for retry attempts and delays
- Use `FAKE_CLI_RULES.*` for consistent rule names

### Best Practices

1. **Always use constants**: Never hardcode timeouts or delays
2. **Always use harness**: New E2E tests must use `runE2ETest()`
3. **Always use factories**: Don't create inline fakeCli scripts
4. **Document in CLAUDE.md**: Keep test architecture section updated

## Important Implementation Notes

### Windows Compatibility
- Always use `path.resolve()` and `path.normalize()` for file paths
- Use case-insensitive comparison on Windows (`normalizeForCompare()`)
- Wrap `.cmd`/.bat` executables with `cmd.exe /c`

### Concurrency and Cancellation
- The `LintScheduler` prevents resource exhaustion with its semaphore
- All lint operations support cancellation via AbortSignal
- In-flight requests are tracked in `inFlightByUri` map and cancelled when superseded

### Error Handling
- TSQLLint errors go to stderr and are shown as warnings
- CLI spawn errors reject the promise and clear diagnostics

### TypeScript Configuration
This project uses strict TypeScript settings including:
- `strict: true`
- `noUncheckedIndexedAccess: true`
- `exactOptionalPropertyTypes: true`
- Always handle array access with optional chaining or default values
