# Change Log

All notable changes to the "tsqllint-lite" extension will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-01-20

### Added
- **TSQLLint installation verification**: Proactive startup check for tsqllint availability with user-friendly error messages
- **Comprehensive logging system**: Added logging infrastructure for better debugging and diagnostics
- **Updated Node.js support**: Upgraded to Node.js 24 for improved performance and security

### Changed
- **Dependency updates**:
  - Updated Biome from 1.9.4 to 2.3.11 for better code quality tooling
  - Bumped GitHub Actions dependencies to latest versions (actions/checkout, actions/setup-node, actions/upload-artifact, softprops/action-gh-release)
- **Project structure**: Cleaned up `.vscode-test` configuration files for simpler testing setup
- **CI/CD**: Consolidated develop and main branches for streamlined release workflow

### Fixed
- Biome linting errors from dependencies update

---

## [0.0.2] - 2026-01-19

### Fixed
- **CI/CD improvements**:
  - Fixed release workflow permissions to enable GitHub Actions deployment
  - Enhanced `.github/workflows/release.yml` with proper write permissions

### Changed
- Updated version in package.json to 0.0.2
- Updated version badge in README.md

---

## [0.0.1] - 2026-01-18

### Added
- **Real-time T-SQL linting** with TSQLLint integration
- **Language Server Protocol (LSP) architecture** for non-blocking, efficient operation
  - Client-server architecture with separate processes
  - Supports document synchronization and lifecycle management
- **Automatic linting triggers**:
  - On save (`tsqllint.runOnSave` setting, enabled by default)
  - On open (`tsqllint.runOnOpen` setting, enabled by default)
  - While typing (`tsqllint.runOnType` setting, disabled by default)
- **Manual lint command**: `TSQLLint: Run` for on-demand linting
- **Intelligent lint scheduling**:
  - Concurrent execution control (max 4 simultaneous lint processes)
  - Smart queuing for pending lint requests
  - Debouncing for typing events (configurable via `tsqllint.debounceMs`)
  - Document version tracking to ensure accuracy
- **Customizable diagnostic display**:
  - Full-line highlighting for all diagnostics (rangeMode removed for simplicity)
- **Flexible configuration options**:
  - Custom TSQLLint executable path (`tsqllint.path`)
  - Custom TSQLLint config file path (`tsqllint.configPath`)
  - Configurable timeout (`tsqllint.timeoutMs`, default 10 seconds)
  - Configurable debounce delay (`tsqllint.debounceMs`, default 500ms)
  - Auto-lint on open setting (`tsqllint.runOnOpen`)
- **Cross-platform support**:
  - Windows, macOS, and Linux compatibility
  - Proper handling of Windows `.cmd` and `.bat` executables
  - Case-insensitive path comparison on Windows
  - Command line output encoding detection and handling
- **File lifecycle management**:
  - Temporary file support for linting unsaved documents
  - Diagnostics clearing on file delete and rename operations
- **Comprehensive error handling**:
  - Process timeout protection
  - Cancellation support for in-flight lint requests
  - Executable resolution with caching (30s TTL)
- **Development tooling**:
  - Comprehensive test suite (unit tests with 52%+ coverage and E2E tests)
  - Pre-commit hooks with Husky for code quality
  - Automated formatting and linting with Biome
  - CI/CD workflow with GitHub Actions
  - Dependabot for automated dependency updates

### Technical Details
- Uses `vscode-languageclient` and `vscode-languageserver` for LSP implementation
- Built with esbuild for optimized bundle size
- Written in TypeScript with strict type checking
- Test framework: Mocha for unit tests, VS Code Test for E2E tests
- Code coverage with c8 (targets: 50% lines, 80% functions, 75% branches)

### Documentation
- Comprehensive README with installation and usage instructions
- DEVELOPMENT.md for contributor guidance
- ARCHITECTURE.md explaining the internal design
- CLAUDE.md with AI coding assistant instructions

### Requirements
- VS Code version 1.108.1 or higher
- TSQLLint CLI must be installed separately (via .NET CLI, Chocolatey, or manual installation)

---

**Note**: This is the initial release. Future versions will be documented here with their respective changes.