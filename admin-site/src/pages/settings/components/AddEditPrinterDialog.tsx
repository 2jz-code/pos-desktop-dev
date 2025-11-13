import { useState, useEffect } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Printer } from "@/types";

interface AddEditPrinterDialogProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onSave: (printerData: Partial<Printer>) => void;
	printer: Partial<Printer> | null;
}

export function AddEditPrinterDialog({
	isOpen,
	onOpenChange,
	onSave,
	printer,
}: AddEditPrinterDialogProps) {
	const [formData, setFormData] = useState({
		name: "",
		printer_type: "receipt" as "receipt" | "kitchen",
		ip_address: "",
		port: 9100,
		is_active: true,
	});

	useEffect(() => {
		if (printer && isOpen) {
			setFormData({
				name: printer.name || "",
				printer_type: printer.printer_type || "receipt",
				ip_address: printer.ip_address || "",
				port: printer.port || 9100,
				is_active: printer.is_active !== undefined ? printer.is_active : true,
			});
		} else if (isOpen) {
			// Reset form when opening for new printer
			setFormData({
				name: "",
				printer_type: printer?.printer_type || "receipt",
				ip_address: "",
				port: 9100,
				is_active: true,
			});
		}
	}, [printer, isOpen]);

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const { name, value } = e.target;
		setFormData((prev) => ({
			...prev,
			[name]: name === "port" ? parseInt(value) || 9100 : value,
		}));
	};

	const handleActiveChange = (checked: boolean) => {
		setFormData((prev) => ({ ...prev, is_active: checked }));
	};

	const handleSave = () => {
		if (!formData.name || !formData.ip_address) {
			alert("Please fill in all required fields");
			return;
		}
		onSave(formData);
	};

	const printerTypeLabel =
		formData.printer_type === "receipt" ? "Receipt" : "Kitchen";

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle>
						{printer?.id ? "Edit" : "Add"} {printerTypeLabel} Printer
					</DialogTitle>
					<DialogDescription>
						Configure network printer settings for this location
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4 py-4">
					{/* Printer Name */}
					<div className="grid gap-2">
						<Label htmlFor="name">
							Printer Name <span className="text-red-500">*</span>
						</Label>
						<Input
							id="name"
							name="name"
							value={formData.name}
							onChange={handleChange}
							placeholder={`e.g., ${printerTypeLabel} Printer 1`}
						/>
					</div>

					{/* IP Address */}
					<div className="grid gap-2">
						<Label htmlFor="ip_address">
							IP Address <span className="text-red-500">*</span>
						</Label>
						<Input
							id="ip_address"
							name="ip_address"
							value={formData.ip_address}
							onChange={handleChange}
							placeholder="e.g., 192.168.1.100"
						/>
						<p className="text-xs text-muted-foreground">
							The network IP address of the printer
						</p>
					</div>

					{/* Port */}
					<div className="grid gap-2">
						<Label htmlFor="port">Port</Label>
						<Input
							id="port"
							name="port"
							type="number"
							value={formData.port}
							onChange={handleChange}
							placeholder="9100"
						/>
						<p className="text-xs text-muted-foreground">
							Default port is 9100 for most network printers
						</p>
					</div>

					{/* Active Status */}
					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<Label htmlFor="is_active">Active</Label>
							<p className="text-xs text-muted-foreground">
								Enable or disable this printer
							</p>
						</div>
						<Switch
							id="is_active"
							checked={formData.is_active}
							onCheckedChange={handleActiveChange}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={handleSave}>
						{printer?.id ? "Update" : "Create"} Printer
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
