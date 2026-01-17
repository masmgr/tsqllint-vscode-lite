import * as assert from "node:assert";
import * as vscode from "vscode";
import { runE2ETest } from "./helpers/e2eTestHarness";
import { cleanupWorkspace } from "./helpers/cleanup";
import {
	TEST_TIMEOUTS,
	TEST_DELAYS,
	FAKE_CLI_RULES,
} from "./helpers/testConstants";

suite("Extension Test Suite", () => {
	suiteTeardown(async () => {
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
		await cleanupWorkspace(workspaceRoot);
	});

	test("updates diagnostics after lint run", async function () {
		this.timeout(TEST_TIMEOUTS.MOCHA_TEST);

		await runE2ETest(
			{
				fakeCliRule: FAKE_CLI_RULES.FAKE_RULE,
				fakeCliSeverity: "error",
				config: { runOnSave: true },
				documentContent: "select 1;",
			},
			async (context, harness) => {
				const editor = await vscode.window.showTextDocument(context.document, {
					preview: false,
				});
				await editor.edit((builder) => {
					builder.insert(new vscode.Position(0, 0), "-- test\n");
				});
				await context.document.save();

				const diagnostics = await harness.waitForDiagnostics(
					context.document.uri,
					(entries) => entries.length >= 1,
				);
				const match = diagnostics.find(
					(diag) =>
						diag.source === "tsqllint" &&
						diag.code === FAKE_CLI_RULES.FAKE_RULE,
				);
				assert.ok(match);
				assert.strictEqual(match.message, "Fake issue");
			},
		);
	});

	test("tsqllint-lite.run updates diagnostics when runOnSave=false", async function () {
		this.timeout(TEST_TIMEOUTS.MOCHA_TEST);

		await runE2ETest(
			{
				fakeCliRule: FAKE_CLI_RULES.MANUAL_RULE,
				fakeCliSeverity: "error",
				config: { runOnSave: false, runOnType: false },
				documentContent: "select 1;",
			},
			async (context, harness) => {
				await vscode.window.showTextDocument(context.document, {
					preview: false,
				});

				await vscode.commands.executeCommand("tsqllint-lite.run");

				const diagnostics = await harness.waitForDiagnostics(
					context.document.uri,
					(entries) => entries.length >= 1,
				);
				const match = diagnostics.find(
					(diag) =>
						diag.source === "tsqllint" &&
						diag.code === FAKE_CLI_RULES.MANUAL_RULE,
				);
				assert.ok(match);
			},
		);
	});

	test("run-on-type lints unsaved edits", async function () {
		this.timeout(TEST_TIMEOUTS.MOCHA_TEST);

		await runE2ETest(
			{
				fakeCliRule: FAKE_CLI_RULES.TYPE_RULE,
				fakeCliSeverity: "warning",
				config: {
					runOnType: true,
					debounceMs: TEST_DELAYS.DEBOUNCE_SHORT,
					runOnSave: false,
				},
				documentContent: "",
			},
			async (context, harness) => {
				const editor = await vscode.window.showTextDocument(context.document, {
					preview: false,
				});

				await editor.edit((builder) => {
					builder.insert(new vscode.Position(0, 0), "select 1;");
				});

				const diagnostics = await harness.waitForDiagnostics(
					context.document.uri,
					(entries) => entries.length >= 1,
				);
				const match = diagnostics.find(
					(diag) =>
						diag.source === "tsqllint" &&
						diag.code === FAKE_CLI_RULES.TYPE_RULE,
				);
				assert.ok(match);
			},
		);
	});

	// Note: File rename/delete event handling is tested in unit tests
	// (handlers.test.ts) which directly test handleDidRenameFiles() and
	// handleDidDeleteFiles() without depending on VS Code file system events.
	// E2E tests for these scenarios are unreliable due to test environment
	// limitations with file watchers.
});
