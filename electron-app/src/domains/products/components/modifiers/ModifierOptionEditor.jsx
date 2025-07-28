import React from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import {
  Plus,
  GripVertical,
  Trash2,
} from "lucide-react";

const ModifierOptionEditor = ({ 
  options = [],
  onOptionsChange,
  onAddOption,
  onRemoveOption,
  onUpdateOption,
  onDragEnd,
  showHeaders = true,
  showProductSpecific = true,
  className = "",
  showEmptyState = true,
  emptyStateMessage = "No options yet"
}) => {

  if (!options || options.length === 0) {
    return showEmptyState ? (
      <div className={`text-center py-8 text-gray-500 ${className}`}>
        <div className="mb-2">
          <GripVertical className="h-8 w-8 mx-auto text-gray-300" />
        </div>
        <p className="text-sm">{emptyStateMessage}</p>
        <p className="text-xs text-gray-400">Click "Add Option" to get started</p>
      </div>
    ) : null;
  }

  return (
    <div className={className}>
      {/* Header row */}
      {showHeaders && options.length > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 bg-gray-100 border border-gray-200 rounded-t-lg text-sm font-medium text-gray-600">
          <div className="w-6"></div> {/* Spacer for drag handle */}
          <div className="flex-1">Name</div>
          <div className="w-24 text-center">Price (+/-)</div>
          <div className="w-9"></div> {/* Spacer for delete button */}
        </div>
      )}
      
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable 
          droppableId="options"
          renderClone={(provided, snapshot, rubric) => (
            <div
              {...provided.draggableProps}
              {...provided.dragHandleProps}
              ref={provided.innerRef}
              className="bg-white shadow-lg border border-blue-300 rounded-lg"
              style={provided.draggableProps.style}
            >
              <div className="flex items-center gap-3 p-3">
                <div className="cursor-grabbing p-1 rounded bg-blue-100">
                  <GripVertical className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex-1">
                  <div className="px-3 py-2 border rounded bg-gray-50 text-sm">
                    {options[rubric.source.index]?.name || 'Option'}
                  </div>
                </div>
                <div className="w-24">
                  <div className="px-2 py-2 border rounded bg-gray-50 text-sm text-center">
                    ${options[rubric.source.index]?.price_delta || '0.00'}
                  </div>
                </div>
                <div className="w-9"></div>
              </div>
            </div>
          )}
        >
          {(provided, snapshot) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className={`border border-gray-200 ${
                showHeaders && options.length > 0 ? 'rounded-b-lg border-t-0' : 'rounded-lg'
              } ${
                snapshot.isDraggingOver ? 'bg-blue-50' : 'bg-white'
              }`}
            >
              {options.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <div className="mb-2">
                    <GripVertical className="h-8 w-8 mx-auto text-gray-300" />
                  </div>
                  <p className="text-sm">{emptyStateMessage}</p>
                  <p className="text-xs text-gray-400">Click "Add Option" to get started</p>
                </div>
              )}
              
              {options.map((option, index) => (
                <Draggable
                  key={option.id || `option-${index}`}
                  draggableId={option.id?.toString() || `option-${index}`}
                  index={index}
                >
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={`${
                        index !== options.length - 1 ? 'border-b border-gray-200' : ''
                      } ${
                        snapshot.isDragging 
                          ? 'bg-blue-50 opacity-80' 
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 p-3">
                        <div
                          {...provided.dragHandleProps}
                          className={`cursor-grab hover:bg-gray-200 active:cursor-grabbing p-1 rounded ${
                            snapshot.isDragging ? 'bg-blue-100' : ''
                          }`}
                        >
                          <GripVertical className={`h-4 w-4 ${
                            snapshot.isDragging ? 'text-blue-600' : 'text-gray-400'
                          }`} />
                        </div>
                        
                        <div className="flex-1">
                          <Input
                            value={option.name}
                            onChange={(e) => onUpdateOption(index, 'name', e.target.value)}
                            placeholder={`Option ${index + 1}`}
                            className="w-full"
                          />
                        </div>
                        
                        <div className="w-24">
                          <Input
                            type="number"
                            step="0.01"
                            value={option.price_delta}
                            onChange={(e) => onUpdateOption(index, 'price_delta', parseFloat(e.target.value) || 0)}
                            placeholder="$0.00"
                            className="w-full text-center"
                          />
                        </div>
                        
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onRemoveOption(index)}
                          disabled={options.length <= 1}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      {showProductSpecific && (
                        <div className="px-3 pb-3">
                          <div className="flex items-center space-x-2">
                            <Switch
                              checked={option.is_product_specific || option.isProductSpecific}
                              onCheckedChange={(checked) => onUpdateOption(index, option.is_product_specific !== undefined ? 'is_product_specific' : 'isProductSpecific', checked)}
                              size="sm"
                            />
                            <Label className="text-sm">Product-specific option</Label>
                            <div className="text-xs text-gray-500">
                              {(option.is_product_specific || option.isProductSpecific)
                                ? "Only for this product" 
                                : "Available for all products"
                              }
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
};

export default ModifierOptionEditor;