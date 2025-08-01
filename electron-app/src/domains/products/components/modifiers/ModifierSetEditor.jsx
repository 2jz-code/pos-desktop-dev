import React, { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import { Switch } from "@/shared/components/ui/switch";
import { Textarea } from "@/shared/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/shared/components/ui/dialog";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import {
	Plus,
	GripVertical,
	Trash2,
	Settings,
	Zap,
	Save,
	Loader2,
} from "lucide-react";
import { useToast } from "@/shared/components/ui/use-toast";
import * as modifierService from "@/domains/products/services/modifierService";
import ConditionalRuleBuilder from "./ConditionalRuleBuilder";
import ModifierOptionEditor from "./ModifierOptionEditor";

const ModifierSetEditor = ({ modifierSet, open, onOpenChange, onSuccess }) => {
	const [loading, setLoading] = useState(false);
	const [formData, setFormData] = useState({
		name: "",
		internal_name: "",
		selection_type: "SINGLE",
		min_selections: 0,
		max_selections: 1,
		triggered_by_option: null,
	});
	const [options, setOptions] = useState([]);
	const [errors, setErrors] = useState({});
	const { toast } = useToast();

	const isEditing = !!modifierSet;

	useEffect(() => {
		if (open) {
			if (isEditing) {
				setFormData({
					name: modifierSet.name || "",
					internal_name: modifierSet.internal_name || "",
					selection_type: modifierSet.selection_type || "SINGLE",
					min_selections: modifierSet.min_selections || 0,
					max_selections:
						modifierSet.max_selections ||
						(modifierSet.selection_type === "SINGLE" ? 1 : null),
					triggered_by_option: modifierSet.triggered_by_option || null,
				});
				setOptions(modifierSet.options || []);
			} else {
				// Reset for new modifier set
				setFormData({
					name: "",
					internal_name: "",
					selection_type: "SINGLE",
					min_selections: 0,
					max_selections: 1,
					triggered_by_option: null,
				});
				setOptions([
					{
						name: "",
						price_delta: 0,
						display_order: 0,
						is_product_specific: false,
					},
				]);
			}
			setErrors({});
		}
	}, [open, modifierSet, isEditing]);

	const handleInputChange = (e) => {
		const { name, value } = e.target;
		setFormData((prev) => ({ ...prev, [name]: value }));

		// Auto-generate internal_name from name
		if (name === "name" && !isEditing) {
			const internal_name = value
				.toLowerCase()
				.replace(/[^a-z0-9\s]/g, "")
				.replace(/\s+/g, "-")
				.substring(0, 50);
			setFormData((prev) => ({ ...prev, internal_name }));
		}

		if (errors[name]) {
			setErrors((prev) => ({ ...prev, [name]: "" }));
		}
	};

	const handleSelectChange = (name, value) => {
		setFormData((prev) => {
			const updates = { [name]: value };

			// Adjust min/max selections based on selection type
			if (name === "selection_type") {
				if (value === "SINGLE") {
					updates.min_selections = Math.min(prev.min_selections, 1);
					updates.max_selections = 1;
				} else {
					updates.max_selections = null; // Unlimited for MULTIPLE
				}
			}

			return { ...prev, ...updates };
		});

		if (errors[name]) {
			setErrors((prev) => ({ ...prev, [name]: "" }));
		}
	};

	const addOption = () => {
		setOptions((prev) => [
			...prev,
			{
				name: "",
				price_delta: 0,
				display_order: prev.length,
				is_product_specific: false,
			},
		]);
	};

	const removeOption = (index) => {
		if (options.length <= 1) return; // Keep at least one option
		setOptions((prev) => prev.filter((_, i) => i !== index));
	};

	const updateOption = (index, field, value) => {
		setOptions((prev) =>
			prev.map((option, i) =>
				i === index ? { ...option, [field]: value } : option
			)
		);
	};

	const handleDragEnd = (result) => {
		if (!result.destination) return;

		const items = Array.from(options);
		const [reorderedItem] = items.splice(result.source.index, 1);
		items.splice(result.destination.index, 0, reorderedItem);

		// Update display_order
		const reorderedItems = items.map((item, index) => ({
			...item,
			display_order: index,
		}));

		setOptions(reorderedItems);
	};

	const validateForm = () => {
		const newErrors = {};

		if (!formData.name.trim()) {
			newErrors.name = "Name is required";
		}

		if (!formData.internal_name.trim()) {
			newErrors.internal_name = "Internal name is required";
		}

		if (formData.selection_type === "SINGLE" && formData.min_selections > 1) {
			newErrors.min_selections =
				"Single choice cannot require more than 1 selection";
		}

		if (formData.selection_type === "SINGLE" && formData.max_selections !== 1) {
			newErrors.max_selections = "Single choice must have max selections of 1";
		}

		// Validate options
		const validOptions = options.filter((opt) => opt.name.trim());
		if (validOptions.length === 0) {
			newErrors.options = "At least one option is required";
		}

		// Check for duplicate option names
		const optionNames = validOptions.map((opt) =>
			opt.name.trim().toLowerCase()
		);
		const duplicates = optionNames.filter(
			(name, index) => optionNames.indexOf(name) !== index
		);
		if (duplicates.length > 0) {
			newErrors.options = "Option names must be unique";
		}

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	const handleOptionUpdates = async (modifierSetId, newOptions) => {
		// Get current options from the original modifier set
		const currentOptions = modifierSet.options || [];

		// Track which operations to perform
		const toUpdate = [];
		const toCreate = [];
		const toDelete = [];

		// Find options to update or create
		newOptions.forEach((newOption, index) => {
			const existingOption = currentOptions.find(
				(opt) => opt.id && newOption.id && opt.id === newOption.id
			);

			if (existingOption) {
				// Check if option has changed
				const hasChanged =
					existingOption.name !== newOption.name ||
					existingOption.price_delta !== newOption.price_delta ||
					existingOption.display_order !== index ||
					existingOption.is_product_specific !== newOption.is_product_specific;

				if (hasChanged) {
					toUpdate.push({
						id: existingOption.id,
						name: newOption.name.trim(),
						price_delta: parseFloat(newOption.price_delta) || 0,
						display_order: index,
						is_product_specific: newOption.is_product_specific || false,
					});
				}
			} else {
				// New option to create
				toCreate.push({
					name: newOption.name.trim(),
					price_delta: parseFloat(newOption.price_delta) || 0,
					display_order: index,
					is_product_specific: newOption.is_product_specific || false,
				});
			}
		});

		// Find options to delete (exist in current but not in new)
		currentOptions.forEach((currentOption) => {
			const stillExists = newOptions.some(
				(newOption) => newOption.id && currentOption.id === newOption.id
			);
			if (!stillExists) {
				toDelete.push(currentOption.id);
			}
		});

		// Perform operations
		try {
			// Delete removed options
			for (const optionId of toDelete) {
				await modifierService.deleteModifierOption(modifierSetId, optionId);
			}

			// Update existing options
			for (const option of toUpdate) {
				await modifierService.updateModifierOption(modifierSetId, option.id, {
					name: option.name,
					price_delta: option.price_delta,
					display_order: option.display_order,
					is_product_specific: option.is_product_specific,
				});
			}

			// Create new options
			for (const option of toCreate) {
				await modifierService.addModifierOption(modifierSetId, option);
			}
		} catch (error) {
			console.error("Error updating options:", error);
			throw error;
		}
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		if (!validateForm()) return;

		setLoading(true);
		try {
			const submitData = {
				name: formData.name.trim(),
				internal_name: formData.internal_name.trim(),
				selection_type: formData.selection_type,
				min_selections: parseInt(formData.min_selections) || 0,
				max_selections:
					formData.selection_type === "SINGLE"
						? 1
						: formData.max_selections
						? parseInt(formData.max_selections)
						: null,
				triggered_by_option: formData.triggered_by_option || null,
			};

			let savedModifierSet;
			if (isEditing) {
				const response = await modifierService.updateModifierSet(
					modifierSet.id,
					submitData
				);
				savedModifierSet = response.data;
				toast({
					title: "Success",
					description: "Modifier set updated successfully.",
				});
			} else {
				const response = await modifierService.createModifierSet(submitData);
				savedModifierSet = response.data;
				toast({
					title: "Success",
					description: "Modifier set created successfully.",
				});
			}

			// Handle options
			const validOptions = options.filter((opt) => opt.name.trim());

			if (!isEditing) {
				// For new modifier sets, create all options
				for (let i = 0; i < validOptions.length; i++) {
					const option = validOptions[i];
					await modifierService.addModifierOption(savedModifierSet.id, {
						name: option.name.trim(),
						price_delta: parseFloat(option.price_delta) || 0,
						display_order: i,
						is_product_specific: option.is_product_specific || false,
					});
				}
			} else {
				// For editing, handle option updates/deletes/creates
				await handleOptionUpdates(savedModifierSet.id, validOptions);
			}

			onSuccess?.();
		} catch (error) {
			console.error("Error saving modifier set:", error);
			if (error.response?.data) {
				const backendErrors = {};
				Object.keys(error.response.data).forEach((key) => {
					backendErrors[key] = Array.isArray(error.response.data[key])
						? error.response.data[key][0]
						: error.response.data[key];
				});
				setErrors(backendErrors);
			}
			toast({
				title: "Error",
				description: "Failed to save modifier set. Check form for errors.",
				variant: "destructive",
			});
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
		>
			<DialogContent className="sm:max-w-7xl max-h-[95vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>
						{isEditing ? "Edit Modifier Set" : "Create New Modifier Set"}
					</DialogTitle>
				</DialogHeader>

				<form
					onSubmit={handleSubmit}
					className="space-y-6"
				>
					<div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
						{/* Left Column - Basic Settings */}
						<div className="lg:col-span-2 space-y-4">
							<Card>
								<CardHeader>
									<CardTitle className="text-lg">Basic Information</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									<div>
										<Label htmlFor="name">
											Display Name <span className="text-red-500">*</span>
										</Label>
										<Input
											id="name"
											name="name"
											value={formData.name}
											onChange={handleInputChange}
											placeholder="e.g., Choose your size"
											className={errors.name ? "border-red-500" : ""}
										/>
										{errors.name && (
											<p className="text-sm text-red-500 mt-1">{errors.name}</p>
										)}
									</div>

									<div>
										<Label htmlFor="internal_name">
											Internal Name <span className="text-red-500">*</span>
										</Label>
										<Input
											id="internal_name"
											name="internal_name"
											value={formData.internal_name}
											onChange={handleInputChange}
											placeholder="e.g., drink-size"
											className={errors.internal_name ? "border-red-500" : ""}
											disabled={isEditing} // Don't allow changing internal name for existing sets
										/>
										{errors.internal_name && (
											<p className="text-sm text-red-500 mt-1">
												{errors.internal_name}
											</p>
										)}
										<p className="text-xs text-gray-500 mt-1">
											Used for API references. Auto-generated from display name.
										</p>
									</div>

									<div>
										<Label htmlFor="selection_type">Selection Type</Label>
										<Select
											value={formData.selection_type}
											onValueChange={(value) =>
												handleSelectChange("selection_type", value)
											}
										>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="SINGLE">
													Single Choice (○)
												</SelectItem>
												<SelectItem value="MULTIPLE">
													Multiple Choice (☑)
												</SelectItem>
											</SelectContent>
										</Select>
									</div>

									<div className="space-y-4">
										{/* Required/Optional Toggle */}
										<div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
											<div>
												<Label className="text-sm font-medium">
													Customer Selection
												</Label>
												<p className="text-xs text-gray-500 mt-1">
													{formData.min_selections > 0
														? "Customers must make a selection"
														: "Customers can skip this modifier set"}
												</p>
											</div>
											<div className="flex items-center space-x-2">
												<Label className="text-sm">Optional</Label>
												<Switch
													checked={formData.min_selections > 0}
													onCheckedChange={(checked) => {
														const newMinSelections = checked
															? formData.selection_type === "SINGLE"
																? 1
																: 1
															: 0;
														setFormData((prev) => ({
															...prev,
															min_selections: newMinSelections,
														}));
													}}
												/>
												<Label className="text-sm">Required</Label>
											</div>
										</div>

										{/* Advanced Settings - Only show if needed */}
										{formData.selection_type === "MULTIPLE" && (
											<div className="grid grid-cols-2 gap-4">
												<div>
													<Label htmlFor="min_selections">Min Selections</Label>
													<Input
														id="min_selections"
														name="min_selections"
														type="number"
														min="0"
														max="10"
														value={formData.min_selections}
														onChange={handleInputChange}
														className={
															errors.min_selections ? "border-red-500" : ""
														}
													/>
													{errors.min_selections && (
														<p className="text-sm text-red-500 mt-1">
															{errors.min_selections}
														</p>
													)}
													<p className="text-xs text-gray-500 mt-1">
														0 = optional, 1+ = required minimum
													</p>
												</div>

												<div>
													<Label htmlFor="max_selections">Max Selections</Label>
													<Input
														id="max_selections"
														name="max_selections"
														type="number"
														min="1"
														value={formData.max_selections || ""}
														onChange={handleInputChange}
														placeholder="Unlimited"
														className={
															errors.max_selections ? "border-red-500" : ""
														}
													/>
													{errors.max_selections && (
														<p className="text-sm text-red-500 mt-1">
															{errors.max_selections}
														</p>
													)}
													<p className="text-xs text-gray-500 mt-1">
														Leave blank for unlimited
													</p>
												</div>
											</div>
										)}
									</div>
								</CardContent>
							</Card>

							{/* Conditional Rules Card */}
							<ConditionalRuleBuilder
								currentTriggerOption={formData.triggered_by_option}
								onTriggerChange={(triggerId) =>
									setFormData((prev) => ({
										...prev,
										triggered_by_option: triggerId,
									}))
								}
								excludeCurrentSet={isEditing ? modifierSet.id : null}
							/>
						</div>

						{/* Right Column - Options */}
						<div className="lg:col-span-3 space-y-4">
							<Card>
								<CardHeader>
									<div className="flex items-center justify-between">
										<CardTitle className="text-lg">Options</CardTitle>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={addOption}
										>
											<Plus className="h-4 w-4 mr-2" />
											Add Option
										</Button>
									</div>
									{errors.options && (
										<p className="text-sm text-red-500">{errors.options}</p>
									)}
								</CardHeader>
								<CardContent>
									<ModifierOptionEditor
										options={options}
										onAddOption={addOption}
										onRemoveOption={removeOption}
										onUpdateOption={updateOption}
										onDragEnd={handleDragEnd}
										showHeaders={true}
										showProductSpecific={false}
										showEmptyState={true}
										emptyStateMessage="Click 'Add Option' to get started"
									/>
								</CardContent>
							</Card>
						</div>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={loading}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={loading}
						>
							{loading ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									{isEditing ? "Updating..." : "Creating..."}
								</>
							) : (
								<>
									<Save className="mr-2 h-4 w-4" />
									{isEditing ? "Update Modifier Set" : "Create Modifier Set"}
								</>
							)}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
};

export default ModifierSetEditor;
