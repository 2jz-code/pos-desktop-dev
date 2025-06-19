import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GlobalSettings from "../components/GlobalSettings";
import TerminalSettings from "../components/TerminalSettings";
import PrinterSettings from "../components/PrinterSettings";
import SyncManager from "@/components/SyncManager";

const SettingsPage = () => {
	return (
		<div className="container mx-auto p-4 space-y-8">
			<h1 className="text-3xl font-bold">Settings</h1>

			<GlobalSettings />

			<TerminalSettings />

			<PrinterSettings />

			<SyncManager />
		</div>
	);
};

export default SettingsPage;
