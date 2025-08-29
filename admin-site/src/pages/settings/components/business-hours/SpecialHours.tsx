import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Edit2, Trash2, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO, isAfter } from 'date-fns';

import { 
  getSpecialHours,
  createSpecialHours,
  updateSpecialHours,
  deleteSpecialHours
} from '@/services/api/businessHoursService';

interface SpecialHoursProps {
  profileId: number;
}

export function SpecialHours({ profileId }: SpecialHoursProps) {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSpecial, setEditingSpecial] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    date: '',
    is_closed: false,
    opening_time: '',
    closing_time: ''
  });

  const { data: specialHours, isLoading } = useQuery({
    queryKey: ['specialHours', profileId],
    queryFn: () => getSpecialHours(profileId),
    enabled: !!profileId,
  });

  const createMutation = useMutation({
    mutationFn: createSpecialHours,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['specialHours', profileId] });
      handleCloseDialog();
      toast.success('Special hours added successfully');
    },
    onError: () => {
      toast.error('Failed to add special hours');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number, data: any }) => 
      updateSpecialHours(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['specialHours', profileId] });
      handleCloseDialog();
      toast.success('Special hours updated successfully');
    },
    onError: () => {
      toast.error('Failed to update special hours');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSpecialHours,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['specialHours', profileId] });
      toast.success('Special hours deleted successfully');
    },
    onError: () => {
      toast.error('Failed to delete special hours');
    }
  });

  const processedSpecialHours = React.useMemo(() => {
    if (!specialHours) return { upcoming: [], past: [] };
    
    const hoursArray = Array.isArray(specialHours) ? specialHours : specialHours.results || [];
    const now = new Date();
    
    return hoursArray.reduce((acc: any, special: any) => {
      const specialDate = parseISO(special.date);
      if (isAfter(specialDate, now)) {
        acc.upcoming.push(special);
      } else {
        acc.past.push(special);
      }
      return acc;
    }, { upcoming: [], past: [] });
  }, [specialHours]);

  const handleAdd = () => {
    setEditingSpecial(null);
    setFormData({
      name: '',
      date: '',
      is_closed: false,
      opening_time: '',
      closing_time: ''
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (special: any) => {
    setEditingSpecial(special);
    setFormData({
      name: special.name,
      date: special.date,
      is_closed: special.is_closed,
      opening_time: special.opening_time?.substring(0, 5) || '',
      closing_time: special.closing_time?.substring(0, 5) || ''
    });
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    const data = {
      business_hours_profile: profileId,
      name: formData.name,
      date: formData.date,
      is_closed: formData.is_closed,
      opening_time: formData.is_closed ? null : `${formData.opening_time}:00`,
      closing_time: formData.is_closed ? null : `${formData.closing_time}:00`
    };

    if (editingSpecial) {
      updateMutation.mutate({ id: editingSpecial.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = (id: number) => {
    if (window.confirm('Are you sure you want to delete this special hours entry?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingSpecial(null);
    setFormData({
      name: '',
      date: '',
      is_closed: false,
      opening_time: '',
      closing_time: ''
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-muted animate-pulse rounded" />
        <Card>
          <CardContent className="p-4">
            <div className="h-24 bg-muted animate-pulse rounded" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Special Hours & Holidays</h3>
        <Button onClick={handleAdd}>
          <Plus className="h-4 w-4 mr-2" />
          Add Special Hours
        </Button>
      </div>

      {/* Upcoming Special Hours */}
      {processedSpecialHours.upcoming.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">Upcoming</h4>
          <div className="space-y-3">
            {processedSpecialHours.upcoming.map((special: any) => (
              <Card key={special.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{special.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {format(parseISO(special.date), 'EEEE, MMMM d, yyyy')}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      {special.is_closed ? (
                        <Badge variant="secondary">Closed</Badge>
                      ) : (
                        <div className="text-sm">
                          {special.opening_time?.substring(0, 5)} - {special.closing_time?.substring(0, 5)}
                        </div>
                      )}
                      
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="outline" onClick={() => handleEdit(special)}>
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => handleDelete(special.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Past Special Hours */}
      {processedSpecialHours.past.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">Past</h4>
          <div className="space-y-3">
            {processedSpecialHours.past.slice(0, 5).map((special: any) => (
              <Card key={special.id} className="opacity-60">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{special.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {format(parseISO(special.date), 'EEEE, MMMM d, yyyy')}
                        </div>
                      </div>
                    </div>
                    
                    {special.is_closed ? (
                      <Badge variant="secondary">Was Closed</Badge>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        {special.opening_time?.substring(0, 5)} - {special.closing_time?.substring(0, 5)}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {processedSpecialHours.upcoming.length === 0 && processedSpecialHours.past.length === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <Calendar className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No Special Hours</h3>
            <p className="text-muted-foreground mb-4">
              Add special hours for holidays or events
            </p>
            <Button onClick={handleAdd}>
              <Plus className="h-4 w-4 mr-2" />
              Add Special Hours
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingSpecial ? 'Edit Special Hours' : 'Add Special Hours'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Name</label>
              <Input
                placeholder="e.g., Christmas Day, Black Friday"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Date</label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_closed}
                onCheckedChange={(checked) => setFormData({ ...formData, is_closed: checked })}
              />
              <span className="text-sm">Closed all day</span>
            </div>
            
            {!formData.is_closed && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Opening Time</label>
                  <Input
                    type="time"
                    value={formData.opening_time}
                    onChange={(e) => setFormData({ ...formData, opening_time: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Closing Time</label>
                  <Input
                    type="time"
                    value={formData.closing_time}
                    onChange={(e) => setFormData({ ...formData, closing_time: e.target.value })}
                  />
                </div>
              </div>
            )}
            
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={handleCloseDialog}>
                Cancel
              </Button>
              <Button 
                onClick={handleSave}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}