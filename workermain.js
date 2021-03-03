/** @format */

"use strict";
{
	let hasInitialised = false;
	let runtime = null;
	self.addEventListener("message", (e) => {
		const data = e.data;
		const type = data["type"];
		if (type === "init-runtime") InitRuntime(data);
		else throw new Error(`unknown message '${type}'`);
	});
	async function LoadScripts(scriptsArr) {
		importScripts(...scriptsArr);
	}
	async function InitRuntime(data) {
		if (hasInitialised) throw new Error("already initialised");
		hasInitialised = true;
		const baseUrl = data["baseUrl"];
		self.devicePixelRatio = data["devicePixelRatio"];
		const workerDependencyScripts = data["workerDependencyScripts"].map(
			(urlOrBlob) => {
				let url = urlOrBlob;
				if (urlOrBlob instanceof Blob) url = URL.createObjectURL(urlOrBlob);
				else url = new URL(url, baseUrl).toString();
				return url;
			}
		);
		const runOnStartupFunctions = [];
		self.runOnStartup = function runOnStartup(f) {
			if (typeof f !== "function")
				throw new Error("runOnStartup called without a function");
			runOnStartupFunctions.push(f);
		};
		const engineScripts = data["engineScripts"].map((url) =>
			new URL(url, baseUrl).toString()
		);
		try {
			await LoadScripts([...workerDependencyScripts, ...engineScripts]);
		} catch (err) {
			console.error(
				"[C3 runtime] Failed to load all engine scripts in worker: ",
				err
			);
			return;
		}
		const projectScripts = data["projectScripts"];
		if (projectScripts && projectScripts.length > 0) {
			const scriptsStatus = data["projectScriptsStatus"];
			self["C3_ProjectScriptsStatus"] = scriptsStatus;
			try {
				await LoadScripts(projectScripts.map((e) => e[1]));
			} catch (err) {
				console.error("[Preview] Error loading project scripts: ", err);
				ReportProjectScriptError(
					projectScripts,
					scriptsStatus,
					data["messagePort"]
				);
				return;
			}
		}
		data["runOnStartupFunctions"] = runOnStartupFunctions;
		if (
			data["exportType"] === "preview" &&
			typeof self.C3.ScriptsInEvents !== "object"
		) {
			const msg =
				"Failed to load JavaScript code used in events. Check all your JavaScript code has valid syntax.";
			console.error("[C3 runtime] " + msg);
			data["messagePort"].postMessage({ type: "alert-error", message: msg });
			return;
		}
		data["messagePort"].postMessage({ type: "creating-runtime" });
		runtime = self["C3_CreateRuntime"](data);
		await self["C3_InitRuntime"](runtime, data);
	}
	async function ReportProjectScriptError(
		projectScripts,
		scriptsStatus,
		messagePort
	) {
		let msg;
		for (const [originalUrl, src] of projectScripts) {
			if (scriptsStatus[originalUrl]) continue;
			try {
				await LoadScripts([src]);
			} catch (err) {
				if (originalUrl === "scriptsInEvents.js")
					msg =
						"Failed to load JavaScript code used in events. Check all your JavaScript code has valid syntax.";
				else
					msg = `Failed to load project script '${originalUrl}'. Check all your JavaScript code has valid syntax.`;
				console.error("[Preview] " + msg, err);
				messagePort.postMessage({ type: "alert-error", message: msg });
				return;
			}
		}
	}
}
