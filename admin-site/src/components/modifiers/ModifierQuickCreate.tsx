import React, { useState } from 'react';
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
  Plus,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import * as modifierService from "@/services/api/modifierService";
import ModifierOptionEditor from "./ModifierOptionEditor";

interface ModifierOption {
  name: string;
  price_delta: number;
  isProductSpecific: boolean;
}

interface QuickCreateForm {
  name: string;
  type: 'SINGLE' | 'MULTIPLE';
  min_selections: number;
  max_selections: number;
  options: ModifierOption[];
}

interface ModifierSet {
  id: string | number;
  name: string;
  selection_type: 'SINGLE' | 'MULTIPLE';
  min_selections: number;
  max_selections: number;
  options: ModifierOption[];
}

interface ModifierQuickCreateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (modifierSet: ModifierSet) => void;
  productId?: string | number | null;
  autoAddToProduct?: boolean;
}

const ModifierQuickCreate: React.FC<ModifierQuickCreateProps> = ({ 
  open, 
  onOpenChange, 
  onSuccess,
  productId = null,
  autoAddToProduct = false 
}) => {
  const [loading, setLoading] = useState(false);
  const [quickCreateForm, setQuickCreateForm] = useState<QuickCreateForm>({
    name: '',
    type: 'SINGLE',
    min_selections: 0,
    max_selections: 1,
    options: [{ name: '', price_delta: 0.00, isProductSpecific: false }]
  });
  const { toast } = useToast();

  const resetForm = () => {
    setQuickCreateForm({
      name: '',
      type: 'SINGLE',
      min_selections: 0,
      max_selections: 1,
      options: [{ name: '', price_delta: 0.00, isProductSpecific: false }]
    });
  };

  const handleQuickCreate = async () => {
    try {
      setLoading(true);
      const templateData = {
        name: quickCreateForm.name,
        type: quickCreateForm.type,
        min_selections: quickCreateForm.min_selections,
        max_selections: quickCreateForm.type === 'SINGLE' ? 1 : quickCreateForm.max_selections,
        options: quickCreateForm.options.filter(opt => opt.name.trim())
      };

      // Check if any options are product-specific
      const hasProductSpecificOptions = templateData.options.some(opt => typeof opt === 'object' && opt.isProductSpecific);
      
      let createdModifierSet;
      
      if (hasProductSpecificOptions && productId) {
        createdModifierSet = await modifierService.createModifierFromTemplateWithProductSpecific(templateData, Number(productId));
      } else {
        createdModifierSet = await modifierService.createModifierFromTemplate(templateData);
        if (autoAddToProduct && productId) {
          await modifierService.addModifierSetToProduct(Number(productId), createdModifierSet.id);
        }
      }
      
      toast({
        title: "Success",
        description: `Modifier group "${templateData.name}" created successfully.`,
      });
      
      // Call success callback with created modifier set
      onSuccess?.(createdModifierSet);
      
      // Reset form and close dialog
      resetForm();
      onOpenChange(false);
    } catch (error) {
      console.error('Error creating modifier from template:', error);
      toast({
        title: "Error",
        description: "Failed to create modifier group.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    resetForm();
    onOpenChange(false);
  };

  const addOption = () => {
    setQuickCreateForm(prev => ({ 
      ...prev, 
      options: [...prev.options, { name: '', price_delta: 0.00, isProductSpecific: false }] 
    }));
  };

  const removeOption = (index: number) => {
    const newOptions = quickCreateForm.options.filter((_, i) => i !== index);
    setQuickCreateForm(prev => ({ ...prev, options: newOptions }));
  };

  const updateOption = (index: number, field: string, value: any) => {
    const newOptions = [...quickCreateForm.options];
    newOptions[index] = { ...newOptions[index], [field]: value };
    setQuickCreateForm(prev => ({ ...prev, options: newOptions }));
  };

  const handleOptionsChange = (newOptions: ModifierOption[]) => {
    setQuickCreateForm(prev => ({ ...prev, options: newOptions }));
  };

  const isFormValid = quickCreateForm.name.trim() && 
    quickCreateForm.options.filter(o => o.name.trim()).length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Quick Create Modifier Group</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="name">Group Name</Label>
            <Input
              id="name"
              value={quickCreateForm.name}
              onChange={(e) => setQuickCreateForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Size Options"
            />
          </div>
          
          <div>
            <Label htmlFor="type">Selection Type</Label>
            <Select
              value={quickCreateForm.type}
              onValueChange={(value: 'SINGLE' | 'MULTIPLE') => setQuickCreateForm(prev => ({
                ...prev, 
                type: value,
                max_selections: value === 'SINGLE' ? 1 : prev.max_selections
              }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SINGLE">Single Choice (○)</SelectItem>
                <SelectItem value="MULTIPLE">Multiple Choice (☑)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Required/Optional Toggle */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div>
              <Label className="text-sm font-medium">Customer Selection</Label>
              <p className="text-xs text-muted-foreground mt-1">
                {quickCreateForm.min_selections > 0 
                  ? "Customers must make a selection" 
                  : "Customers can skip this modifier group"
                }
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Label className="text-sm">Optional</Label>
              <Switch
                checked={quickCreateForm.min_selections > 0}
                onCheckedChange={(checked) => {
                  const newMinSelections = checked ? 1 : 0;
                  setQuickCreateForm(prev => ({ ...prev, min_selections: newMinSelections }));
                }}
              />
              <Label className="text-sm">Required</Label>
            </div>
          </div>
          
          <div>
            <div className="flex items-center justify-between mb-3">
              <Label>Options</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addOption}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Option
              </Button>
            </div>
            <ModifierOptionEditor
              options={quickCreateForm.options}
              onOptionsChange={handleOptionsChange}
              onRemoveOption={removeOption}
              onUpdateOption={updateOption}
              showHeaders={true}
              showProductSpecific={!!productId}
              showEmptyState={true}
              emptyStateMessage="Click 'Add Option' to get started"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button 
            type="button"
            onClick={handleQuickCreate}
            disabled={!isFormValid || loading}
          >
            {loading ? "Creating..." : "Create & Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ModifierQuickCreate;