import React from 'react';
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLocation as useStoreLocation } from '@/contexts/LocationContext';

export function LocationSelector() {
  const { locations, selectedLocation, selectedLocationId, setSelectedLocationId, isLoading } = useStoreLocation();

  if (isLoading) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        className="h-9 border-border/40 bg-background/50"
      >
        <MapPin className="mr-2 h-4 w-4" />
        <span className="hidden sm:inline">Loading...</span>
      </Button>
    );
  }

  // If there's only one location, don't show the selector
  if (locations.length <= 1) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 border-border/40 bg-background/50 transition-all duration-150 hover:bg-accent"
        >
          <MapPin className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">
            {selectedLocation?.name || 'All Locations'}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 border border-border/40">
        <DropdownMenuLabel>Store Location</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => setSelectedLocationId(null)}
          className={selectedLocationId === null ? 'bg-accent' : ''}
        >
          <MapPin className="mr-2 h-4 w-4" />
          <span>All Locations</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {locations.map((location) => (
          <DropdownMenuItem
            key={location.id}
            onClick={() => setSelectedLocationId(location.id)}
            className={selectedLocationId === location.id ? 'bg-accent' : ''}
          >
            <MapPin className="mr-2 h-4 w-4" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">{location.name}</span>
              <span className="text-xs text-muted-foreground">
                {location.city}, {location.state}
              </span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
