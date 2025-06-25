// desktop-combined/electron-app/src/store/slices/userSlice.js

export const createUserSlice = (set) => ({
	currentUser: null,
	setCurrentUser: (user) => set({ currentUser: user }),
});
