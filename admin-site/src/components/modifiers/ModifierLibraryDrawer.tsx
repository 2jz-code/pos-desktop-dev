import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import * as modifierService from "@/services/api/modifierService";

interface ModifierOption {
  id: string | number;
  name: string;
  price_delta: number;
}

interface ModifierSet {
  id: string | number;
  name: string;
  selection_type: 'SINGLE' | 'MULTIPLE';
  min_selections: number;
  options?: ModifierOption[];
}

interface ModifierLibraryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onModifierSetSelected?: (modifierSet: ModifierSet) => void;
  excludeModifierSetIds?: (string | number)[];
  showAddButton?: boolean;
  title?: string;
  searchPlaceholder?: string;
}

const ModifierLibraryDrawer: React.FC<ModifierLibraryDrawerProps> = ({ 
  open, 
  onOpenChange, 
  onModifierSetSelected,
  excludeModifierSetIds = [],
  showAddButton = true,
  title = "Modifier Library",
  searchPlaceholder = "Search modifier sets..."
}) => {
  const [availableModifierSets, setAvailableModifierSets] = useState<ModifierSet[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchAvailableModifierSets();
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      fetchAvailableModifierSets(searchTerm);
    }
  }, [searchTerm, open]);

  const fetchAvailableModifierSets = async (searchTerm = '') => {
    try {
      setLoading(true);
      const params: any = {};
      if (searchTerm) params.search = searchTerm;
      const response = await modifierService.getModifierSets(params);
      setAvailableModifierSets(response.data?.results || []);
    } catch (error) {
      console.error('Error fetching modifier sets:', error);
      toast({
        title: "Error",
        description: "Failed to load modifier library.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (modifierSet: ModifierSet) => {
    onModifierSetSelected?.(modifierSet);
  };

  const isModifierSetExcluded = (modifierSetId: string | number): boolean => {
    return excludeModifierSetIds.some(id => 
      String(id) === String(modifierSetId)
    );
  };

  const filteredModifierSets = availableModifierSets.filter(set => 
    !isModifierSetExcluded(set.id)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
              <p className="text-sm text-muted-foreground">Loading modifier sets...</p>
            </div>
          ) : (
            <div className="grid gap-2 max-h-96 overflow-y-auto">
              {filteredModifierSets.length === 0 ? (
                <div className="text-center py-8 bg-muted rounded-lg">
                  <p className="text-muted-foreground">
                    {searchTerm ? "No modifier sets found matching your search." : "No modifier sets available."}
                  </p>
                </div>
              ) : (
                filteredModifierSets.map((set) => (
                  <div
                    key={set.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1">
                      <h4 className="font-medium">{set.name}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-sm text-muted-foreground">
                          {set.selection_type === 'SINGLE' ? 'Single Choice' : 'Multiple Choice'} • {set.options?.length || 0} options
                        </p>
                        <Badge 
                          variant="outline"
                          className={`text-xs ${
                            set.min_selections > 0 
                              ? 'bg-blue-100 border-blue-300 text-blue-800' 
                              : 'bg-muted border-border text-muted-foreground'
                          }`}
                        >
                          {set.min_selections > 0 ? 'Required' : 'Optional'}
                        </Badge>
                      </div>
                      
                      {/* Show options preview */}
                      {set.options && set.options.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {set.options.slice(0, 3).map((option, index) => (
                            <Badge key={index} variant="secondary" className="text-xs">
                              {option.name}
                              {option.price_delta !== 0 && (
                                <span className="ml-1">
                                  {option.price_delta > 0 ? '+' : ''}${option.price_delta}
                                </span>
                              )}
                            </Badge>
                          ))}
                          {set.options.length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                              +{set.options.length - 3} more
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {showAddButton && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleSelect(set)}
                        disabled={isModifierSetExcluded(set.id)}
                      >
                        {isModifierSetExcluded(set.id) ? 'Added' : 'Add'}
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ModifierLibraryDrawer;