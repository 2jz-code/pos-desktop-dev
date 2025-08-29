import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { 
  getRegularHours, 
  updateRegularHours,
  updateTimeSlot,
  createTimeSlot,
  deleteTimeSlot 
} from '@/services/api/businessHoursService';
import { SimpleTimeSelect } from './SimpleTimeSelect';

interface WeeklyHoursProps {
  profileId: number;
}

export function WeeklyHours({ profileId }: WeeklyHoursProps) {
  const queryClient = useQueryClient();

  const { data: regularHours, isLoading } = useQuery({
    queryKey: ['regularHours', profileId],
    queryFn: () => getRegularHours(profileId),
    enabled: !!profileId,
  });

  const updateSlotMutation = useMutation({
    mutationFn: ({ slotId, data }: { slotId: number, data: any }) => 
      updateTimeSlot(slotId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regularHours', profileId] });
    }
  });

  const createSlotMutation = useMutation({
    mutationFn: ({ regularHoursId, data }: { regularHoursId: number, data: any }) => 
      createTimeSlot({ regular_hours: regularHoursId, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regularHours', profileId] });
      toast.success('Time slot added');
    }
  });

  const deleteSlotMutation = useMutation({
    mutationFn: deleteTimeSlot,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regularHours', profileId] });
      toast.success('Time slot removed');
    }
  });

  const updateHoursMutation = useMutation({
    mutationFn: ({ dayId, data }: { dayId: number, data: any }) => 
      updateRegularHours(dayId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regularHours', profileId] });
      toast.success('Hours updated');
    }
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-10 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const rawDays = Array.isArray(regularHours) ? regularHours : [];
  
  // Sort days: Monday (0) to Sunday (6)
  const days = rawDays.sort((a, b) => a.day_of_week - b.day_of_week);

  const handleTimeChange = (slot: any, field: 'opening_time' | 'closing_time', value: string) => {
    const timeValue = `${value}:00`;
    
    if (slot && slot.id) {
      // Update existing time slot
      updateSlotMutation.mutate({
        slotId: slot.id,
        data: { [field]: timeValue }
      });
    }
  };

  const handleAddTimeSlot = (day: any) => {
    if (day.is_closed) return;
    
    // Default new time slot times
    const newSlotData = {
      slot_type: 'regular',
      opening_time: '13:00:00', // 1:00 PM default for additional slots
      closing_time: '17:00:00'  // 5:00 PM
    };
    
    createSlotMutation.mutate({
      regularHoursId: day.id,
      data: newSlotData
    });
  };

  const handleDeleteTimeSlot = (slotId: number) => {
    if (window.confirm('Are you sure you want to remove this time slot?')) {
      deleteSlotMutation.mutate(slotId);
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-1">
          {days.map((day, dayIndex) => {
            // Sort time slots by creation order to keep the first one stable
            const timeSlots = (day.time_slots || []).sort((a: any, b: any) => {
              // Sort by ID to maintain consistent ordering
              return a.id - b.id;
            });
            const firstSlot = timeSlots[0];
            const additionalSlots = timeSlots.slice(1);
            
            return (
              <div key={day.id}>
                {/* Day Header Row - Always shows the first/main time slot */}
                <div 
                  className={`flex items-center px-3 py-2 rounded-lg hover:bg-muted/30 transition-colors ${
                    dayIndex % 2 === 0 ? 'bg-muted/10' : ''
                  }`}
                >
                  <div className="w-20 text-sm font-medium">{day.day_name}</div>
                  
                  {/* First time slot or closed indicator */}
                  {day.is_closed ? (
                    <>
                      <div className="flex-1 px-3">
                        <span className="text-muted-foreground text-sm">—</span>
                      </div>
                      <div className="px-2 text-muted-foreground text-sm">to</div>
                      <div className="flex-1 px-3">
                        <span className="text-muted-foreground text-sm">—</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 px-3">
                        <SimpleTimeSelect
                          value={firstSlot?.opening_time?.substring(0, 5) || ''}
                          onChange={(value) => {
                            console.log(`Updating ${day.day_name} main opening time to ${value}`);
                            if (firstSlot) {
                              handleTimeChange(firstSlot, 'opening_time', value);
                            } else {
                              // Create the first slot if it doesn't exist
                              const newSlotData = {
                                slot_type: 'regular',
                                opening_time: `${value}:00`,
                                closing_time: '17:00:00'
                              };
                              createSlotMutation.mutate({
                                regularHoursId: day.id,
                                data: newSlotData
                              });
                            }
                          }}
                          disabled={day.is_closed}
                        />
                      </div>

                      <div className="px-2 text-muted-foreground text-sm">to</div>

                      <div className="flex-1 px-3">
                        <SimpleTimeSelect
                          value={firstSlot?.closing_time?.substring(0, 5) || ''}
                          onChange={(value) => {
                            console.log(`Updating ${day.day_name} main closing time to ${value}`);
                            if (firstSlot) {
                              handleTimeChange(firstSlot, 'closing_time', value);
                            } else {
                              // Create the first slot if it doesn't exist
                              const newSlotData = {
                                slot_type: 'regular',
                                opening_time: '09:00:00',
                                closing_time: `${value}:00`
                              };
                              createSlotMutation.mutate({
                                regularHoursId: day.id,
                                data: newSlotData
                              });
                            }
                          }}
                          disabled={day.is_closed}
                        />
                      </div>
                    </>
                  )}

                  {/* Add Time Slot Button */}
                  <div className="px-3">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 w-6 p-0 opacity-40 hover:opacity-100 disabled:opacity-20" 
                      onClick={() => handleAddTimeSlot(day)}
                      disabled={day.is_closed}
                      title="Add time slot"
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>

                  {/* Closed Checkbox */}
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      checked={day.is_closed}
                      onCheckedChange={(checked) => {
                        console.log(`Toggling ${day.day_name} closed status to ${checked}`);
                        updateHoursMutation.mutate({
                          dayId: day.id,
                          data: { is_closed: checked }
                        });
                      }}
                    />
                    <label className="text-xs text-muted-foreground">Closed</label>
                  </div>
                </div>

                {/* Additional Time Slots - Only the ones beyond the first */}
                {!day.is_closed && additionalSlots.map((slot) => (
                  <div 
                    key={slot.id}
                    className="flex items-center px-3 py-2 ml-20 rounded-lg hover:bg-muted/20 transition-colors border-l-2 border-muted"
                  >
                    <div className="flex-1 px-3">
                      <SimpleTimeSelect
                        value={slot.opening_time?.substring(0, 5) || ''}
                        onChange={(value) => {
                          console.log(`Updating ${day.day_name} additional slot opening time to ${value}`);
                          handleTimeChange(slot, 'opening_time', value);
                        }}
                      />
                    </div>

                    <div className="px-2 text-muted-foreground text-sm">to</div>

                    <div className="flex-1 px-3">
                      <SimpleTimeSelect
                        value={slot.closing_time?.substring(0, 5) || ''}
                        onChange={(value) => {
                          console.log(`Updating ${day.day_name} additional slot closing time to ${value}`);
                          handleTimeChange(slot, 'closing_time', value);
                        }}
                      />
                    </div>

                    {/* Remove Time Slot Button - Only for additional slots */}
                    <div className="px-3">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 w-6 p-0 opacity-40 hover:opacity-100 hover:text-destructive" 
                        onClick={() => handleDeleteTimeSlot(slot.id)}
                        title="Remove time slot"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>

                    <div className="w-24"></div> {/* Spacer for alignment */}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}