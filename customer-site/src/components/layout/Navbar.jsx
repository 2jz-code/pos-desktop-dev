import React, {
	useState,
	useEffect,
	useCallback,
	useMemo,
	useRef,
} from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from "framer-motion";
import {
	Menu,
	X,
	User,
	ShoppingCart,
	History,
	Settings,
	LogOut,
} from "lucide-react";

import { Button } from "@/components/ui/button";

// NOTE: The following imports are assumed to exist based on the old project structure.
// You will need to create and expose the AuthContext.
import { useAuth } from "@/contexts/AuthContext";
// The logo asset needs to be placed in the specified path.
import LogoImg from "@/assets/logo.png";
import { useCartSidebar } from "@/contexts/CartSidebarContext";
import { useCart } from "@/hooks/useCart";

const ProfileDropdown = () => {
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef(null);
	const { logout, user } = useAuth();
	const profileImageUrl = user?.profile_image;

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (event) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
				setIsOpen(false);
			}
		};

		if (isOpen) {
			document.addEventListener("mousedown", handleClickOutside);
		}
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [isOpen]);

	// Handle escape key press to close dropdown
	useEffect(() => {
		const handleEscapeKey = (event) => {
			if (event.key === "Escape") {
				setIsOpen(false);
			}
		};
		if (isOpen) {
			document.addEventListener("keydown", handleEscapeKey);
		}
		return () => {
			document.removeEventListener("keydown", handleEscapeKey);
		};
	}, [isOpen]);

	const toggleDropdown = () => {
		setIsOpen(!isOpen);
	};

	const menuItems = [
		{
			id: "profile",
			label: "My Profile",
			icon: (
				<User
					className="mr-2 text-accent-dark-green"
					size={16}
				/>
			),
			link: "/dashboard",
			divider: false,
		},
		{
			id: "orders",
			label: "Order History",
			icon: (
				<History
					className="mr-2 text-accent-dark-green"
					size={16}
				/>
			),
			link: "/dashboard?tab=orders",
			divider: false,
		},
		{
			id: "settings",
			label: "Account Settings",
			icon: (
				<Settings
					className="mr-2 text-accent-dark-green"
					size={16}
				/>
			),
			link: "/dashboard?tab=account",
			divider: true,
		},
		{
			id: "logout",
			label: "Logout",
			icon: (
				<LogOut
					className="mr-2 text-red-500"
					size={16}
				/>
			),
			action: logout,
			divider: false,
		},
	];

	if (!user) return null;

	return (
		<div
			className="relative"
			ref={dropdownRef}
		>
			{/* Profile Avatar Button */}
			<button
				onClick={toggleDropdown}
				className="relative flex items-center focus:outline-none focus:ring-2 focus:ring-primary-green rounded-full"
				aria-expanded={isOpen}
				aria-haspopup="true"
			>
				<div className="w-8 h-8 rounded-full overflow-hidden bg-accent-subtle-gray flex items-center justify-center">
					{profileImageUrl ? (
						<img
							src={profileImageUrl}
							alt="User profile"
							className="w-full h-full object-cover"
							onError={(e) => {
								e.target.onerror = null;
								e.target.style.display = "none";
								const parent = e.target.parentElement;
								if (parent && !parent.querySelector(".fallback-icon")) {
									const icon = document.createElement("div");
									icon.className =
										"fallback-icon w-full h-full flex items-center justify-center";
									icon.innerHTML =
										'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 text-accent-dark-brown"><path fill-rule="evenodd" d="M18.685 19.097A9.723 9.723 0 0021.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 003.065 7.097A9.716 9.716 0 0012 21.75a9.716 9.716 0 006.685-2.653zm-12.54-1.285A7.486 7.486 0 0112 15a7.486 7.486 0 015.855 2.812A8.224 8.224 0 0112 20.25a8.224 8.224 0 01-5.855-2.438zM15.75 9a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" clip-rule="evenodd" /></svg>';
									parent.appendChild(icon);
								}
							}}
						/>
					) : (
						<User
							className="text-accent-dark-brown"
							size={20}
						/>
					)}
				</div>
			</button>

			{/* Dropdown Menu */}
			<AnimatePresence>
				{isOpen && (
					<motion.div
						initial={{ opacity: 0, y: -10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -10 }}
						transition={{ duration: 0.2 }}
						className="absolute right-0 mt-2 w-48 bg-accent-light-beige rounded-md shadow-lg z-50 overflow-hidden border border-accent-subtle-gray/50"
						style={{ transformOrigin: "top right" }}
						role="menu"
						aria-orientation="vertical"
						aria-labelledby="user-menu"
					>
						<div className="py-1">
							{menuItems.map((item) => (
								<React.Fragment key={item.id}>
									{item.link ? (
										<Link
											to={item.link}
											className="flex items-center px-4 py-2 text-sm text-accent-dark-green hover:bg-primary-beige hover:text-primary-green transition-colors"
											onClick={() => setIsOpen(false)}
											role="menuitem"
										>
											{item.icon}
											{item.label}
										</Link>
									) : (
										<button
											onClick={() => {
												setIsOpen(false);
												if (item.action) item.action();
											}}
											className={`flex items-center w-full text-left px-4 py-2 text-sm transition-colors ${
												item.id === "logout"
													? "text-red-600 hover:bg-red-50 hover:text-red-700"
													: "text-accent-dark-green hover:bg-primary-beige hover:text-primary-green"
											}`}
											role="menuitem"
										>
											{item.icon}
											{item.label}
										</button>
									)}
									{item.divider && (
										<div className="border-t border-accent-subtle-gray/30 my-1"></div>
									)}
								</React.Fragment>
							))}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
};

const Navbar = () => {
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const [scrolled, setScrolled] = useState(false);
	const { isAuthenticated, logout } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();
	const isHomePage = location.pathname === "/";
	const isMenuPage = location.pathname === "/menu";
	const { openCart } = useCartSidebar();
	const { cartItemCount } = useCart();

	const handleScroll = useCallback(() => {
		// Use a small threshold to prevent style flickering on some browsers
		setScrolled(window.scrollY > 10);
	}, []);

	useEffect(() => {
		// Only add scroll listener on the home page (not menu page)
		if (isHomePage && !isMenuPage) {
			window.addEventListener("scroll", handleScroll);
			// Call handler once on mount to set initial state
			handleScroll();
		}

		return () => {
			if (isHomePage && !isMenuPage) {
				window.removeEventListener("scroll", handleScroll);
			}
		};
	}, [isHomePage, isMenuPage, handleScroll]);

	const handleCartClick = (e) => {
		e.preventDefault();
		// Cart should be accessible to both authenticated and guest users
		openCart();
	};

	// NOTE: The colors below are from the old site's theme.
	// For a consistent design, these should be replaced with variables from your tailwind.config.js.
	const navbarClasses = useMemo(() => {
		const base = "fixed top-0 w-full z-50 transition-all duration-300";
		const solidClasses =
			"bg-white/95 backdrop-blur-md shadow-lg border-b border-gray-200 py-0";
		const transparentClasses = "bg-transparent py-2";
		const menuClasses = "bg-accent-light-beige shadow-md py-3"; // Menu-specific styling

		if (isMenuPage) {
			return `${base} ${menuClasses}`;
		}
		if (!isHomePage) {
			return `${base} ${solidClasses}`;
		}
		return `${base} ${scrolled ? solidClasses : transparentClasses}`;
	}, [scrolled, isHomePage, isMenuPage]);

	const textAndIconColor = useMemo(() => {
		const solidColor = "text-gray-800";
		const transparentColor = "text-white";
		const menuColor = "text-accent-dark-green"; // Menu-specific text color

		if (isMenuPage) {
			return menuColor;
		}
		if (!isHomePage) {
			return solidColor;
		}
		return scrolled ? solidColor : transparentColor;
	}, [scrolled, isHomePage, isMenuPage]);

	const linkHoverColor = useMemo(() => {
		// Using a beige from the theme for consistency
		const solidHover = "hover:text-accent-warm-brown";
		const transparentHover = "hover:text-gray-200";
		const menuHover = "hover:text-primary-green"; // Menu-specific hover color

		if (isMenuPage) {
			return menuHover;
		}
		if (!isHomePage) {
			return solidHover;
		}
		return scrolled ? solidHover : transparentHover;
	}, [scrolled, isHomePage, isMenuPage]);

	const navLinks = ["Home", "About", "Contact", "FAQ"];

	return (
		<nav className={navbarClasses}>
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="flex justify-between items-center h-16">
					{/* Logo */}
					<Link
						to="/"
						className="flex items-center"
					>
						<img
							src={LogoImg}
							alt="Ajeen Logo"
							className="h-12 w-auto"
						/>
					</Link>

					{/* Desktop Navigation */}
					<div className="hidden md:flex items-center space-x-2">
						{navLinks.map((item) => (
							<a
								key={item}
								href={`#${item.toLowerCase()}`}
								className={`relative px-3 py-2 font-medium transition-colors duration-300 ${textAndIconColor} ${linkHoverColor}
                  after:absolute after:bottom-0.5 after:left-0 after:h-0.5 after:w-0
                  after:bg-accent-warm-brown after:transition-all after:duration-300
                  hover:after:w-full`}
							>
								{item}
							</a>
						))}

						{/* Order Now Button */}
						<Button
							onClick={() => navigate("/menu")}
							className="ml-4 bg-accent-warm-brown text-white hover:bg-accent-warm-brown/90 rounded-full px-6 shadow-md hover:shadow-lg transform hover:scale-105 transition-all"
						>
							Order Now
						</Button>

						{/* Cart Icon */}
						<Button
							variant="ghost"
							size="icon"
							onClick={handleCartClick}
							className={`relative ml-1 rounded-full ${textAndIconColor} ${linkHoverColor}`}
						>
							<ShoppingCart className="h-6 w-6" />
							{cartItemCount > 0 && (
								<AnimatePresence>
									<motion.span
										initial={{ scale: 0 }}
										animate={{ scale: 1 }}
										exit={{ scale: 0 }}
										className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent-warm-brown text-xs text-white"
									>
										{cartItemCount}
									</motion.span>
								</AnimatePresence>
							)}
						</Button>

						{/* Login/Profile */}
						{isAuthenticated ? (
							<ProfileDropdown />
						) : (
							<Button
								variant="ghost"
								size="icon"
								onClick={() => navigate("/login")}
								className={`ml-1 rounded-full ${textAndIconColor} ${linkHoverColor}`}
							>
								<User className="h-6 w-6" />
							</Button>
						)}
					</div>

					{/* Mobile Menu Button */}
					<div className="md:hidden">
						<Button
							variant="ghost"
							size="icon"
							onClick={() => setMobileMenuOpen((o) => !o)}
							className={`rounded-md ${textAndIconColor}`}
							aria-label="Toggle mobile menu"
						>
							{mobileMenuOpen ? (
								<X className="h-6 w-6" />
							) : (
								<Menu className="h-6 w-6" />
							)}
						</Button>
					</div>
				</div>
			</div>

			{/* Mobile Menu */}
			<AnimatePresence>
				{mobileMenuOpen && (
					<motion.div
						initial={{ opacity: 0, height: 0 }}
						animate={{ opacity: 1, height: "auto" }}
						exit={{ opacity: 0, height: 0 }}
						transition={{ duration: 0.3 }}
						// Old color: bg-accent-light-beige (#F3EFEA)
						className="md:hidden bg-white overflow-hidden shadow-lg"
						onClick={() => setMobileMenuOpen(false)}
					>
						<div className="px-4 pt-2 pb-4 space-y-2">
							{navLinks.map((item) => (
								<a
									key={item}
									href={`#${item.toLowerCase()}`}
									className="block py-3 px-4 text-gray-800 font-medium border-b border-gray-100 hover:bg-gray-50"
								>
									{item}
								</a>
							))}

							<div className="pt-4 border-t border-gray-200 space-y-3">
								<Button
									onClick={() => navigate("/menu")}
									className="w-full bg-accent-warm-brown text-white hover:bg-accent-warm-brown/90"
								>
									Order Now
								</Button>

								{/* Cart Button */}
								<Button
									variant="outline"
									onClick={handleCartClick}
									className="w-full flex justify-center items-center"
								>
									<ShoppingCart className="mr-2 h-4 w-4" />
									Cart {cartItemCount > 0 && `(${cartItemCount})`}
								</Button>

								{!isAuthenticated ? (
									<Button
										variant="outline"
										onClick={() => navigate("/login")}
										className="w-full"
									>
										Login / Sign Up
									</Button>
								) : (
									<>
										<Button
											variant="outline"
											onClick={() => navigate("/dashboard")}
											className="w-full flex justify-center items-center"
										>
											<User className="mr-2 h-4 w-4" />
											My Profile
										</Button>
										<Button
											variant="destructive"
											onClick={logout}
											className="w-full"
										>
											Logout
										</Button>
									</>
								)}
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</nav>
	);
};

export default Navbar;
