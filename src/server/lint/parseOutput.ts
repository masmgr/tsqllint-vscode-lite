import * as path from "node:path";
import {
	DiagnosticSeverity,
	type Diagnostic,
} from "vscode-languageserver/node";
import { URI } from "vscode-uri";

const pattern =
	/^(?<path>.+?)\((?<line>\d+),(?<col>-?\d+)\):\s+(?<severity>\w+)\s+(?<rule>[^:]+)\s+:\s+(?<message>.+)$/;

type ParseOutputOptions = {
	stdout: string;
	uri: string;
	cwd: string | null;
	lines: string[];
};

function normalizeForCompare(filePath: string): string {
	const normalized = path.normalize(filePath);
	if (process.platform === "win32") {
		return normalized.toLowerCase();
	}
	return normalized;
}

function mapSeverity(severity: string): DiagnosticSeverity {
	const normalized = severity.toLowerCase();
	if (normalized === "error") {
		return DiagnosticSeverity.Error;
	}
	if (normalized === "warning") {
		return DiagnosticSeverity.Warning;
	}
	return DiagnosticSeverity.Information;
}

export function parseOutput(options: ParseOutputOptions): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	const targetPath = normalizeForCompare(URI.parse(options.uri).fsPath);
	const cwd = options.cwd ?? path.dirname(targetPath);

	for (const line of options.stdout.split(/\r?\n/)) {
		if (!line.trim()) {
			continue;
		}
		const match = pattern.exec(line);
		const groups = match?.groups as
			| {
					path: string;
					line: string;
					col: string;
					severity: string;
					rule: string;
					message: string;
			  }
			| undefined;
		if (!groups) {
			continue;
		}

		const rawPath = groups.path;
		if (!rawPath) {
			continue;
		}
		const resolvedPath = normalizeForCompare(path.resolve(cwd, rawPath));
		if (resolvedPath !== targetPath) {
			continue;
		}

		const rawLine = groups.line;
		const rawCol = groups.col;
		const rawSeverity = groups.severity;
		const rawRule = groups.rule;
		const rawMessage = groups.message;
		if (!rawLine || !rawCol || !rawSeverity || !rawRule || !rawMessage) {
			continue;
		}

		const lineNumber = Math.max(0, Number(rawLine) - 1);
		const rawColumn = Number(rawCol);
		const column = rawColumn <= 0 ? 0 : rawColumn - 1;
		const lineText = options.lines[lineNumber] ?? "";
		const lineLength = lineText.length;

		const start = { line: lineNumber, character: column };
		const end =
			column >= lineLength
				? { line: lineNumber, character: lineLength }
				: { line: lineNumber, character: column + 1 };

		diagnostics.push({
			message: rawMessage,
			severity: mapSeverity(rawSeverity),
			range: { start, end },
			code: rawRule,
			source: "tsqllint",
		});
	}

	return diagnostics;
}
