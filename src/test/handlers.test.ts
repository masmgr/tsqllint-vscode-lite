import * as assert from "node:assert";
import { URI } from "vscode-uri";
import { handleDidDeleteFiles, handleDidRenameFiles } from "../client/handlers";
import type { LanguageClient } from "vscode-languageclient/node";

suite("handlers", () => {
	suite("handleDidDeleteFiles", () => {
		test("sends clearDiagnostics notification with deleted URIs", async () => {
			const deletedUris = [
				URI.file("/path/to/file1.sql"),
				URI.file("/path/to/file2.sql"),
			];
			const notifications: Array<{
				method: string;
				params: unknown;
			}> = [];

			const mockClient = {
				sendNotification(method: string, params: unknown) {
					notifications.push({ method, params });
				},
			} as unknown as LanguageClient;

			const event = {
				files: deletedUris,
			};

			await handleDidDeleteFiles(event, mockClient, Promise.resolve());

			assert.strictEqual(notifications.length, 1);
			assert.strictEqual(notifications[0]?.method, "tsqllint/clearDiagnostics");
			assert.deepStrictEqual(notifications[0]?.params, {
				uris: deletedUris.map((uri) => uri.toString()),
			});
		});

		test("does nothing when client is undefined", async () => {
			const event = {
				files: [URI.file("/path/to/file.sql")],
			};

			// Should not throw
			await handleDidDeleteFiles(event, undefined, Promise.resolve());
		});

		test("waits for clientReady before sending notification", async () => {
			let readyResolved = false;
			const clientReady = new Promise<void>((resolve) => {
				setTimeout(() => {
					readyResolved = true;
					resolve();
				}, 10);
			});

			const notifications: Array<{
				method: string;
				params: unknown;
			}> = [];

			const mockClient = {
				sendNotification(method: string, params: unknown) {
					assert.ok(
						readyResolved,
						"Client should be ready before sending notification",
					);
					notifications.push({ method, params });
				},
			} as unknown as LanguageClient;

			const event = {
				files: [URI.file("/path/to/file.sql")],
			};

			await handleDidDeleteFiles(event, mockClient, clientReady);

			assert.strictEqual(notifications.length, 1);
		});
	});

	suite("handleDidRenameFiles", () => {
		test("sends clearDiagnostics notification with old URIs", async () => {
			const oldUris = [
				URI.file("/path/to/old1.sql"),
				URI.file("/path/to/old2.sql"),
			];
			const newUris = [
				URI.file("/path/to/new1.sql"),
				URI.file("/path/to/new2.sql"),
			];
			const notifications: Array<{
				method: string;
				params: unknown;
			}> = [];

			const mockClient = {
				sendNotification(method: string, params: unknown) {
					notifications.push({ method, params });
				},
			} as unknown as LanguageClient;

			const event = {
				files: oldUris.map((oldUri, i) => ({
					oldUri,
					newUri: newUris[i] ?? URI.file(""),
				})),
			};

			await handleDidRenameFiles(event, mockClient, Promise.resolve());

			assert.strictEqual(notifications.length, 1);
			assert.strictEqual(notifications[0]?.method, "tsqllint/clearDiagnostics");
			assert.deepStrictEqual(notifications[0]?.params, {
				uris: oldUris.map((uri) => uri.toString()),
			});
		});

		test("does nothing when client is undefined", async () => {
			const event = {
				files: [
					{
						oldUri: URI.file("/path/to/old.sql"),
						newUri: URI.file("/path/to/new.sql"),
					},
				],
			};

			// Should not throw
			await handleDidRenameFiles(event, undefined, Promise.resolve());
		});

		test("waits for clientReady before sending notification", async () => {
			let readyResolved = false;
			const clientReady = new Promise<void>((resolve) => {
				setTimeout(() => {
					readyResolved = true;
					resolve();
				}, 10);
			});

			const notifications: Array<{
				method: string;
				params: unknown;
			}> = [];

			const mockClient = {
				sendNotification(method: string, params: unknown) {
					assert.ok(
						readyResolved,
						"Client should be ready before sending notification",
					);
					notifications.push({ method, params });
				},
			} as unknown as LanguageClient;

			const event = {
				files: [
					{
						oldUri: URI.file("/path/to/old.sql"),
						newUri: URI.file("/path/to/new.sql"),
					},
				],
			};

			await handleDidRenameFiles(event, mockClient, clientReady);

			assert.strictEqual(notifications.length, 1);
		});
	});
});
