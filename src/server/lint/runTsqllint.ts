import type { TsqllintSettings } from "../config/settings";
import type { LintRunResult } from "./types";

export type RunTsqllintOptions = {
	filePath: string;
	content: string;
	cwd: string;
	settings: TsqllintSettings;
	signal: AbortSignal;
};

export async function runTsqllint(
	options: RunTsqllintOptions,
): Promise<LintRunResult> {
	if (options.signal.aborted) {
		return {
			stdout: "",
			stderr: "",
			exitCode: null,
			timedOut: false,
			cancelled: true,
		};
	}

	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			resolve({
				stdout: "",
				stderr: "",
				exitCode: 0,
				timedOut: false,
				cancelled: false,
			});
		}, 10);

		options.signal.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				resolve({
					stdout: "",
					stderr: "",
					exitCode: null,
					timedOut: false,
					cancelled: true,
				});
			},
			{ once: true },
		);
	});
}
