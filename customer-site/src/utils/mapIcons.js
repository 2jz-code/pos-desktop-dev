import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons not showing in React
// This is a known issue with Leaflet in React
delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
	iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
	iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
	shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

/**
 * Custom store location marker
 * Uses brand colors (primary green)
 */
export const storeMarkerIcon = L.divIcon({
	className: 'custom-store-marker',
	html: `
		<div class="relative">
			<div class="absolute -top-12 -left-6 bg-primary-green rounded-full p-3 shadow-lg border-4 border-white">
				<svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
					<path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd" />
				</svg>
			</div>
			<div class="absolute top-0 left-0 w-1 h-3 bg-primary-green"></div>
		</div>
	`,
	iconSize: [48, 48],
	iconAnchor: [24, 48],
	popupAnchor: [0, -48],
});

/**
 * Selected/Active store marker (highlighted)
 */
export const selectedMarkerIcon = L.divIcon({
	className: 'custom-selected-marker',
	html: `
		<div class="relative animate-bounce">
			<div class="absolute -top-12 -left-6 bg-accent-warm-brown rounded-full p-3 shadow-xl border-4 border-white ring-4 ring-primary-green/30">
				<svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
					<path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd" />
				</svg>
			</div>
			<div class="absolute top-0 left-0 w-1 h-3 bg-accent-warm-brown"></div>
		</div>
	`,
	iconSize: [48, 48],
	iconAnchor: [24, 48],
	popupAnchor: [0, -48],
});

/**
 * User location marker
 */
export const userLocationIcon = L.divIcon({
	className: 'custom-user-marker',
	html: `
		<div class="relative">
			<div class="absolute -top-4 -left-4 w-8 h-8 bg-blue-500 rounded-full border-4 border-white shadow-lg">
				<div class="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-75"></div>
			</div>
		</div>
	`,
	iconSize: [32, 32],
	iconAnchor: [16, 16],
	popupAnchor: [0, -16],
});

/**
 * Create a custom numbered marker for clustering
 */
export const createNumberedMarker = (number, isSelected = false) => {
	return L.divIcon({
		className: 'custom-numbered-marker',
		html: `
			<div class="relative">
				<div class="absolute -top-12 -left-6 ${isSelected ? 'bg-accent-warm-brown ring-4 ring-primary-green/30' : 'bg-primary-green'} rounded-full p-3 shadow-lg border-4 border-white">
					<div class="flex items-center justify-center w-6 h-6">
						<span class="text-white font-bold text-sm">${number}</span>
					</div>
				</div>
				<div class="absolute top-0 left-0 w-1 h-3 ${isSelected ? 'bg-accent-warm-brown' : 'bg-primary-green'}"></div>
			</div>
		`,
		iconSize: [48, 48],
		iconAnchor: [24, 48],
		popupAnchor: [0, -48],
	});
};
