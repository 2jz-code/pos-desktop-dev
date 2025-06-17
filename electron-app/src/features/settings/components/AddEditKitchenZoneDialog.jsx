import React, { useState, useEffect } from "react";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

export const AddEditKitchenZoneDialog = ({
	isOpen,
	onOpenChange,
	onSave,
	zone,
	printers,
}) => {
	const [formData, setFormData] = useState({ name: "", printerId: "" });

	useEffect(() => {
		if (zone) {
			setFormData({ name: zone.name || "", printerId: zone.printerId || "" });
		} else {
			setFormData({ name: "", printerId: "" });
		}
	}, [zone, isOpen]);

	const handleChange = (e) => {
		const { name, value } = e.target;
		setFormData((prev) => ({ ...prev, [name]: value }));
	};

	const handleSelectChange = (value) => {
		setFormData((prev) => ({ ...prev, printerId: value }));
	};

	const handleSave = () => {
		onSave(formData);
		onOpenChange(false);
	};

	return (
		<Dialog
			open={isOpen}
			onOpenChange={onOpenChange}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{zone ? "Edit Zone" : "Add Kitchen Zone"}</DialogTitle>
					<DialogDescription>
						Define a printing zone for your kitchen (e.g., "Hot Line").
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4 py-4">
					<div className="grid grid-cols-4 items-center gap-4">
						<Label
							htmlFor="name"
							className="text-right"
						>
							Zone Name
						</Label>
						<Input
							id="name"
							name="name"
							value={formData.name}
							onChange={handleChange}
							className="col-span-3"
							placeholder="e.g., Hot Line"
						/>
					</div>
					<div className="grid grid-cols-4 items-center gap-4">
						<Label
							htmlFor="printerId"
							className="text-right"
						>
							Assigned Printer
						</Label>
						<Select
							value={formData.printerId}
							onValueChange={handleSelectChange}
						>
							<SelectTrigger className="col-span-3">
								<SelectValue placeholder="Select a printer" />
							</SelectTrigger>
							<SelectContent>
								{printers.map((p) => (
									<SelectItem
										key={p.id}
										value={p.id}
									>
										{p.name} ({p.connection_type})
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button onClick={handleSave}>Save Zone</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
