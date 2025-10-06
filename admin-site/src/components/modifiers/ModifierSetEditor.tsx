import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Plus,
  Save,
  Loader2,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import * as modifierService from "@/services/api/modifierService";
import ConditionalRuleBuilder from "./ConditionalRuleBuilder";
import ModifierOptionEditor from "./ModifierOptionEditor";

interface ModifierOption {
  id?: string | number;
  name: string;
  price_delta: number;
  display_order: number;
  is_product_specific: boolean;
}

interface ModifierSet {
  id: string | number;
  name: string;
  internal_name: string;
  selection_type: 'SINGLE' | 'MULTIPLE';
  min_selections: number;
  max_selections: number | null;
  triggered_by_option: string | number | null;
  options?: ModifierOption[];
}

interface FormData {
  name: string;
  internal_name: string;
  selection_type: 'SINGLE' | 'MULTIPLE';
  min_selections: number;
  max_selections: number | null;
  triggered_by_option: string | number | null;
}

interface FormErrors {
  [key: string]: string;
}

interface ModifierSetEditorProps {
  modifierSet?: ModifierSet | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const ModifierSetEditor: React.FC<ModifierSetEditorProps> = ({ 
  modifierSet, 
  open, 
  onOpenChange, 
  onSuccess 
}) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    name: "",
    internal_name: "",
    selection_type: "SINGLE",
    min_selections: 0,
    max_selections: 1,
    triggered_by_option: null,
  });
  const [options, setOptions] = useState<ModifierOption[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const { toast } = useToast();

  const isEditing = !!modifierSet;

  useEffect(() => {
    if (open) {
      if (isEditing && modifierSet) {
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => {
      const updates: Partial<FormData> = { [name]: value };

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

  const removeOption = (index: number) => {
    if (options.length <= 1) return; // Keep at least one option
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const updateOption = (index: number, field: string, value: any) => {
    setOptions((prev) =>
      prev.map((option, i) =>
        i === index ? { ...option, [field]: value } : option
      )
    );
  };

  const handleOptionsChange = (newOptions: ModifierOption[]) => {
    // Update display_order
    const reorderedItems = newOptions.map((item, index) => ({
      ...item,
      display_order: index,
    }));
    setOptions(reorderedItems);
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    try {
      // Prepare valid options (filter out empty ones and format for backend)
      const validOptions = options
        .filter(opt => opt.name.trim())
        .map((opt, index) => ({
          name: opt.name.trim(),
          price_delta: String(opt.price_delta || 0),
          display_order: index,
          is_product_specific: opt.is_product_specific || false,
        }));

      const submitData = {
        name: formData.name.trim(),
        internal_name: formData.internal_name.trim(),
        selection_type: formData.selection_type,
        min_selections: parseInt(String(formData.min_selections)) || 0,
        max_selections:
          formData.selection_type === "SINGLE"
            ? 1
            : formData.max_selections
            ? parseInt(String(formData.max_selections))
            : null,
        triggered_by_option: formData.triggered_by_option || null,
        // Include options_data for nested creation/update
        options_data: validOptions,
      };

      let savedModifierSet;
      if (isEditing) {
        savedModifierSet = await modifierService.updateModifierSet(Number(modifierSet!.id), submitData);
      } else {
        // Create modifier set with options in a single request
        savedModifierSet = await modifierService.createModifierSet(submitData);
      }

      toast({
        title: "Success",
        description: `Modifier set ${isEditing ? 'updated' : 'created'} successfully.`,
      });

      onSuccess?.();
    } catch (error) {
      console.error("Error saving modifier set:", error);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-7xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Modifier Set" : "Create New Modifier Set"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
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
                      Display Name <span className="text-destructive">*</span>
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
                      <p className="text-sm text-destructive mt-1">{errors.name}</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="internal_name">
                      Internal Name <span className="text-destructive">*</span>
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
                      <p className="text-sm text-destructive mt-1">
                        {errors.internal_name}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Used for API references. Auto-generated from display name.
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="selection_type">Selection Type</Label>
                    <Select
                      value={formData.selection_type}
                      onValueChange={(value: 'SINGLE' | 'MULTIPLE') =>
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
                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div>
                        <Label className="text-sm font-medium">
                          Customer Selection
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
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
                            <p className="text-sm text-destructive mt-1">
                              {errors.min_selections}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
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
                            <p className="text-sm text-destructive mt-1">
                              {errors.max_selections}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
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
                excludeCurrentSet={isEditing && modifierSet ? modifierSet.id : null}
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
                    <p className="text-sm text-destructive">{errors.options}</p>
                  )}
                </CardHeader>
                <CardContent>
                  <ModifierOptionEditor
                    options={options}
                    onOptionsChange={handleOptionsChange}
                    onRemoveOption={removeOption}
                    onUpdateOption={updateOption}
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
            <Button type="submit" disabled={loading}>
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