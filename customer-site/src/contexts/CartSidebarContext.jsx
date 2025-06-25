import React, { createContext, useContext, useState } from "react";

const CartSidebarContext = createContext();

export const CartSidebarProvider = ({ children }) => {
	const [isCartOpen, setIsCartOpen] = useState(false);

	const openCart = () => setIsCartOpen(true);
	const closeCart = () => setIsCartOpen(false);
	const toggleCart = () => setIsCartOpen(!isCartOpen);

	return (
		<CartSidebarContext.Provider
			value={{
				isCartOpen,
				openCart,
				closeCart,
				toggleCart,
			}}
		>
			{children}
		</CartSidebarContext.Provider>
	);
};
// eslint-disable-next-line react-refresh/only-export-components
export const useCartSidebar = () => {
	const context = useContext(CartSidebarContext);
	if (!context) {
		throw new Error("useCartSidebar must be used within a CartSidebarProvider");
	}
	return context;
};
