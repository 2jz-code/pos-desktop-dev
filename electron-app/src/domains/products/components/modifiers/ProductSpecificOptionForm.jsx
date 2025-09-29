import React, { useState } from 'react';
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import { useToast } from "@/shared/components/ui/use-toast";

const ProductSpecificOptionForm = ({ 
  open, 
  onOpenChange, 
  onSuccess,
  modifierSetName = "",
  existingOptionNames = []
}) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    price_delta: 0
  });
  const [errors, setErrors] = useState({});
  const { toast } = useToast();

  const resetForm = () => {
    setFormData({
      name: '',
      price_delta: 0
    });
    setErrors({});
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) {
      newErrors.name = "Option name is required";
    } else {
      // Check for duplicate names (case-insensitive)
      const trimmedName = formData.name.trim();
      const isDuplicate = existingOptionNames.some(
        existingName => existingName.toLowerCase() === trimmedName.toLowerCase()
      );
      
      if (isDuplicate) {
        newErrors.name = "An option with this name already exists in this modifier set";
      }
    }
    
    if (isNaN(parseFloat(formData.price_delta))) {
      newErrors.price_delta = "Price must be a valid number";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      const optionData = {
        name: formData.name.trim(),
        price_delta: parseFloat(formData.price_delta) || 0
      };

      await onSuccess?.(optionData);
      
      toast({
        title: "Success",
        description: `Product-specific option "${optionData.name}" added successfully.`,
      });
      
      resetForm();
      onOpenChange(false);
    } catch (error) {
      console.error('Error adding product-specific option:', error);
      
      // Handle backend validation errors
      if (error.response?.data?.errors) {
        const backendErrors = error.response.data.errors;
        
        // Handle non_field_errors (like unique constraint violations)
        if (backendErrors.non_field_errors) {
          const nonFieldError = backendErrors.non_field_errors[0];
          if (nonFieldError.includes('unique set')) {
            setErrors({ name: "An option with this name already exists in this modifier set" });
          } else {
            toast({
              title: "Error",
              description: nonFieldError,
              variant: "destructive",
            });
          }
        } else {
          // Handle field-specific errors
          const newErrors = {};
          Object.keys(backendErrors).forEach(field => {
            newErrors[field] = Array.isArray(backendErrors[field]) 
              ? backendErrors[field][0] 
              : backendErrors[field];
          });
          setErrors(newErrors);
        }
      } else {
        toast({
          title: "Error",
          description: "Failed to add product-specific option.",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Product-Specific Option</DialogTitle>
          {modifierSetName && (
            <p className="text-sm text-muted-foreground">
              Adding to: <span className="font-medium">{modifierSetName}</span>
            </p>
          )}
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="option-name">
                Option Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="option-name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="e.g., Extra Large, No Ice, etc."
                className={errors.name ? "border-red-500" : ""}
              />
              {errors.name && (
                <p className="text-sm text-red-500 mt-1">{errors.name}</p>
              )}
            </div>
            
            <div>
              <Label htmlFor="price-delta">Price Adjustment</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="price-delta"
                  type="number"
                  step="0.01"
                  value={formData.price_delta}
                  onChange={(e) => handleInputChange('price_delta', e.target.value)}
                  placeholder="0.00"
                  className={`pl-7 ${errors.price_delta ? "border-red-500" : ""}`}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Use positive values for upcharges (+$2.50) or negative for discounts (-$1.00)
              </p>
              {errors.price_delta && (
                <p className="text-sm text-red-500 mt-1">{errors.price_delta}</p>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button 
              type="submit"
              disabled={loading}
            >
              {loading ? "Adding..." : "Add Option"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ProductSpecificOptionForm;