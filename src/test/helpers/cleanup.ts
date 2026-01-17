/**
 * Cleanup utilities for test file system operations.
 * Provides consistent error handling and retry logic for Windows file locking issues.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { RETRY_CONFIG } from "./testConstants";

/**
 * Options for file/directory removal operations.
 */
export interface RemovalOptions {
	/** Maximum number of retry attempts (default: RETRY_CONFIG.MAX_RETRIES) */
	maxRetries?: number;
	/** Delay between retries in milliseconds (default: RETRY_CONFIG.RETRY_DELAY) */
	retryDelay?: number;
	/** Whether to throw on final failure (default: false for safe cleanup) */
	throwOnFailure?: boolean;
}

/**
 * Removes a file or directory with retry logic for Windows file locking issues.
 *
 * By default, logs errors but doesn't throw to ensure cleanup failures don't
 * mask test failures. Use throwOnFailure: true when guarantees are needed.
 *
 * @param target - Path to file or directory to remove
 * @param options - Removal options
 * @throws Error only if throwOnFailure is true and all retries fail
 */
export async function rmWithRetry(
	target: string,
	options: RemovalOptions = {},
): Promise<void> {
	const maxRetries = options.maxRetries ?? RETRY_CONFIG.MAX_RETRIES;
	const retryDelay = options.retryDelay ?? RETRY_CONFIG.RETRY_DELAY;
	const throwOnFailure = options.throwOnFailure ?? false;

	for (let i = 0; i < maxRetries; i++) {
		try {
			await fs.rm(target, { recursive: true, force: true });
			return;
		} catch (error) {
			const isRetriable =
				error &&
				typeof error === "object" &&
				"code" in error &&
				(error.code === "EBUSY" ||
					error.code === "EPERM" ||
					error.code === "ENOTEMPTY");

			if (isRetriable && i < maxRetries - 1) {
				await sleep(retryDelay);
				continue;
			}

			// Last attempt failed
			if (throwOnFailure) {
				throw error;
			}
			console.error(`Failed to remove ${target}:`, error);
			return;
		}
	}
}

/**
 * Removes a directory with consistent error handling.
 * Wrapper around rmWithRetry with directory-specific defaults.
 *
 * @param dirPath - Path to directory to remove
 * @param options - Removal options
 */
export async function removeDirectory(
	dirPath: string,
	options: RemovalOptions = {},
): Promise<void> {
	try {
		await fs.rm(dirPath, {
			recursive: true,
			force: true,
			maxRetries: options.maxRetries ?? RETRY_CONFIG.MAX_RETRIES,
			retryDelay: options.retryDelay ?? RETRY_CONFIG.RETRY_DELAY,
		});
	} catch (error) {
		if (options.throwOnFailure) {
			throw error;
		}
		// Log error but don't throw - prevents cleanup failures from masking test failures
		console.error(`Failed to remove directory ${dirPath}:`, error);
	}
}

/**
 * Cleans up VS Code workspace test artifacts.
 * Removes .vscode directory and tsqllint-workspace-* temporary directories.
 *
 * @param workspaceRoot - The workspace root URI, or undefined if no workspace
 * @param options - Cleanup options
 */
export async function cleanupWorkspace(
	workspaceRoot: vscode.Uri | undefined,
	options: RemovalOptions = {},
): Promise<void> {
	if (!workspaceRoot) {
		return;
	}

	const workspacePath = workspaceRoot.fsPath;

	// Clean up .vscode directory
	const vscodeDir = vscode.Uri.joinPath(workspaceRoot, ".vscode");
	try {
		await vscode.workspace.fs.delete(vscodeDir, { recursive: true });
	} catch {
		// Ignore errors if directory doesn't exist
	}

	// Clean up any remaining tsqllint-workspace-* directories
	try {
		const entries = await fs.readdir(workspacePath);
		for (const entry of entries) {
			if (entry.startsWith("tsqllint-workspace-")) {
				const fullPath = path.join(workspacePath, entry);
				await removeDirectory(fullPath, options);
			}
		}
	} catch {
		// Ignore errors if workspace root doesn't exist
	}
}

/**
 * Sleeps for the specified number of milliseconds.
 * Use TEST_DELAYS constants for consistent delay values.
 *
 * @param ms - Milliseconds to sleep
 */
export async function sleep(ms: number): Promise<void> {
	await new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}
