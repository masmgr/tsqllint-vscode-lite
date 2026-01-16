import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

export type FakeCli = {
	commandPath: string;
	cleanup: () => Promise<void>;
};

export async function rmWithRetry(
	target: string,
	maxRetries = 30,
	delayMs = 100,
): Promise<void> {
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
				await new Promise((r) => setTimeout(r, delayMs));
				continue;
			}
			throw error;
		}
	}
}

export async function createFakeCli(scriptBody: string): Promise<FakeCli> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tsqllint-fake-"));
	const scriptPath = path.join(dir, "fake-tsqllint.js");
	await fs.writeFile(scriptPath, `${scriptBody}\n`, "utf8");

	const nodePath = process.execPath;
	let commandPath: string;

	if (process.platform === "win32") {
		commandPath = path.join(dir, "fake-tsqllint.cmd");
		const cmd = `@echo off\r\n"${nodePath}" "${scriptPath}" %*\r\n`;
		await fs.writeFile(commandPath, cmd, "utf8");
	} else {
		commandPath = path.join(dir, "fake-tsqllint");
		const sh = `#!/bin/sh\n"${nodePath}" "${scriptPath}" "$@"\n`;
		await fs.writeFile(commandPath, sh, "utf8");
		await fs.chmod(commandPath, 0o755);
	}

	return {
		commandPath,
		cleanup: async () => {
			await rmWithRetry(dir);
		},
	};
}
