import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/shared/components/ui/dialog";
import { Settings, Monitor, ChefHat } from "lucide-react";

/**
 * Mode Switcher Component
 * Floating button that allows switching between POS and KDS modes
 */
export function ModeSwitcher() {
	const navigate = useNavigate();
	const location = useLocation();
	const [isOpen, setIsOpen] = useState(false);

	const currentMode = localStorage.getItem("app-mode");

	// Don't show on mode selection page
	if (location.pathname === "/mode-selection") {
		return null;
	}

	const handleModeSwitch = (newMode) => {
		localStorage.setItem("app-mode", newMode);
		setIsOpen(false);

		if (newMode === "pos") {
			navigate("/login");
		} else if (newMode === "kds") {
			navigate("/kds-zone-selection");
		}
	};

	const handleResetMode = () => {
		localStorage.removeItem("app-mode");
		localStorage.removeItem("kds-selected-zone");
		setIsOpen(false);
		navigate("/mode-selection");
	};

	return (
		<div className="fixed bottom-4 right-4 z-50">
			<Dialog open={isOpen} onOpenChange={setIsOpen}>
				<DialogTrigger asChild>
					<Button
						size="sm"
						variant="outline"
						className="rounded-full shadow-lg bg-white hover:bg-gray-50 border-2"
					>
						<Settings className="h-4 w-4 mr-2" />
						Mode
					</Button>
				</DialogTrigger>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Switch Application Mode</DialogTitle>
						<DialogDescription>
							Currently in <span className="font-semibold capitalize">{currentMode || 'unknown'}</span> mode
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-3 pt-4">
						<Button
							onClick={() => handleModeSwitch("pos")}
							variant={currentMode === "pos" ? "default" : "outline"}
							className="w-full justify-start"
							size="lg"
						>
							<Monitor className="h-5 w-5 mr-3" />
							<div className="text-left">
								<div className="font-medium">POS Mode</div>
								<div className="text-sm text-gray-500">Point of Sale Terminal</div>
							</div>
						</Button>

						<Button
							onClick={() => handleModeSwitch("kds")}
							variant={currentMode === "kds" ? "default" : "outline"}
							className="w-full justify-start"
							size="lg"
						>
							<ChefHat className="h-5 w-5 mr-3" />
							<div className="text-left">
								<div className="font-medium">KDS Mode</div>
								<div className="text-sm text-gray-500">Kitchen Display System</div>
							</div>
						</Button>

						<hr className="my-4" />

						<Button
							onClick={handleResetMode}
							variant="ghost"
							className="w-full text-gray-600"
							size="sm"
						>
							Reset Mode Selection
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}