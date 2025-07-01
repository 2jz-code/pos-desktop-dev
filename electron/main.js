const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");
const sound = require("sound-play");

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
	app.quit();
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;
let customerWindow;

const createMainWindow = () => {
	// ... (existing code)
};

// ... (existing code for customer window)

ipcMain.handle("play-notification-sound", async (event, soundFile) => {
	try {
		// Determine the full path to the sound file.
		// We expect sound files to be in the `public/sounds` directory.
		const soundName = soundFile || "notification.wav"; // Default sound
		const soundPath = path.join(
			app.getAppPath(),
			"dist", // The 'public' folder is copied to 'dist' on build
			"sounds",
			soundName
		);

		console.log(`[IPC] Attempting to play sound: ${soundPath}`);
		await sound.play(soundPath);
		return { success: true };
	} catch (error) {
		console.error("[IPC] Error playing sound:", error);
		return { success: false, error: error.message };
	}
});

app.on("ready", async () => {
	// ... (existing code)
});

// ... (existing code)
