import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Building, Plus, Settings, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  createBusinessHoursProfile,
  updateBusinessHoursProfile,
  deleteBusinessHoursProfile,
} from '@/services/api/businessHoursService';

interface BusinessHoursProfile {
  id: number;
  name: string;
  timezone: string;
  description?: string;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

interface ProfileSelectorProps {
  profiles: BusinessHoursProfile[];
  selectedProfileId: number | null;
  onSelectProfile: (profileId: number) => void;
  isLoading?: boolean;
}

const COMMON_TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (US & Canada)" },
  { value: "America/Chicago", label: "Central Time (US & Canada)" },
  { value: "America/Denver", label: "Mountain Time (US & Canada)" },
  { value: "America/Los_Angeles", label: "Pacific Time (US & Canada)" },
  { value: "Europe/London", label: "London Time" },
  { value: "Europe/Paris", label: "Central European Time" },
  { value: "Asia/Tokyo", label: "Japan Time" },
  { value: "UTC", label: "UTC (Coordinated Universal Time)" },
];

export function ProfileSelector({ profiles, selectedProfileId, onSelectProfile, isLoading }: ProfileSelectorProps) {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<{profile: BusinessHoursProfile, isNew: boolean} | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const createProfileMutation = useMutation({
    mutationFn: createBusinessHoursProfile,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['businessHoursProfiles'] });
      setIsDialogOpen(false);
      setEditingProfile(null);
      onSelectProfile(data.id);
      toast.success('Profile created successfully');
    },
    onError: (error: any) => {
      toast.error('Failed to create profile', {
        description: error.message
      });
    }
  });

  const updateProfileMutation = useMutation({
    mutationFn: ({ id, data }: { id: number, data: any }) => updateBusinessHoursProfile(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['businessHoursProfiles'] });
      setIsDialogOpen(false);
      setEditingProfile(null);
      toast.success('Profile updated successfully');
    },
    onError: (error: any) => {
      toast.error('Failed to update profile', {
        description: error.message
      });
    }
  });

  const deleteProfileMutation = useMutation({
    mutationFn: deleteBusinessHoursProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['businessHoursProfiles'] });
      toast.success('Profile deleted successfully');
    },
    onError: (error: any) => {
      toast.error('Failed to delete profile', {
        description: error.message
      });
    }
  });

  const selectedProfile = profiles.find(p => p.id === selectedProfileId);

  const handleCreateProfile = () => {
    setEditingProfile({
      profile: {
        id: 0,
        name: '',
        timezone: 'America/Chicago',
        description: '',
        is_active: true,
        is_default: false,
        created_at: '',
        updated_at: ''
      },
      isNew: true
    });
    setIsDialogOpen(true);
  };

  const handleEditProfile = (profile: BusinessHoursProfile) => {
    setEditingProfile({
      profile: { ...profile },
      isNew: false
    });
    setIsDialogOpen(true);
  };

  const handleSaveProfile = () => {
    if (!editingProfile) return;

    const data = {
      name: editingProfile.profile.name,
      timezone: editingProfile.profile.timezone,
      description: editingProfile.profile.description,
      is_active: editingProfile.profile.is_active,
      is_default: editingProfile.profile.is_default
    };

    if (editingProfile.isNew) {
      createProfileMutation.mutate(data);
    } else {
      updateProfileMutation.mutate({
        id: editingProfile.profile.id,
        data
      });
    }
  };

  const handleDeleteProfile = (profileId: number) => {
    if (window.confirm('Are you sure you want to delete this profile? This will also delete all associated schedules.')) {
      deleteProfileMutation.mutate(profileId);
      if (selectedProfileId === profileId) {
        const otherProfile = profiles.find(p => p.id !== profileId);
        if (otherProfile) {
          onSelectProfile(otherProfile.id);
        }
      }
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="animate-pulse flex items-center justify-between">
            <div className="h-4 bg-muted rounded w-32"></div>
            <div className="h-8 bg-muted rounded w-24"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Building className="h-5 w-5" />
              Business Location
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreateProfile}
                className="text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Location
              </Button>
              {profiles.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-xs"
                >
                  <Settings className="h-3 w-3 mr-1" />
                  {showAdvanced ? 'Hide' : 'Manage'}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Profile Selection */}
          <div className="space-y-4">
            {profiles.length > 1 ? (
              <div className="flex items-center gap-3">
                <Select
                  value={selectedProfileId?.toString()}
                  onValueChange={(value) => onSelectProfile(parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id.toString()}>
                        <div className="flex items-center gap-2">
                          <span>{profile.name}</span>
                          {profile.is_default && (
                            <Badge variant="outline" className="text-xs">Default</Badge>
                          )}
                          {!profile.is_active && (
                            <Badge variant="secondary" className="text-xs">Inactive</Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedProfile && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEditProfile(selectedProfile)}
                    className="text-xs"
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ) : (
              selectedProfile && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{selectedProfile.name}</span>
                    {selectedProfile.is_default && (
                      <Badge variant="outline" className="text-xs">Default</Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEditProfile(selectedProfile)}
                    className="text-xs"
                  >
                    <Edit className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                </div>
              )
            )}

            {/* Advanced Management */}
            {showAdvanced && profiles.length > 1 && (
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-3">All Locations</h4>
                <div className="space-y-2">
                  {profiles.map((profile) => (
                    <div 
                      key={profile.id}
                      className="flex items-center justify-between p-2 rounded-lg border bg-muted/20"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{profile.name}</span>
                          {profile.is_default && (
                            <Badge variant="default" className="text-xs">Default</Badge>
                          )}
                          {!profile.is_active && (
                            <Badge variant="secondary" className="text-xs">Inactive</Badge>
                          )}
                        </div>
                        {profile.description && (
                          <p className="text-xs text-muted-foreground">{profile.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditProfile(profile)}
                          className="text-xs h-8 w-8 p-0"
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteProfile(profile.id)}
                          className="text-xs h-8 w-8 p-0 text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit/Create Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingProfile?.isNew ? 'Add New Location' : 'Edit Location'}
            </DialogTitle>
          </DialogHeader>
          
          {editingProfile && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="profile-name">Location Name</Label>
                <Input
                  id="profile-name"
                  placeholder="e.g., Main Store, Downtown Location"
                  value={editingProfile.profile.name}
                  onChange={(e) => setEditingProfile({
                    ...editingProfile,
                    profile: { ...editingProfile.profile, name: e.target.value }
                  })}
                />
              </div>

              <div>
                <Label htmlFor="profile-timezone">Timezone</Label>
                <Select
                  value={editingProfile.profile.timezone}
                  onValueChange={(value) => setEditingProfile({
                    ...editingProfile,
                    profile: { ...editingProfile.profile, timezone: value }
                  })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="profile-description">Notes (Optional)</Label>
                <Textarea
                  id="profile-description"
                  placeholder="Additional details about this location"
                  value={editingProfile.profile.description}
                  onChange={(e) => setEditingProfile({
                    ...editingProfile,
                    profile: { ...editingProfile.profile, description: e.target.value }
                  })}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <Label className="text-base">Active</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable this location for business hours checks
                    </p>
                  </div>
                  <Switch
                    checked={editingProfile.profile.is_active}
                    onCheckedChange={(checked) => setEditingProfile({
                      ...editingProfile,
                      profile: { ...editingProfile.profile, is_active: checked }
                    })}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <Label className="text-base">Default Location</Label>
                    <p className="text-sm text-muted-foreground">
                      Use as the primary business hours configuration
                    </p>
                  </div>
                  <Switch
                    checked={editingProfile.profile.is_default}
                    onCheckedChange={(checked) => setEditingProfile({
                      ...editingProfile,
                      profile: { ...editingProfile.profile, is_default: checked }
                    })}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveProfile}
                  disabled={createProfileMutation.isPending || updateProfileMutation.isPending}
                >
                  {createProfileMutation.isPending || updateProfileMutation.isPending 
                    ? 'Saving...' 
                    : 'Save Location'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}