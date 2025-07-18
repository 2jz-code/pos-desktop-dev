import { crashReporter } from 'electron';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export function initializeCrashReporter() {
    if (process.env.NODE_ENV === 'production') {
        crashReporter.start({
            productName: 'Ajeen POS',
            companyName: 'Bake Ajeen',
            submitURL: 'https://api.bakeajeen.com/crash-reports',
            uploadToServer: true,
            extra: {
                version: app.getVersion(),
                platform: process.platform,
                arch: process.arch,
            }
        });
    }
}

export function logError(error, context = '') {
    const errorLog = {
        timestamp: new Date().toISOString(),
        error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
        },
        context,
        version: app.getVersion(),
        platform: process.platform,
    };

    // Write to local log file
    const logPath = path.join(app.getPath('userData'), 'errors.log');
    fs.appendFileSync(logPath, JSON.stringify(errorLog) + '\n');

    // In production, also send to remote logging service
    if (process.env.NODE_ENV === 'production') {
        // Send to your logging service
        console.error('Error logged:', errorLog);
    }
}

export function setupProcessErrorHandlers() {
    process.on('uncaughtException', (error) => {
        logError(error, 'uncaughtException');
        console.error('Uncaught Exception:', error);
    });

    process.on('unhandledRejection', (reason, promise) => {
        const error = new Error(`Unhandled Rejection at Promise: ${reason}`);
        logError(error, 'unhandledRejection');
        console.error('Unhandled Rejection:', reason);
    });
}