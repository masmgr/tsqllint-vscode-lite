import * as path from "node:path";
import {
	createConnection,
	ProposedFeatures,
	TextDocumentSyncKind,
	TextDocuments,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { defaultSettings, type TsqllintSettings } from "./config/settings";
import { parseOutput } from "./lint/parseOutput";
import { runTsqllint } from "./lint/runTsqllint";
import type { LintRunResult } from "./lint/types";

type LintReason = "save" | "type" | "manual";
type PendingLint = { reason: LintReason; version: number | null };

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

let workspaceFolders: string[] = [];
let settings: TsqllintSettings = defaultSettings;

const inFlightByUri = new Map<string, AbortController>();
const pendingByUri = new Map<string, PendingLint>();
const debounceTimerByUri = new Map<string, NodeJS.Timeout>();

connection.onInitialize((params) => {
	workspaceFolders =
		params.workspaceFolders?.map((folder) => URI.parse(folder.uri).fsPath) ??
		[];
	return {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
		},
	};
});

connection.onInitialized(async () => {
	await refreshSettings();
});

connection.onDidChangeConfiguration(async () => {
	await refreshSettings();
});

documents.onDidChangeContent((change) => {
	if (!settings.runOnType) {
		return;
	}
	const uri = change.document.uri;
	pendingByUri.set(uri, { reason: "type", version: change.document.version });
	scheduleLint(uri, "type");
});

documents.onDidSave((change) => {
	if (!settings.runOnSave) {
		return;
	}
	const uri = change.document.uri;
	pendingByUri.set(uri, { reason: "save", version: change.document.version });
	void runLintNow(uri, "save");
});

documents.onDidClose((change) => {
	clearDebounce(change.document.uri);
	cancelInFlight(change.document.uri);
	connection.sendDiagnostics({ uri: change.document.uri, diagnostics: [] });
});

connection.onRequest(
	"tsqllint/lintDocument",
	async (params: { uri: string }) => {
		const issues = await runLintNow(params.uri, "manual");
		return { ok: true, issues };
	},
);

connection.onNotification(
	"tsqllint/clearDiagnostics",
	(params: { uris: string[] }) => {
		for (const uri of params.uris) {
			clearDebounce(uri);
			cancelInFlight(uri);
			connection.sendDiagnostics({ uri, diagnostics: [] });
		}
	},
);

documents.listen(connection);
connection.listen();

async function refreshSettings(): Promise<void> {
	const config =
		(await connection.workspace.getConfiguration("tsqllint")) ?? {};
	settings = {
		...defaultSettings,
		...config,
	};
}

function scheduleLint(uri: string, reason: LintReason): void {
	clearDebounce(uri);
	if (reason !== "type") {
		void runLintNow(uri, reason);
		return;
	}
	const timer = setTimeout(() => {
		debounceTimerByUri.delete(uri);
		void runLintNow(uri, "type");
	}, settings.debounceMs);
	debounceTimerByUri.set(uri, timer);
}

function clearDebounce(uri: string): void {
	const timer = debounceTimerByUri.get(uri);
	if (timer) {
		clearTimeout(timer);
		debounceTimerByUri.delete(uri);
	}
}

function cancelInFlight(uri: string): void {
	const controller = inFlightByUri.get(uri);
	if (controller) {
		controller.abort();
		inFlightByUri.delete(uri);
	}
}

async function runLintNow(uri: string, reason: LintReason): Promise<number> {
	clearDebounce(uri);
	cancelInFlight(uri);

	const document = documents.get(uri);
	if (!document) {
		return 0;
	}

	const filePath = URI.parse(uri).fsPath;
	const cwd = resolveCwd(filePath);
	const controller = new AbortController();
	inFlightByUri.set(uri, controller);

	let timedOut = false;
	const timeout = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, settings.timeoutMs);

	let result: LintRunResult;
	try {
		result = await runTsqllint({
			filePath,
			content: document.getText(),
			cwd,
			settings,
			signal: controller.signal,
		});
	} catch (error) {
		clearTimeout(timeout);
		inFlightByUri.delete(uri);
		await connection.window.showWarningMessage(
			`tsqllint: failed to run (${String(error)})`,
		);
		connection.sendDiagnostics({ uri, diagnostics: [] });
		return 0;
	}

	clearTimeout(timeout);
	if (inFlightByUri.get(uri) === controller) {
		inFlightByUri.delete(uri);
	}

	if (timedOut || result.timedOut) {
		await connection.window.showWarningMessage("tsqllint: lint timed out.");
		connection.sendDiagnostics({ uri, diagnostics: [] });
		return 0;
	}

	if (controller.signal.aborted || result.cancelled) {
		return 0;
	}

	if (result.stderr.trim()) {
		connection.console.warn(result.stderr);
	}

	const diagnostics = parseOutput({
		stdout: result.stdout,
		uri,
		cwd,
		lines: document.getText().split(/\r?\n/),
	});

	connection.sendDiagnostics({ uri, diagnostics });
	return diagnostics.length;
}

function resolveCwd(filePath: string): string {
	if (workspaceFolders.length === 0) {
		return path.dirname(filePath);
	}

	for (const folder of workspaceFolders) {
		const normalized = path.resolve(folder);
		if (path.resolve(filePath).startsWith(normalized)) {
			return normalized;
		}
	}

	return workspaceFolders[0] ?? path.dirname(filePath);
}
