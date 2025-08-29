import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Clock, Calendar } from 'lucide-react';

import { getBusinessHoursProfiles } from '@/services/api/businessHoursService';
import { ProfileSelector } from './ProfileSelector';
import { WeeklyHours } from './WeeklyHours';
import { SpecialHours } from './SpecialHours';

export function BusinessHours() {
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'weekly' | 'special'>('weekly');

  const { data: profiles, isLoading } = useQuery({
    queryKey: ['businessHoursProfiles'],
    queryFn: getBusinessHoursProfiles,
  });

  // Auto-select first/default profile
  React.useEffect(() => {
    if (!selectedProfileId && profiles?.length > 0) {
      const defaultProfile = profiles.find((p: any) => p.is_default) || profiles[0];
      setSelectedProfileId(defaultProfile.id);
    }
  }, [profiles, selectedProfileId]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Business Hours</h1>
          <p className="text-muted-foreground">
            Manage your weekly schedule and special hours
          </p>
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="h-64 bg-muted animate-pulse rounded" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!profiles?.length) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Business Hours</h1>
          <p className="text-muted-foreground">
            Manage your weekly schedule and special hours
          </p>
        </div>
        <Card>
          <CardContent className="text-center py-12">
            <Clock className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No Business Hours Set</h3>
            <p className="text-muted-foreground mb-4">
              Get started by creating your first business hours profile
            </p>
            <ProfileSelector
              profiles={[]}
              selectedProfileId={null}
              onSelectProfile={() => {}}
              isLoading={false}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Business Hours</h1>
        <p className="text-muted-foreground">
          Manage your weekly schedule and special hours
        </p>
      </div>

      {/* Profile Selector */}
      <ProfileSelector
        profiles={profiles}
        selectedProfileId={selectedProfileId}
        onSelectProfile={setSelectedProfileId}
        isLoading={isLoading}
      />

      {/* Main Content */}
      {selectedProfileId && (
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'weekly' | 'special')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="weekly" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Weekly Hours
            </TabsTrigger>
            <TabsTrigger value="special" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Special Hours
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="weekly" className="mt-6">
            <WeeklyHours profileId={selectedProfileId} />
          </TabsContent>
          
          <TabsContent value="special" className="mt-6">
            <SpecialHours profileId={selectedProfileId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}