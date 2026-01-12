import * as assert from "node:assert";
import * as path from "node:path";
import { URI } from "vscode-uri";
import { DiagnosticSeverity } from "vscode-languageserver/node";
import { parseOutput } from "../server/lint/parseOutput";

suite("parseOutput", () => {
	test("parses diagnostics for matching path", () => {
		const filePath = path.resolve("workspace", "query.sql");
		const uri = URI.file(filePath).toString();
		const stdout = `${filePath}(2,5): error Rule-Name : Bad stuff`;
		const lines = ["select 1;", "select *"];

		const diagnostics = parseOutput({ stdout, uri, cwd: null, lines });

		assert.strictEqual(diagnostics.length, 1);
		const diag = diagnostics[0];
		assert.ok(diag);
		assert.strictEqual(diag.message, "Bad stuff");
		assert.strictEqual(diag.severity, DiagnosticSeverity.Error);
		assert.strictEqual(diag.source, "tsqllint");
		assert.strictEqual(diag.code, "Rule-Name");
		assert.deepStrictEqual(diag.range.start, { line: 1, character: 4 });
		assert.deepStrictEqual(diag.range.end, { line: 1, character: 5 });
	});

	test("normalizes col=-1 to start of line", () => {
		const cwd = path.resolve("workspace");
		const filePath = path.join(cwd, "query.sql");
		const uri = URI.file(filePath).toString();
		const stdout = "query.sql(1,-1): warning RuleX : Heads up";
		const lines = ["select 1;"];

		const diagnostics = parseOutput({ stdout, uri, cwd, lines });

		assert.strictEqual(diagnostics.length, 1);
		const diag = diagnostics[0];
		assert.ok(diag);
		assert.strictEqual(diag.severity, DiagnosticSeverity.Warning);
		assert.deepStrictEqual(diag.range.start, { line: 0, character: 0 });
		assert.deepStrictEqual(diag.range.end, { line: 0, character: 1 });
	});

	test("ignores output for different file paths", () => {
		const cwd = path.resolve("workspace");
		const filePath = path.join(cwd, "query.sql");
		const uri = URI.file(filePath).toString();
		const stdout = "other.sql(1,1): info RuleY : Not for this file";
		const lines = ["select 1;"];

		const diagnostics = parseOutput({ stdout, uri, cwd, lines });

		assert.strictEqual(diagnostics.length, 0);
	});
});
