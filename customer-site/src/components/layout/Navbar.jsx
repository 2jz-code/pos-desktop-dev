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
	Clock,
	Store,
} from "lucide-react";

import { Button } from "@/components/ui/button";

// NOTE: The following imports are assumed to exist based on the old project structure.
// You will need to create and expose the AuthContext.
import { useAuth } from "@/contexts/AuthContext";
import { useStoreStatus } from "@/contexts/StoreStatusContext";
// The logo asset needs to be placed in the specified path.
import LogoImg from "@/assets/logo.png";
import { useCartSidebar } from "@/contexts/CartSidebarContext";
import { useCart } from "@/hooks/useCart";
import OptimizedImage from "@/components/OptimizedImage";
import BusinessHours from "@/components/common/BusinessHours";

// Store Status Indicator Component
const StoreStatusIndicator = ({ scrolled, isHomePage, mobileMenuOpen }) => {
	const [showHours, setShowHours] = useState(false);
	const storeStatus = useStoreStatus();
	const dropdownRef = useRef(null);

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (event) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
				setShowHours(false);
			}
		};

		if (showHours) {
			document.addEventListener("mousedown", handleClickOutside);
		}
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [showHours]);

	if (storeStatus.isLoading) {
		return (
			<div className="flex items-center space-x-2">
				<div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
				<span className={`text-sm ${
					isHomePage && !scrolled && !mobileMenuOpen 
						? "text-accent-light-beige" 
						: "text-accent-dark-brown"
				}`}>
					Loading...
				</span>
			</div>
		);
	}

	const textColorClass = isHomePage && !scrolled && !mobileMenuOpen 
		? "text-accent-light-beige" 
		: "text-accent-dark-brown";

	return (
		<div className="relative" ref={dropdownRef}>
			<button
				onClick={() => setShowHours(!showHours)}
				className={`flex items-center space-x-2 hover:opacity-80 transition-opacity ${textColorClass}`}
			>
				{/* Status Dot */}
				<div className={`w-2 h-2 rounded-full ${
					storeStatus.isOpen ? 'bg-green-500' : 'bg-red-500'
				}`}></div>
				
				{/* Status Text */}
				<span className="text-sm font-medium">
					{storeStatus.isOpen ? 'Open' : 'Closed'}
				</span>

				{/* Time indicator for closing soon */}
				{storeStatus.isClosingSoon && (
					<Clock className="h-3 w-3 text-yellow-500" />
				)}
			</button>

			{/* Dropdown with today's hours */}
			<AnimatePresence>
				{showHours && (
					<motion.div
						initial={{ opacity: 0, y: -10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -10 }}
						transition={{ duration: 0.2 }}
						className="absolute right-0 mt-2 w-80 bg-white rounded-md shadow-lg z-50 overflow-hidden border border-gray-200"
					>
						<div className="p-4">
							<div className="flex items-center justify-between mb-3">
								<span className="font-semibold text-gray-800">Store Status</span>
								<div className="flex items-center space-x-1">
									<div className={`w-2 h-2 rounded-full ${
										storeStatus.isOpen ? 'bg-green-500' : 'bg-red-500'
									}`}></div>
									<span className={`text-sm font-medium ${
										storeStatus.isOpen ? 'text-green-700' : 'text-red-700'
									}`}>
										{storeStatus.isOpen ? 'Open' : 'Closed'}
									</span>
								</div>
							</div>
							
							{storeStatus.isClosingSoon && (
								<div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
									Closing in {storeStatus.getTimeUntilCloseString()}
								</div>
							)}

							{!storeStatus.isOpen && storeStatus.getNextOpeningDisplay() && (
								<div className="mb-3 text-sm text-gray-600">
									Opens at {storeStatus.getNextOpeningDisplay()}
								</div>
							)}
							
							<div className="border-t border-gray-200 pt-3">
								<h4 className="text-sm font-medium text-gray-800 mb-2">Business Hours</h4>
								<div className="text-sm">
									<BusinessHours mode="detailed" textColor="text-accent-warm-brown" />
								</div>
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
};

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
						<OptimizedImage
							src={profileImageUrl}
							alt="User profile"
							className="w-full h-full object-cover"
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
	const { isAuthenticated, logout } = useAuth(); //eslint-disable-line
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

	useEffect(() => {
		// Cleanup function
		return () => {
			setMobileMenuOpen(false);
		};
	}, [location.pathname]);

	const navLinks = useMemo(
		() => [
			{ name: "Home", href: "/" },
			{ name: "About", href: "/#about" },
			{ name: "Locations", href: "/locations" },
			{ name: "Contact", href: "/#contact" },
			{ name: "FAQ", href: "/#faq" },
		],
		[]
	);

	const navbarClasses = useMemo(() => {
		const baseClasses =
			"fixed top-0 left-0 right-0 z-40 transition-all duration-300 ease-in-out";
		if (isHomePage) {
			return `${baseClasses} ${
				scrolled || mobileMenuOpen
					? "bg-accent-light-beige/95 backdrop-blur-sm shadow-md"
					: "bg-transparent"
			}`;
		}
		// For all other pages, use a solid background
		return `${baseClasses} bg-accent-light-beige shadow-sm`;
	}, [scrolled, mobileMenuOpen, isHomePage]);

	const linkClasses = useMemo(() => {
		const baseClasses =
			"text-md font-medium transition-colors hover:text-primary-green";
		if (isHomePage && !scrolled && !mobileMenuOpen) {
			return `${baseClasses} text-accent-light-beige`;
		}
		return `${baseClasses} text-accent-dark-brown`;
	}, [isHomePage, scrolled, mobileMenuOpen]);

	const handleCartClick = (e) => {
		e.preventDefault();
		openCart();
	};

	const renderNavLinks = () =>
		navLinks.map((link) => (
			<Link
				key={link.name}
				to={link.href}
				className={linkClasses}
				onClick={() => setMobileMenuOpen(false)}
			>
				{link.name}
			</Link>
		));

	const renderMobileNavLinks = () =>
		navLinks.map((link) => (
			<Link
				key={link.name}
				to={link.href}
				className="block px-3 py-2 text-base font-medium text-accent-dark-brown hover:text-primary-green hover:bg-gray-50 rounded-md transition-colors"
				onClick={() => setMobileMenuOpen(false)}
			>
				{link.name}
			</Link>
		));

	const renderAuthButtons = () => {
		if (isAuthenticated) {
			// Mobile profile menu: My Profile link with logout button
			if (mobileMenuOpen) {
				return (
					<div className="flex items-center justify-between w-full px-3 py-2 bg-gray-50 rounded-md">
						<Link
							to="/dashboard"
							onClick={() => setMobileMenuOpen(false)}
							className="flex items-center text-accent-dark-brown hover:text-primary-green transition-colors"
						>
							<User size={20} className="mr-3" />
							<span className="font-medium">My Profile</span>
						</Link>
						<button
							onClick={() => {
								logout();
								setMobileMenuOpen(false);
							}}
							className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
							aria-label="Logout"
						>
							<LogOut size={20} />
						</button>
					</div>
				);
			}
			// Desktop profile dropdown
			return <ProfileDropdown />;
		}
		return (
			<Button
				onClick={() => navigate("/login")}
				className={`${
					mobileMenuOpen
						? "w-full bg-primary-green text-white hover:bg-primary-green/90"
						: isHomePage && !scrolled
						? "bg-white/20 text-white hover:bg-white/30 rounded-full"
						: "bg-primary-green text-white hover:bg-primary-green/90 rounded-full"
				} transition-colors`}
			>
				Login
			</Button>
		);
	};

	return (
		<header className={navbarClasses}>
			<nav className="container mx-auto px-4 sm:px-6 lg:px-8">
				<div className="flex items-center justify-between h-20">
					{/* Logo */}
					<div className="flex-shrink-0">
						<Link
							to="/"
							className="flex items-center space-x-2"
						>
							<OptimizedImage
								src={LogoImg}
								alt="Ajeen Logo"
								className="h-14 w-auto"
								width={64}
								height={56}
								priority
							/>
						</Link>
					</div>

					{/* Desktop Navigation */}
					<div className="hidden md:flex md:items-center md:space-x-8">
						{renderNavLinks()}
					</div>

					{/* Right side items */}
					<div className="flex items-center space-x-4">
						{/* Store Status - Desktop */}
						<div className="hidden md:block">
							<StoreStatusIndicator 
								scrolled={scrolled} 
								isHomePage={isHomePage}
								mobileMenuOpen={mobileMenuOpen}
							/>
						</div>
						
						<div className="hidden md:block">
							<Button
								onClick={() => navigate("/menu")}
								className="bg-accent-warm-brown text-white hover:bg-accent-warm-brown/90 rounded-full"
							>
								Order Now
							</Button>
						</div>
						{/* Cart Icon */}
						<div className="hidden md:flex">
							<Button
								variant="ghost"
								size="icon"
								onClick={handleCartClick}
								className={`${linkClasses} relative`}
							>
								<ShoppingCart
									aria-hidden="true"
									size={24}
								/>
								{cartItemCount > 0 && (
									<span className="absolute top-0 right-0 -mt-1 -mr-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary-green text-xs font-bold text-white">
										{cartItemCount}
									</span>
								)}
								<span className="sr-only">Open cart</span>
							</Button>
						</div>

						{/* Auth Buttons / Profile Dropdown */}
						<div className="hidden md:block">{renderAuthButtons()}</div>

						{/* Mobile Menu Button */}
						<div className="md:hidden">
							<button
								onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
								className={`${linkClasses} inline-flex items-center justify-center p-2 rounded-md focus:outline-none`}
								aria-controls="mobile-menu"
								aria-expanded={mobileMenuOpen}
							>
								<span className="sr-only">
									{mobileMenuOpen ? "Close main menu" : "Open main menu"}
								</span>
								{mobileMenuOpen ? (
									<X
										className="block h-6 w-6"
										aria-hidden="true"
									/>
								) : (
									<Menu
										className="block h-6 w-6"
										aria-hidden="true"
									/>
								)}
							</button>
						</div>
					</div>
				</div>
			</nav>

			{/* Mobile Menu */}
			<AnimatePresence>
				{mobileMenuOpen && (
					<motion.div
						id="mobile-menu"
						initial={{ opacity: 0, y: -20 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -20 }}
						className="md:hidden bg-accent-light-beige/95 backdrop-blur-sm"
					>
						<div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
							{renderMobileNavLinks()}
							<div className="border-t border-gray-200 pt-4 pb-3">
								<div className="px-2 space-y-3">
									{/* Store Status - Mobile */}
									<div className="flex items-center justify-center py-2">
										<StoreStatusIndicator 
											scrolled={true} 
											isHomePage={false}
											mobileMenuOpen={true}
										/>
									</div>
									<Button
										variant="ghost"
										onClick={(e) => {
											handleCartClick(e);
											setMobileMenuOpen(false);
										}}
										className="w-full justify-start text-accent-dark-brown relative"
									>
										<ShoppingCart
											aria-hidden="true"
											size={20}
											className="mr-3"
										/>
										<span>Cart</span>
										{cartItemCount > 0 && (
											<span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary-green text-xs font-bold text-white">
												{cartItemCount}
											</span>
										)}
									</Button>
									<Button
										onClick={() => {
											navigate("/menu");
											setMobileMenuOpen(false);
										}}
										className="w-full bg-accent-warm-brown text-white hover:bg-accent-warm-brown/90"
									>
										Order Now
									</Button>
									<div className="w-full">
										{renderAuthButtons()}
									</div>
								</div>
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</header>
	);
};

export default Navbar;
