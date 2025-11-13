import { useState, useEffect } from "react";
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
import { Switch } from "@/shared/components/ui/switch";
import { useToast } from "@/shared/components/ui/use-toast";
import { Loader2 } from "lucide-react";

export function AddEditPrinterDialog({
	isOpen,
	onOpenChange,
	onSave,
	printer,
}) {
	const { toast } = useToast();
	const [isTesting, setIsTesting] = useState(false);
	const [formData, setFormData] = useState({
		name: "",
		ip_address: "",
		port: 9100,
		is_active: true,
	});

	useEffect(() => {
		if (printer && isOpen) {
			setFormData({
				name: printer.name || "",
				ip_address: printer.ip_address || "",
				port: printer.port || 9100,
				is_active:
					printer.is_active !== undefined ? printer.is_active : true,
			});
		} else if (isOpen) {
			// Reset form when opening for new printer
			setFormData({
				name: "",
				ip_address: "",
				port: 9100,
				is_active: true,
			});
		}
	}, [printer, isOpen]);

	const handleChange = (e) => {
		const { name, value } = e.target;
		setFormData((prev) => ({
			...prev,
			[name]: name === "port" ? parseInt(value) || 9100 : value,
		}));
	};

	const handleActiveChange = (checked) => {
		setFormData((prev) => ({ ...prev, is_active: checked }));
	};

	const handleTestConnection = async () => {
		if (!formData.ip_address) {
			toast({
				title: "IP Address Missing",
				description: "Please enter an IP address before testing.",
				variant: "destructive",
			});
			return;
		}

		setIsTesting(true);
		toast({
			title: "Testing Connection",
			description: `Pinging printer at ${formData.ip_address}...`,
		});

		try {
			const result = await window.hardwareApi.invoke("test-network-printer", {
				ip_address: formData.ip_address,
				port: formData.port,
			});

			if (result.success) {
				toast({
					title: "Connection Successful!",
					description: result.message || "Printer is reachable",
				});
			} else {
				toast({
					title: "Connection Failed",
					description: result.error || "Could not reach printer",
					variant: "destructive",
				});
			}
		} catch (error) {
			toast({
				title: "Test Failed",
				description: error.message,
				variant: "destructive",
			});
			console.error("Error testing printer:", error);
		} finally {
			setIsTesting(false);
		}
	};

	const handleSave = () => {
		if (!formData.name || !formData.ip_address) {
			alert("Please fill in all required fields");
			return;
		}
		onSave({
			...formData,
			printer_type: "kitchen", // Electron only manages kitchen printers (receipt printers are USB)
		});
	};

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle>
						{printer?.id ? "Edit" : "Add"} Kitchen Printer
					</DialogTitle>
					<DialogDescription>
						Configure network printer settings for kitchen ticket printing
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
							placeholder="e.g., Kitchen Printer 1"
						/>
					</div>

					{/* IP Address */}
					<div className="grid gap-2">
						<Label htmlFor="ip_address">
							IP Address <span className="text-red-500">*</span>
						</Label>
						<div className="flex gap-2">
							<Input
								id="ip_address"
								name="ip_address"
								value={formData.ip_address}
								onChange={handleChange}
								placeholder="e.g., 192.168.1.100"
								className="flex-1"
							/>
							<Button
								type="button"
								variant="outline"
								onClick={handleTestConnection}
								disabled={isTesting || !formData.ip_address}
							>
								{isTesting ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Testing...
									</>
								) : (
									"Test"
								)}
							</Button>
						</div>
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
