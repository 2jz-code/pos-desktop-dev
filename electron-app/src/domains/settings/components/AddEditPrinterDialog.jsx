import React, { useState, useEffect } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";

export const AddEditPrinterDialog = ({
	isOpen,
	onOpenChange,
	onSave,
	printer,
}) => {
	const [formData, setFormData] = useState({
		name: "",
		connection_type: "usb",
		vendor_id: "",
		product_id: "",
		ip_address: "",
	});

	useEffect(() => {
		if (printer) {
			setFormData({
				name: printer.name || "",
				connection_type: printer.connection_type || "usb",
				vendor_id: printer.vendor_id || "",
				product_id: printer.product_id || "",
				ip_address: printer.ip_address || "",
			});
		} else {
			setFormData({
				name: "",
				connection_type: "usb",
				vendor_id: "",
				product_id: "",
				ip_address: "",
			});
		}
	}, [printer, isOpen]);

	const handleChange = (e) => {
		const { name, value } = e.target;
		setFormData((prev) => ({ ...prev, [name]: value }));
	};

	const handleSelectChange = (value) => {
		setFormData((prev) => ({ ...prev, connection_type: value }));
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
					<DialogTitle>{printer ? "Edit Printer" : "Add Printer"}</DialogTitle>
					<DialogDescription>
						Configure a new printer for use in the POS system.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4 py-4">
					<div className="grid grid-cols-4 items-center gap-4">
						<Label
							htmlFor="name"
							className="text-right"
						>
							Name
						</Label>
						<Input
							id="name"
							name="name"
							value={formData.name}
							onChange={handleChange}
							className="col-span-3"
							placeholder="e.g., Kitchen Printer"
						/>
					</div>
					<div className="grid grid-cols-4 items-center gap-4">
						<Label
							htmlFor="connection_type"
							className="text-right"
						>
							Type
						</Label>
						<Select
							value={formData.connection_type}
							onValueChange={handleSelectChange}
						>
							<SelectTrigger className="col-span-3">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="usb">USB</SelectItem>
								<SelectItem value="network">Network (Ethernet/WiFi)</SelectItem>
							</SelectContent>
						</Select>
					</div>

					{formData.connection_type === "usb" && (
						<>
							<div className="grid grid-cols-4 items-center gap-4">
								<Label
									htmlFor="vendor_id"
									className="text-right"
								>
									Vendor ID (VID)
								</Label>
								<Input
									id="vendor_id"
									name="vendor_id"
									value={formData.vendor_id}
									onChange={handleChange}
									className="col-span-3"
									placeholder="e.g., 7568 or 0x1d90"
								/>
							</div>
							<div className="grid grid-cols-4 items-center gap-4">
								<Label
									htmlFor="product_id"
									className="text-right"
								>
									Product ID (PID)
								</Label>
								<Input
									id="product_id"
									name="product_id"
									value={formData.product_id}
									onChange={handleChange}
									className="col-span-3"
									placeholder="e.g., 8223 or 0x2050"
								/>
							</div>
						</>
					)}

					{formData.connection_type === "network" && (
						<div className="grid grid-cols-4 items-center gap-4">
							<Label
								htmlFor="ip_address"
								className="text-right"
							>
								IP Address
							</Label>
							<Input
								id="ip_address"
								name="ip_address"
								value={formData.ip_address}
								onChange={handleChange}
								className="col-span-3"
								placeholder="e.g., 192.168.1.100"
							/>
						</div>
					)}
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button onClick={handleSave}>Save Printer</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
