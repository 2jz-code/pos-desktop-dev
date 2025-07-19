import { useRef, useCallback } from 'react';

/**
 * Hook for scrolling to scanned items in tables.
 * Provides functionality to scroll to and highlight scanned items.
 * It prioritizes the tableContainerRef for scrolling, but falls back to document.querySelector
 * for backward compatibility with components that don't use the ref.
 */
export const useScrollToScannedItem = () => {
	const tableContainerRef = useRef(null);

	const scrollToItem = useCallback((itemId, options = {}) => {
		const {
			dataAttribute = 'data-item-id',
			delay = 200,
			behavior = 'smooth',
			block = 'center'
		} = options;

		setTimeout(() => {
            // Prioritize the ref if it's attached, otherwise search the whole document.
			const searchScope = tableContainerRef.current || document;
			const itemRow = searchScope.querySelector(`[${dataAttribute}="${itemId}"]`);

			if (itemRow) {
				itemRow.scrollIntoView({ 
					behavior,
					block
				});
			} else {
                console.warn(`Scroll item with attribute [${dataAttribute}="${itemId}"] not found.`);
            }
		}, delay);
	}, []); // ref is stable, so dependencies are not needed

	const scrollToItemWithHighlight = useCallback((itemId, options = {}) => {
		const {
			highlightClass = 'bg-blue-100',
			highlightDuration = 3000,
			...scrollOptions
		} = options;

		scrollToItem(itemId, scrollOptions);

		setTimeout(() => {
            const searchScope = tableContainerRef.current || document;
			const itemRow = searchScope.querySelector(`[${scrollOptions.dataAttribute || 'data-item-id'}="${itemId}"]`);

			if (itemRow) {
				itemRow.classList.add(highlightClass);
				setTimeout(() => {
					itemRow.classList.remove(highlightClass);
				}, highlightDuration);
			}
		}, scrollOptions.delay || 200);
	}, [scrollToItem]);

	return {
		tableContainerRef,
		scrollToItem,
		scrollToItemWithHighlight
	};
};